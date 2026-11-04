import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";
import { alertOrderProblem, firstRow, sendCartOrderEmail, sendOrderEmail, type FulfilRow } from "@/lib/orders";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Règles : signature vérifiée sur le corps brut ; traitement idempotent (fulfil_order verrouille la commande) ;
 * l'événement n'est marqué « traité » QU'APRÈS succès réel. Toute anomalie récupérable répond 500 : Stripe rejoue l'événement.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET; const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try { event = new Stripe(key).webhooks.constructEvent(raw, sig, secret); }
  catch { return NextResponse.json({ error: "Signature invalide" }, { status: 400 }); }

  const db = supabaseAdmin();
  try {
    const { data: seen, error: seenErr } = await db.from("stripe_events").select("event_id").eq("event_id", event.id).maybeSingle();
    if (seenErr) throw seenErr;
    if (seen) return NextResponse.json({ received: true, duplicate: true });

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status === "paid") await fulfil(db, s, event.created);
    } else if (event.type === "checkout.session.expired") {
      const s = event.data.object as Stripe.Checkout.Session;
      const id = s.metadata?.orderId;
      const q = db.from("orders").update({ status: "canceled" }).eq("status", "pending");
      const { data: gone, error } = await (id && UUID.test(id) ? q.eq("id", id) : q.eq("stripe_session_id", s.id)).select("id");
      if (error) throw error;
      // le stock réservé par une commande à lignes est rendu (sans effet pour une ancienne commande)
      for (const o of gone ?? []) { const { error: re } = await db.rpc("release_order_stock", { p_order_id: o.id }); if (re) throw re; }
    } else if (event.type === "charge.refunded") {
      const c = event.data.object as Stripe.Charge;
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
      if (pi && c.refunded) {
        const { data: refunded, error } = await db.from("orders").update({ status: "refunded", download_token: null }).eq("payment_intent_id", pi).select("id");
        if (error) throw error;
        const ids = (refunded ?? []).map((o) => o.id);
        if (ids.length) { const { error: ie } = await db.from("order_items").update({ download_token: null }).in("order_id", ids); if (ie) throw ie; }
      }
    }
    const { error: recErr } = await db.from("stripe_events").upsert({ event_id: event.id, event_type: event.type }, { onConflict: "event_id", ignoreDuplicates: true });
    if (recErr) throw recErr;
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", event.type, event.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Traitement échoué, nouvelle tentative attendue" }, { status: 500 });
  }
}

async function fulfil(db: ReturnType<typeof supabaseAdmin>, s: Stripe.Checkout.Session, created: number) {
  let orderId = s.metadata?.orderId ?? s.client_reference_id ?? null;
  if (!orderId || !UUID.test(orderId)) {
    const { data, error } = await db.from("orders").select("id").eq("stripe_session_id", s.id).maybeSingle();
    if (error) throw error;
    orderId = data?.id ?? null;
  }
  if (!orderId) throw new Error(`Aucune commande pour la session ${s.id} : événement rejoué par Stripe`);
  const { data: ord, error: ordErr } = await db.from("orders").select("product_id").eq("id", orderId).maybeSingle();
  if (ordErr) throw ordErr;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const ex = s as unknown as { collected_information?: { shipping_details?: unknown }; shipping_details?: unknown };
  const billing = s.customer_details ? { name: s.customer_details.name ?? null, address: s.customer_details.address ?? null, tax_ids: s.customer_details.tax_ids ?? null } : null;
  const isCart = Boolean(ord) && ord!.product_id === null;
  const { data, error } = await db.rpc(isCart ? "fulfil_cart_order" : "fulfil_order", {
    p_order_id: orderId, p_session_id: s.id, p_amount: s.amount_total ?? -1, p_currency: s.currency ?? "", p_payment_intent: pi,
    p_email: s.customer_details?.email ?? s.customer_email ?? "", p_paid_at: new Date(created * 1000).toISOString(),
    p_shipping: ex.collected_information?.shipping_details ?? ex.shipping_details ?? null, p_billing: billing, p_ttl_days: 30,
  });
  if (error) throw error;
  const r = firstRow<FulfilRow>(data);
  if (!r || r.result === "not_found") throw new Error(`Commande ${orderId} introuvable : événement rejoué par Stripe`);
  if (r.result === "mismatch") { await alertOrderProblem(orderId, "Montant ou devise différents de la commande : aucun lien de téléchargement n'a été émis. Vérifiez le paiement dans Stripe."); return; }
  if (r.result === "ignored") return;
  if (!r.email_sent && !(await (isCart ? sendCartOrderEmail(db, r.order_id) : sendOrderEmail(db, r)))) throw new Error("E-mail de confirmation non envoyé : événement rejoué par Stripe");
}
