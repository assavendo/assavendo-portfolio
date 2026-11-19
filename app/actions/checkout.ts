"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { allow, clientIp } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { visitorId } from "@/lib/visitor";
import { hashIp } from "@/lib/privacy";
import { TERMS_VERSION, missing as missingLegal } from "@/lib/legal";
import { verifyTurnstile } from "@/lib/turnstile";
import { firstRow, sendCartOrderEmail } from "@/lib/orders";
import { readCart, writeCart, loadCart } from "@/lib/cart";
import { revalidateCartShippingSelection } from "@/lib/dropship/logistics";
import { formValues } from "@/lib/form";
import type { FormState } from "./contact";

const schema = z.object({
  email: z.string().trim().email("Cette adresse e-mail semble invalide.").max(320),
  name: z.string().trim().min(2, "Indiquez le nom du destinataire.").max(120),
  line1: z.string().trim().min(3, "Indiquez l’adresse de livraison.").max(160),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  postal_code: z.string().trim().min(2, "Indiquez le code postal.").max(12),
  city: z.string().trim().min(1, "Indiquez la ville.").max(100),
  country: z.string().trim().regex(/^[A-Z]{2}$/, "Pays de livraison invalide."),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  shipping_method: z.string().trim().min(1, "Choisissez une méthode de livraison.").max(180),
  terms: z.literal("on", { error: "Acceptez les conditions de vente pour continuer." }),
  waiver: z.string().optional(),
});
/** Pays de livraison proposés pour les produits physiques (marchés ouverts à la livraison : table public.markets). */
type MarketRow = { code: string; sell_enabled: boolean; ship_enabled: boolean; tax_status: string; shipping_status: string; compliance_status: string; pricing_status: string; payment_status: string };
const MARKET_OK = new Set(["approved", "legacy"]);
async function sellableShippingCountries(db: ReturnType<typeof supabaseAdmin>): Promise<Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[]> {
  const { data, error } = await db.from("markets")
    .select("code,sell_enabled,ship_enabled,tax_status,shipping_status,compliance_status,pricing_status,payment_status");
  if (error) throw error;
  return ((data ?? []) as MarketRow[])
    .filter((m) => m.sell_enabled && m.ship_enabled && [m.tax_status, m.shipping_status, m.compliance_status, m.pricing_status, m.payment_status].every((s) => MARKET_OK.has(s)))
    .map((m) => m.code)
    .filter((code, i, all) => /^[A-Z]{2}$/.test(code) && all.indexOf(code) === i) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
}
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
  const cart = await loadCart(lines);
  let shippingCents = 0;
  let shippingPayload: Record<string, unknown> | null = null;
  let shippingQuote: Record<string, unknown> | null = null;
  let shippingMethodCode: string | null = null;
  let shippingMethodLabel: string | null = null;

  if (cart.hasPhysical) {
    const allowedCountries = await sellableShippingCountries(db);
    if (!allowedCountries.includes(parsed.data.country as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry)) {
      return { ok: false, message: "Cette destination n'est pas encore ouverte à la livraison.", values: keep() };
    }
    shippingPayload = {
      name: parsed.data.name,
      line1: parsed.data.line1,
      line2: parsed.data.line2 || null,
      postal_code: parsed.data.postal_code,
      city: parsed.data.city,
      country: parsed.data.country,
      phone: parsed.data.phone || null,
    };
    try {
      const selected = await revalidateCartShippingSelection(lines, parsed.data.country, parsed.data.shipping_method, shippingPayload);
      const required = new Map(selected.snapshot.providerOption.requirements.map((r) => [r.type, r]));
      const values: Record<string, string> = {
        phone: parsed.data.phone,
        zip: parsed.data.postal_code,
        city: parsed.data.city,
        province: "",
        recipientName: parsed.data.name,
        recipientAddress: parsed.data.line1 + (parsed.data.line2 ? " " + parsed.data.line2 : ""),
        email,
      };
      for (const type of required.keys()) {
        if (!values[type]?.trim()) return { ok: false, message: "Cette méthode exige votre " + type + ". Choisissez une autre méthode ou complétez le champ demandé.", values: keep() };
      }
      shippingCents = selected.priceCents;
      shippingMethodCode = selected.code;
      shippingMethodLabel = selected.label;
      shippingQuote = selected.snapshot as unknown as Record<string, unknown>;
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "La méthode de livraison n'est plus disponible.", values: keep() };
    }
  }

  const { data, error } = await db.rpc("create_cart_order", {
    p_lines: lines,
    p_email: email,
    p_visitor: await visitorId(true),
    p_terms: TERMS_VERSION,
    p_waiver: parsed.data.waiver === "on",
    p_ip_hash: hashIp(ip),
    p_shipping: shippingPayload,
    p_shipping_cents: cart.hasPhysical ? shippingCents : null,
    p_shipping_method_code: shippingMethodCode,
    p_shipping_method_label: shippingMethodLabel,
    p_shipping_quote: shippingQuote,
  });
  if (error) { console.error("[checkout] commande", error.message); return { ok: false, message: "Le service est momentanément indisponible. Aucun paiement n'a été demandé. Réessayez dans un instant.", values: keep() }; }
  const order = firstRow<CartOrderRow>(data);
  if (!order || !order.order_id) return { ok: false, message: order?.error ?? "La commande n'a pas pu être créée.", values: keep() };

  if (order.amount_cents === 0) {
    const { data: f, error: fe } = await db.rpc("fulfil_cart_order", { p_order_id: order.order_id, p_session_id: null, p_amount: 0, p_currency: "eur", p_payment_intent: null, p_email: email, p_paid_at: new Date().toISOString(), p_shipping: null, p_billing: null, p_ttl_days: 30 });
    const rr = firstRow<{ result: string }>(f);
    if (fe || !rr || (rr.result !== "fulfilled" && rr.result !== "already")) {
      console.error("[checkout] gratuit", fe?.message ?? rr?.result);
      return { ok: false, message: "Nous n'avons pas pu finaliser votre commande. Réessayez dans un instant.", values: keep() };
    }
    await writeCart([]);
    const sent = await sendCartOrderEmail(db, order.order_id);
    return { ok: true, message: sent ? "C'est fait : consultez votre boîte e-mail (pensez aux courriers indésirables)." : "Votre commande est enregistrée mais l'e-mail n'a pas pu partir. Écrivez-nous et nous vous l'enverrons." };
  }

  const cancel = async (why: string) => {
    console.error("[checkout] Stripe", why);
    await db.rpc("release_order_stock", { p_order_id: order.order_id });
    await db.from("orders").update({ status: "canceled" }).eq("id", order.order_id);
    return { ok: false, message: "Le paiement n'a pas pu être lancé. Aucun montant n'a été prélevé. Réessayez dans un instant.", values: keep() } as FormState;
  };
  if (missingLegal.length) {
    await db.rpc("release_order_stock", { p_order_id: order.order_id });
    await db.from("orders").update({ status: "canceled" }).eq("id", order.order_id);
    return { ok: false, message: "Les commandes ne sont pas encore ouvertes. Les informations légales du vendeur doivent être finalisées.", values: keep() };
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    await db.rpc("release_order_stock", { p_order_id: order.order_id });
    await db.from("orders").update({ status: "canceled" }).eq("id", order.order_id);
    return { ok: false, message: "Le paiement n'est pas encore activé sur ce site." };
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const taxOn = process.env.STRIPE_TAX_ENABLED === "true";
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.filter((i) => i.unit_price_cents > 0).map((i) => ({
    quantity: i.qty,
    price_data: { currency: "eur", unit_amount: i.unit_price_cents, tax_behavior: "inclusive", product_data: { name: i.variant_label ? i.title + " (" + i.variant_label + ")" : i.title } },
  }));
  if (order.shipping_cents > 0) line_items.push({ quantity: 1, price_data: { currency: "eur", unit_amount: order.shipping_cents, tax_behavior: "inclusive", product_data: { name: shippingMethodLabel ? "Livraison · " + shippingMethodLabel : "Livraison" } } });
  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted_page",
      mode: "payment",
      customer_email: email,
      client_reference_id: order.order_id,
      locale: "fr",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: taxOn },
      allow_promotion_codes: false,
      submit_type: "auto",
      name_collection: { individual: { enabled: false } },
      integration_identifier: "hosted_web_0002",
      origin_context: "web",
      invoice_creation: { enabled: true },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      line_items,
      metadata: { orderId: order.order_id, shippingMethod: shippingMethodCode ?? "" },
      payment_intent_data: { metadata: { orderId: order.order_id } },
      success_url: siteUrl + "/paiement/retour?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: siteUrl + "/commande?paiement=annule",
    }, { idempotencyKey: "checkout-" + order.order_id });
    url = session.url;
    if (!url) throw new Error("URL de paiement absente");
    const { error: ue } = await db.from("orders").update({ stripe_session_id: session.id }).eq("id", order.order_id);
    if (ue) throw new Error("La session Stripe n'a pas pu être associée à la commande.");
  } catch (e) { return cancel(e instanceof Error ? e.message : String(e)); }
  redirect(url);
}
