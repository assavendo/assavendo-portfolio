"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { allow } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { visitorId } from "@/lib/visitor";
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp } from "@/lib/rate-limit";
import type { FormState } from "./contact";

const uuid = z.string().uuid();

export async function toggleLike(productId: string, slug: string): Promise<{ liked: boolean } | { error: string }> {
  if (!uuid.safeParse(productId).success) return { error: "Produit invalide." };
  const vid = await visitorId(true); if (!vid) return { error: "Session indisponible." };
  if (!(await allow("like", 30, 60, vid))) return { error: "Trop d'actions rapprochées." };
  const db = supabaseAdmin();
  const { data: p } = await db.from("products").select("id").eq("id", productId).eq("status", "published").maybeSingle();
  if (!p) return { error: "Produit indisponible." };
  const { data: existing } = await db.from("product_likes").select("product_id").eq("product_id", productId).eq("visitor_id", vid).maybeSingle();
  if (existing) await db.from("product_likes").delete().eq("product_id", productId).eq("visitor_id", vid);
  else await db.from("product_likes").insert({ product_id: productId, visitor_id: vid });
  revalidatePath(`/boutique/${slug}`);
  return { liked: !existing };
}

export async function trackShare(productId: string, channel: string) {
  if (!uuid.safeParse(productId).success) return;
  if (!(await allow("share", 20, 60))) return;
  await supabaseAdmin().from("product_shares").insert({ product_id: productId, channel: channel.slice(0, 20) });
}

const commentSchema = z.object({ productId: uuid, slug: z.string().max(120), name: z.string().trim().min(2, "Indiquez votre nom.").max(80), body: z.string().trim().min(3, "Votre commentaire est trop court.").max(1500), parentId: uuid.optional().or(z.literal("")) });
export async function addComment(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "Merci, votre commentaire sera publié après vérification." };
  const parsed = commentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire." };
  if (!(await allow("comment", 5, 600))) return { ok: false, message: "Vous avez envoyé plusieurs commentaires récemment. Réessayez dans quelques minutes." };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { ok: false, message: "La vérification anti-robot a échoué." };
  const db = supabaseAdmin();
  const { data: p } = await db.from("products").select("id, allow_comments").eq("id", parsed.data.productId).eq("status", "published").maybeSingle();
  if (!p || !p.allow_comments) return { ok: false, message: "Les commentaires sont fermés pour ce produit." };
  const { error } = await db.from("product_comments").insert({ product_id: p.id, parent_id: parsed.data.parentId || null, author_name: parsed.data.name, body: parsed.data.body, status: "pending" });
  if (error) return { ok: false, message: "Votre commentaire n'a pas pu être enregistré." };
  return { ok: true, message: "Merci, votre commentaire sera publié après vérification." };
}

const reviewSchema = z.object({ productId: uuid, name: z.string().trim().min(2, "Indiquez votre nom.").max(80), rating: z.coerce.number().int().min(1, "Choisissez une note.").max(5), body: z.string().trim().min(10, "Votre avis est trop court (10 caractères minimum).").max(2000) });
export async function addReview(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "Merci, votre avis sera publié après vérification." };
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire." };
  const vid = await visitorId(true); if (!vid) return { ok: false, message: "Session indisponible." };
  if (!(await allow("review", 3, 3600, vid))) return { ok: false, message: "Trop d'avis envoyés. Réessayez plus tard." };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { ok: false, message: "La vérification anti-robot a échoué." };
  const db = supabaseAdmin();
  const { data: p } = await db.from("products").select("id, allow_reviews").eq("id", parsed.data.productId).eq("status", "published").maybeSingle();
  if (!p || !p.allow_reviews) return { ok: false, message: "Les avis sont fermés pour ce produit." };
  const { error } = await db.from("product_reviews").insert({ product_id: p.id, visitor_id: vid, author_name: parsed.data.name, rating: parsed.data.rating, body: parsed.data.body, status: "pending" });
  if (error?.code === "23505") return { ok: false, message: "Vous avez déjà donné votre avis sur ce produit." };
  if (error) return { ok: false, message: "Votre avis n'a pas pu être enregistré." };
  return { ok: true, message: "Merci, votre avis sera publié après vérification." };
}
