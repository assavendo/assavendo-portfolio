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
import { firstRow, sendOrderEmail, type FulfilRow } from "@/lib/orders";
import { formValues } from "@/lib/form";
import type { FormState } from "./contact";

const schema = z.object({
  productId: z.string().uuid(),
  email: z.string().trim().email("Cette adresse e-mail semble invalide.").max(320),
  terms: z.literal("on", { error: "Acceptez les conditions de vente pour continuer." }),
  waiver: z.string().optional(),
});
/** Pays de livraison proposés pour les produits physiques. */
const SHIP_TO = ["FR", "BE", "LU", "CH", "DE", "ES", "IT", "NL", "PT"] as const;

export async function startCheckout(_: FormState, form: FormData): Promise<FormState> {
  const keep = () => formValues(form);
  if (String(form.get("website") ?? "") !== "") return { ok: false, message: "Demande refusée." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.", values: keep() };
  if (!(await allow("checkout", 8, 600))) return { ok: false, message: "Trop de tentatives. Réessayez dans quelques minutes.", values: keep() };
  const ip = await clientIp();
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) return { ok: false, message: "La vérification anti-robot a échoué. Réessayez.", values: keep() };

  const db = supabaseAdmin();
  const { data: p, error: pErr } = await db.from("products").select("id, slug, title, summary, kind, price_cents, images").eq("id", parsed.data.productId).eq("status", "published").maybeSingle();
  if (pErr) { console.error("[checkout] produit", pErr.message); return { ok: false, message: "Le service est momentanément indisponible. Réessayez dans un instant.", values: keep() }; }
  if (!p) return { ok: false, message: "Ce produit n'est plus disponible.", values: keep() };
  const free = p.price_cents === 0;
  if (!free && p.price_cents < 50) return { ok: false, message: "Ce produit n'est pas vendu en ligne.", values: keep() };
  if (!free && (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)) return { ok: false, message: "Le paiement n'est pas encore activé sur ce site." };
  const digitalPaid = p.kind === "digital" && !free;
  if (digitalPaid && parsed.data.waiver !== "on") return { ok: false, message: "Confirmez que vous demandez la livraison immédiate du contenu numérique et renoncez au droit de rétractation.", values: keep() };

  const email = parsed.data.email.toLowerCase();
  const vid = await visitorId(true);

  // 1. La commande existe AVANT la session de paiement : le webhook la retrouvera toujours.
  const { data: order, error: oErr } = await db.from("orders").insert({
    product_id: p.id, customer_email: email, amount_cents: p.price_cents, currency: "eur", status: "pending", visitor_id: vid,
    consent_terms_version: TERMS_VERSION, consent_at: new Date().toISOString(), consent_digital_waiver: digitalPaid && parsed.data.waiver === "on", consent_ip_hash: hashIp(ip),
  }).select("id").single();
  if (oErr || !order) { console.error("[checkout] commande non créée", oErr?.message); return { ok: false, message: "La commande n'a pas pu être enregistrée. Aucun paiement n'a été demandé. Réessayez dans un instant.", values: keep() }; }

  // 2. Produit gratuit : livraison directe par e-mail, sans Stripe.
  if (free) {
    const { data, error } = await db.rpc("fulfil_order", { p_order_id: order.id, p_session_id: null, p_amount: 0, p_currency: "eur", p_payment_intent: null, p_email: email, p_paid_at: new Date().toISOString(), p_shipping: null, p_billing: null, p_ttl_days: 30 });
    const r = firstRow<FulfilRow>(data);
    if (error || !r || (r.result !== "fulfilled" && r.result !== "already")) { console.error("[checkout] gratuit", error?.message ?? r?.result); return { ok: false, message: "Nous n'avons pas pu finaliser votre demande. Réessayez dans un instant.", values: keep() }; }
    const sent = await sendOrderEmail(db, r);
    return { ok: true, message: sent ? "C'est fait : consultez votre boîte e-mail pour le lien de téléchargement (pensez aux courriers indésirables)." : "Votre demande est enregistrée mais l'e-mail n'a pas pu partir. Écrivez-nous et nous vous l'enverrons." };
  }

  // 3. Produit payant : session Stripe liée à la commande (clé d'idempotence = identifiant de commande).
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const image = (p.images as { url: string }[])[0]?.url;
  const taxOn = process.env.STRIPE_TAX_ENABLED === "true";
  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: email, client_reference_id: order.id, locale: "fr",
      billing_address_collection: "required",
      ...(p.kind === "physical" ? { shipping_address_collection: { allowed_countries: [...SHIP_TO] } } : {}),
      invoice_creation: { enabled: true },
      automatic_tax: { enabled: taxOn },
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: p.price_cents, tax_behavior: "inclusive", product_data: { name: p.title, description: p.summary.slice(0, 300), ...(image?.startsWith("https://") ? { images: [image] } : {}) } } }],
      metadata: { orderId: order.id, productId: p.id, productSlug: p.slug },
      payment_intent_data: { metadata: { orderId: order.id } },
      success_url: `${siteUrl}/paiement/retour?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/boutique/${p.slug}?paiement=annule`,
    }, { idempotencyKey: `checkout-${order.id}` });
    url = session.url;
    if (!url) throw new Error("URL de paiement absente");
    const { error } = await db.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    if (error) console.error("[checkout] session non liée (le webhook retrouvera la commande par son identifiant)", order.id, error.message);
  } catch (e) {
    console.error("[checkout] Stripe", e instanceof Error ? e.message : e);
    const { error } = await db.from("orders").update({ status: "canceled" }).eq("id", order.id);
    if (error) console.error("[checkout] annulation de commande", error.message);
    return { ok: false, message: "Le paiement n'a pas pu être lancé. Aucun montant n'a été prélevé. Réessayez dans un instant.", values: keep() };
  }
  redirect(url);
}
