import { NextResponse } from "next/server";
import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { esc, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";

export const runtime = "nodejs";

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
  const { data: seen } = await db.from("stripe_events").select("event_id").eq("event_id", event.id).maybeSingle();
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status === "paid") {
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
        const { data: order } = await db.from("orders").select("id, product_id, customer_email, download_token").eq("stripe_session_id", s.id).maybeSingle();
        if (order) {
          const email = s.customer_details?.email ?? order.customer_email;
          const token = randomBytes(24).toString("base64url");
          const { data: updated } = await db.from("orders").update({ status: "paid", paid_at: new Date(event.created * 1000).toISOString(), payment_intent_id: pi, customer_email: email, download_token: token })
            .eq("id", order.id).is("download_token", null).select("id").maybeSingle();
          if (updated) {
            const { data: p } = await db.from("products").select("title").eq("id", order.product_id).maybeSingle();
            const { data: d } = await db.from("product_deliverables").select("product_id").eq("product_id", order.product_id).maybeSingle();
            await sendEmail({ to: email, subject: `Votre achat : ${p?.title ?? "Assavendo"}`, html: `<p>Merci pour votre achat de <strong>${esc(p?.title ?? "")}</strong>.</p>${d ? `<p><a href="${siteUrl}/api/download/${token}">Télécharger votre fichier</a> (5 téléchargements maximum).</p>` : "<p>Nous vous contactons très bientôt pour la suite.</p>"}<p>Assavendo</p>` });
          }
        }
      }
    } else if (event.type === "checkout.session.expired") {
      const s = event.data.object as Stripe.Checkout.Session;
      await db.from("orders").update({ status: "canceled" }).eq("stripe_session_id", s.id).eq("status", "pending");
    } else if (event.type === "charge.refunded") {
      const c = event.data.object as Stripe.Charge;
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
      if (pi && c.refunded) await db.from("orders").update({ status: "refunded", download_token: null }).eq("payment_intent_id", pi);
    }
    await db.from("stripe_events").upsert({ event_id: event.id, event_type: event.type }, { onConflict: "event_id", ignoreDuplicates: true });
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", event.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Traitement échoué, nouvelle tentative attendue" }, { status: 500 });
  }
}
