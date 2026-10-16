"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { allow } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { FormState } from "./contact";

const schema = z.object({ productId: z.string().uuid(), email: z.string().trim().email("Cette adresse e-mail semble invalide.").max(320) });

export async function startCheckout(_: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire." };
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return { ok: false, message: "Le paiement n'est pas encore activé sur ce site." };
  if (!(await allow("checkout", 8, 600))) return { ok: false, message: "Trop de tentatives. Réessayez dans quelques minutes." };
  const db = supabaseAdmin();
  const { data: p } = await db.from("products").select("id, slug, title, summary, price_cents, images").eq("id", parsed.data.productId).eq("status", "published").maybeSingle();
  if (!p) return { ok: false, message: "Ce produit n'est plus disponible." };
  if (p.price_cents < 50) return { ok: false, message: "Ce produit n'est pas vendu en ligne." };
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const email = parsed.data.email.toLowerCase();
  const image = (p.images as { url: string }[])[0]?.url;
  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer_email: email, client_reference_id: p.id,
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: p.price_cents, product_data: { name: p.title, description: p.summary.slice(0, 300), ...(image?.startsWith("https://") ? { images: [image] } : {}) } } }],
      metadata: { productId: p.id, productSlug: p.slug },
      success_url: `${siteUrl}/paiement/retour?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/boutique/${p.slug}?paiement=annule`,
    });
    url = session.url;
    if (!url) throw new Error("no url");
    await db.from("orders").insert({ product_id: p.id, stripe_session_id: session.id, customer_email: email, amount_cents: p.price_cents, status: "pending" });
  } catch { return { ok: false, message: "Le paiement n'a pas pu être lancé. Réessayez dans un instant." }; }
  redirect(url);
}
