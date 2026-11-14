"use server";
import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { allow } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hashReviewInvitationToken, REVIEW_INVITE_COOKIE } from "@/lib/review-invitations";
import { visitorId } from "@/lib/visitor";
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp } from "@/lib/rate-limit";
import { formValues } from "@/lib/form";
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
  const vid = await visitorId(true); if (!vid) return;
  if (!(await allow("share", 20, 60, vid))) return;
  // Un partage compté par visiteur et par canal (index unique) : le compteur ne peut plus être gonflé en boucle.
  const { error } = await supabaseAdmin().from("product_shares").insert({ product_id: productId, channel: channel.slice(0, 20), visitor_id: vid });
  if (error && error.code !== "23505") console.error("[share]", error.message);
}

const commentSchema = z.object({ productId: uuid, slug: z.string().max(120), name: z.string().trim().min(2, "Indiquez votre nom.").max(80), body: z.string().trim().min(3, "Votre commentaire est trop court.").max(1500), parentId: uuid.optional().or(z.literal("")) });
export async function addComment(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "Merci, votre commentaire sera publié après vérification." };
  const parsed = commentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.", values: formValues(form) };
  if (!(await allow("comment", 5, 600))) return { ok: false, message: "Vous avez envoyé plusieurs commentaires récemment. Réessayez dans quelques minutes.", values: formValues(form) };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { ok: false, message: "La vérification anti-robot a échoué.", values: formValues(form) };
  const db = supabaseAdmin();
  const { data: p } = await db.from("products").select("id, allow_comments").eq("id", parsed.data.productId).eq("status", "published").maybeSingle();
  if (!p || !p.allow_comments) return { ok: false, message: "Les commentaires sont fermés pour ce produit.", values: formValues(form) };
  if (parsed.data.parentId) {
    const { data: parent } = await db.from("product_comments").select("id").eq("id", parsed.data.parentId).eq("product_id", p.id).eq("status", "approved").is("parent_id", null).maybeSingle();
    if (!parent) return { ok: false, message: "Le commentaire auquel vous répondez n'existe plus.", values: formValues(form) };
  }
  const { error } = await db.from("product_comments").insert({ product_id: p.id, parent_id: parsed.data.parentId || null, author_name: parsed.data.name, body: parsed.data.body, status: "pending" });
  if (error) return { ok: false, message: "Votre commentaire n'a pas pu être enregistré.", values: formValues(form) };
  return { ok: true, message: "Merci, votre commentaire sera publié après vérification." };
}

const reviewSchema = z.object({ productId: uuid, name: z.string().trim().min(2, "Indiquez votre nom.").max(80), rating: z.coerce.number().int().min(1, "Choisissez une note.").max(5), body: z.string().trim().min(10, "Votre avis est trop court (10 caractères minimum).").max(2000) });
export async function addReview(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "Merci, votre avis sera publié après vérification." };
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.", values: formValues(form) };
  const vid = await visitorId(true); if (!vid) return { ok: false, message: "Session indisponible.", values: formValues(form) };
  if (!(await allow("review", 3, 3600, vid))) return { ok: false, message: "Trop d'avis envoyés. Réessayez plus tard.", values: formValues(form) };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { ok: false, message: "La vérification anti-robot a échoué.", values: formValues(form) };
  const db = supabaseAdmin();
  const { data: p } = await db.from("products").select("id, allow_reviews").eq("id", parsed.data.productId).eq("status", "published").maybeSingle();
  if (!p || !p.allow_reviews) return { ok: false, message: "Les avis sont fermés pour ce produit.", values: formValues(form) };

  const cookieStore = await cookies();
  const invitationToken = cookieStore.get(REVIEW_INVITE_COOKIE)?.value ?? "";
  let invitationId: string | null = null;
  let verifiedPurchase = false;

  if (/^[a-f0-9]{64}$/i.test(invitationToken)) {
    const { data: invitation } = await db.from("review_invitations")
      .select("id,order_id,product_id,expires_at,sent_at,completed_at")
      .eq("token_hash", hashReviewInvitationToken(invitationToken))
      .maybeSingle();
    if (
      invitation &&
      invitation.sent_at &&
      !invitation.completed_at &&
      invitation.product_id === p.id &&
      (!invitation.expires_at || new Date(invitation.expires_at) > new Date())
    ) {
      const { data: invitedOrder } = await db.from("orders").select("id,status").eq("id", invitation.order_id).maybeSingle();
      if (invitedOrder?.status === "paid") {
        invitationId = invitation.id;
        verifiedPurchase = true;
      }
    }
  }

  if (!verifiedPurchase) {
    const { data: paidOrders } = await db.from("orders").select("id").eq("visitor_id", vid).eq("status", "paid").order("paid_at", { ascending: false }).limit(100);
    const orderIds = (paidOrders ?? []).map((order) => order.id);
    if (orderIds.length) {
      const { data: boughtItem } = await db.from("order_items").select("id").eq("product_id", p.id).in("order_id", orderIds).limit(1).maybeSingle();
      verifiedPurchase = Boolean(boughtItem);
    }
  }

  const { error } = await db.from("product_reviews").insert({
    product_id: p.id,
    visitor_id: vid,
    verified_purchase: verifiedPurchase,
    author_name: parsed.data.name,
    rating: parsed.data.rating,
    body: parsed.data.body,
    status: "pending",
  });
  if (error?.code === "23505") {
    if (invitationId) await db.from("review_invitations").update({ completed_at: new Date().toISOString(), processing_at: null }).eq("id", invitationId);
    cookieStore.delete(REVIEW_INVITE_COOKIE);
    return { ok: false, message: "Vous avez déjà donné votre avis sur ce produit.", values: formValues(form) };
  }
  if (error) return { ok: false, message: "Votre avis n'a pas pu être enregistré.", values: formValues(form) };

  if (invitationId) {
    const { error: invitationError } = await db.from("review_invitations")
      .update({ completed_at: new Date().toISOString(), processing_at: null, last_error: null })
      .eq("id", invitationId)
      .is("completed_at", null);
    if (invitationError) console.error("[reviews] invitation non clôturée", invitationId, invitationError.message);
    cookieStore.delete(REVIEW_INVITE_COOKIE);
  }

  return { ok: true, message: verifiedPurchase ? "Merci, votre avis a bien été enregistré. Votre achat sera signalé comme vérifié après modération." : "Merci, votre avis sera publié après vérification." };
}
