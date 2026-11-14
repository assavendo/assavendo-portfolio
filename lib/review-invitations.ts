import { createHash, randomBytes } from "node:crypto";
import { sendEmail, esc, isEmailConfigured } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";

export const REVIEW_INVITE_COOKIE = "assavendo_review_invite";
export const REVIEW_INVITE_TTL_DAYS = 30;

export function createReviewInvitationToken(): string {
  return randomBytes(32).toString("hex");
}
export function hashReviewInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
type InvitationRow = { id: string; order_id: string; product_id: string; eligible_at: string; attempts: number };

export async function sendDueReviewInvitations(limit = 20): Promise<{ prepared: number; sent: number; skipped: number; failed: number }> {
  const db = supabaseAdmin();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  await db.from("review_invitations").update({ processing_at: null }).is("sent_at", null).is("completed_at", null).lt("processing_at", staleBefore);
  const { data: due, error } = await db.from("review_invitations").select("id,order_id,product_id,eligible_at,attempts")
    .lte("eligible_at", now.toISOString()).is("sent_at", null).is("completed_at", null).is("processing_at", null).lt("attempts", 8)
    .order("eligible_at", { ascending: true }).limit(limit);
  if (error) throw error;
  let sent = 0; let skipped = 0; let failed = 0;
  for (const candidate of (due ?? []) as InvitationRow[]) {
    const token = createReviewInvitationToken();
    const tokenHash = hashReviewInvitationToken(token);
    const { data: claimed, error: claimError } = await db.from("review_invitations").update({
      token_hash: tokenHash, processing_at: now.toISOString(), attempts: candidate.attempts + 1, last_error: null,
    }).eq("id", candidate.id).is("sent_at", null).is("completed_at", null).is("processing_at", null).select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    const [{ data: order, error: orderError }, { data: product, error: productError }] = await Promise.all([
      db.from("orders").select("status,customer_email,visitor_id").eq("id", candidate.order_id).maybeSingle(),
      db.from("products").select("slug,title,status,allow_reviews").eq("id", candidate.product_id).maybeSingle(),
    ]);
    if (orderError || productError) {
      const message = orderError?.message ?? productError?.message ?? "Données de campagne indisponibles.";
      await db.from("review_invitations").update({ processing_at: null, last_error: message }).eq("id", candidate.id);
      failed++; continue;
    }
    if (!order || order.status !== "paid" || !order.customer_email || !product || product.status !== "published" || !product.allow_reviews) {
      await db.from("review_invitations").update({ completed_at: now.toISOString(), processing_at: null, last_error: null }).eq("id", candidate.id);
      skipped++; continue;
    }
    if (order.visitor_id) {
      const { data: existingReview } = await db.from("product_reviews").select("id").eq("product_id", candidate.product_id).eq("visitor_id", order.visitor_id).maybeSingle();
      if (existingReview) {
        await db.from("review_invitations").update({ completed_at: now.toISOString(), processing_at: null, last_error: null }).eq("id", candidate.id);
        skipped++; continue;
      }
    }
    if (!isEmailConfigured()) {
      await db.from("review_invitations").update({ processing_at: null, last_error: "Service email non configuré." }).eq("id", candidate.id);
      failed++; continue;
    }
    const link = siteUrl + "/api/reviews/invite?token=" + encodeURIComponent(token);
    const html = "<p>Merci pour votre commande chez Assavendo.</p>"
      + "<p>Vous avez eu le temps de découvrir <strong>" + esc(product.title) + "</strong>. Votre retour nous aiderait à améliorer le produit et à guider les prochains acheteurs.</p>"
      + "<p><a href=\"" + link + "\" style=\"display:inline-block;padding:.7rem 1rem;background:#0b3c5d;color:#fff;text-decoration:none;border-radius:.4rem\">Donner mon avis</a></p>"
      + "<p>Le lien est personnel et valable " + REVIEW_INVITE_TTL_DAYS + " jours. Votre avis sera relu avant publication et le badge « Achat vérifié » sera appliqué lorsque l’achat est confirmé.</p>"
      + "<p>Assavendo</p>";
    const ok = await sendEmail({ to: order.customer_email, subject: "Votre avis sur " + product.title, html });
    if (!ok) {
      await db.from("review_invitations").update({ processing_at: null, last_error: "Envoi de l’invitation échoué." }).eq("id", candidate.id);
      failed++; continue;
    }
    const { error: sentError } = await db.from("review_invitations").update({
      sent_at: now.toISOString(), expires_at: new Date(now.getTime() + REVIEW_INVITE_TTL_DAYS * 86_400_000).toISOString(), processing_at: null, last_error: null,
    }).eq("id", candidate.id);
    if (sentError) { failed++; continue; }
    sent++;
  }
  return { prepared: due?.length ?? 0, sent, skipped, failed };
}