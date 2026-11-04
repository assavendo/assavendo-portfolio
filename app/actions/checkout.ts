"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { allow, clientIp } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { visitorId } from "@/lib/visitor";
import { hashIp } from "@/lib/privacy";
import { TERMS_VERSION } from "@/lib/legal";
import { verifyTurnstile } from "@/lib/turnstile";
import { firstRow, sendCartOrderEmail } from "@/lib/orders";
import { readCart, writeCart } from "@/lib/cart";
import { formValues } from "@/lib/form";
import type { FormState } from "./contact";

const schema = z.object({
  email: z.string().trim().email("Cette adresse e-mail semble invalide.").max(320),
  terms: z.literal("on", { error: "Acceptez les conditions de vente pour continuer." }),
  waiver: z.string().optional(),
});
/** Pays de livraison proposés pour les produits physiques (marchés ouverts à la livraison : table public.markets). */
const SHIP_TO = ["FR", "BE", "LU", "CH", "DE", "ES", "IT", "NL", "PT"] as const;
type CartOrderRow = { order_id: string | null; amount_cents: number; subtotal_cents: number; shipping_cents: number; has_physical: boolean; items: { product_id: string; title: string; variant_label: string | null; unit_price_cents: number; qty: number; kind: string; image: string | null }[]; error: string | null };

export async function startCartCheckout(_: FormState, form: FormData): Promise<FormState> {
  const keep = () => formValues(form);
  if (String(form.get("website") ?? "") !== "") return { ok: false, message: "Demande refusée." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.", values: keep() };
  const lines = await readCart();
  if (!lines.length) redirect("/panier");
  if (!(await allow("checkout", 8, 600))) return { ok: false, message: "Trop de tentatives. Réessayez dans quelques minutes.", values: keep() };
  const ip = await clientIp();
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) return { ok: false, message: "La vérification anti-robot a échoué. Réessayez.", values: keep() };

  const email = parsed.data.email.toLowerCase();
  const db = supabaseAdmin();
  // 1. Commande + réservation du stock + prix : une seule opération atomique en base (rien n'est créé si une règle échoue).
  const { data, error } = await db.rpc("create_cart_order", {
    p_lines: lines, p_email: email, p_visitor: await visitorId(true), p_terms: TERMS_VERSION, p_waiver: parsed.data.waiver === "on", p_ip_hash: hashIp(ip),
  });
  if (error) { console.error("[checkout] commande", error.message); return { ok: false, message: "Le service est momentanément indisponible. Aucun paiement n'a été demandé. Réessayez dans un instant.", values: keep() }; }
  const order = firstRow<CartOrderRow>(data);
  if (!order || !order.order_id) return { ok: false, message: order?.error ?? "La commande n'a pas pu être créée.", values: keep() };

  // 2. Commande gratuite : finalisation directe, sans Stripe.
  if (order.amount_cents === 0) {
    const { data: f, error: fe } = await db.rpc("fulfil_cart_order", { p_order_id: order.order_id, p_session_id: null, p_amount: 0, p_currency: "eur", p_payment_intent: null, p_email: email, p_paid_at: new Date().toISOString(), p_shipping: null, p_billing: null, p_ttl_days: 30 });
    const r = firstRow<{ result: string }>(f);
    if (fe || !r || (r.result !== "fulfilled" && r.result !== "already")) { console.error("[checkout] gratuit", fe?.message ?? r?.result); return { ok: false, message: "Nous n'avons pas pu finaliser votre commande. Réessayez dans un instant.", values: keep() }; }
    await writeCart([]);
    const sent = await sendCartOrderEmail(db, order.order_id);
    return { ok: true, message: sent ? "C'est fait : consultez votre boîte e-mail (pensez aux courriers indésirables)." : "Votre commande est enregistrée mais l'e-mail n'a pas pu partir. Écrivez-nous et nous vous l'enverrons." };
  }

  // 3. Commande payante : session Stripe liée à la commande (clé d'idempotence = identifiant de commande).
  const cancel = async (why: string) => {
    console.error("[checkout] Stripe", why);
    await db.rpc("release_order_stock", { p_order_id: order.order_id });
    await db.from("orders").update({ status: "canceled" }).eq("id", order.order_id);
    return { ok: false, message: "Le paiement n'a pas pu être lancé. Aucun montant n'a été prélevé. Réessayez dans un instant.", values: keep() } as FormState;
  };
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    await db.rpc("release_order_stock", { p_order_id: order.order_id }); await db.from("orders").update({ status: "canceled" }).eq("id", order.order_id);
    return { ok: false, message: "Le paiement n'est pas encore activé sur ce site." };
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const taxOn = process.env.STRIPE_TAX_ENABLED === "true";
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.filter((i) => i.unit_price_cents > 0).map((i) => ({
    quantity: i.qty,
    price_data: { currency: "eur", unit_amount: i.unit_price_cents, tax_behavior: "inclusive", product_data: { name: i.variant_label ? `${i.title} (${i.variant_label})` : i.title, ...(i.image?.startsWith("https://") ? { images: [i.image] } : {}) } },
  }));
  if (order.shipping_cents > 0) line_items.push({ quantity: 1, price_data: { currency: "eur", unit_amount: order.shipping_cents, tax_behavior: "inclusive", product_data: { name: "Livraison" } } });
  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: email, client_reference_id: order.order_id, locale: "fr",
      billing_address_collection: "required",
      ...(order.has_physical ? { shipping_address_collection: { allowed_countries: [...SHIP_TO] } } : {}),
      invoice_creation: { enabled: true },
      automatic_tax: { enabled: taxOn },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,   // la réservation de stock dure 35 minutes : la session expire avant
      line_items,
      metadata: { orderId: order.order_id },
      payment_intent_data: { metadata: { orderId: order.order_id } },
      success_url: `${siteUrl}/paiement/retour?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/commande?paiement=annule`,
    }, { idempotencyKey: `checkout-${order.order_id}` });
    url = session.url;
    if (!url) throw new Error("URL de paiement absente");
    const { error: ue } = await db.from("orders").update({ stripe_session_id: session.id }).eq("id", order.order_id);
    if (ue) console.error("[checkout] session non liée (le webhook retrouvera la commande par son identifiant)", order.order_id, ue.message);
  } catch (e) { return cancel(e instanceof Error ? e.message : String(e)); }
  redirect(url);
}
