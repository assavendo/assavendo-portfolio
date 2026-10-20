import { esc, isEmailConfigured, notifyOwner, sendEmail } from "./email";
import { siteUrl } from "./env";
import type { supabaseAdmin } from "./supabase/server";

type Db = ReturnType<typeof supabaseAdmin>;
export type FulfilRow = { result: "fulfilled" | "already" | "mismatch" | "ignored" | "not_found"; order_id: string; download_token: string | null; customer_email: string | null; product_id: string | null; email_sent: boolean };

/** Lit la première ligne renvoyée par une fonction SQL « returns table ». */
export const firstRow = <T,>(data: unknown): T | null => (Array.isArray(data) ? ((data[0] as T) ?? null) : ((data as T) ?? null));

/**
 * Envoie la confirmation d'achat (avec le lien de téléchargement si le produit comporte un fichier) et l'enregistre.
 * Retourne true quand il n'y a plus rien à retenter ; false si l'envoi a échoué et doit être repris (le webhook répond alors 500).
 */
export async function sendOrderEmail(db: Db, o: { order_id: string; download_token: string | null; customer_email: string | null; product_id: string | null }): Promise<boolean> {
  if (!o.customer_email) return true;
  if (!isEmailConfigured()) {
    await db.from("orders").update({ needs_review: true, review_note: "E-mail de confirmation non envoyé : service d'e-mail non configuré." }).eq("id", o.order_id);
    return true;
  }
  const { data: p } = await db.from("products").select("title, kind").eq("id", o.product_id ?? "").maybeSingle();
  const { data: d } = await db.from("product_deliverables").select("product_id").eq("product_id", o.product_id ?? "").maybeSingle();
  const { data: ord } = await db.from("orders").select("download_max, expires_at").eq("id", o.order_id).maybeSingle();
  const title = p?.title ?? "Assavendo";
  const until = ord?.expires_at ? new Date(ord.expires_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
  const body = d && o.download_token
    ? `<p><a href="${siteUrl}/api/download/${o.download_token}">Télécharger votre fichier</a></p><p>Ce lien est personnel : ${ord?.download_max ?? 5} téléchargements maximum${until ? `, valable jusqu'au ${until}` : ""}. Conservez-le précieusement.</p>`
    : p?.kind === "physical" ? "<p>Nous préparons l'expédition et vous écrivons dès que le colis est parti.</p>"
    : "<p>Nous vous contactons très bientôt pour organiser la suite.</p>";
  const ok = await sendEmail({ to: o.customer_email, subject: `Votre commande : ${title}`, html: `<p>Merci pour votre confiance.</p><p>Votre commande de <strong>${esc(title)}</strong> est confirmée.</p>${body}<p>Une question ? Répondez simplement à ce message.</p><p>Assavendo</p>` });
  if (!ok) { console.error("[orders] e-mail de confirmation en échec", o.order_id); return false; }
  const { error } = await db.from("orders").update({ email_sent_at: new Date().toISOString() }).eq("id", o.order_id);
  if (error) console.error("[orders] email_sent_at non enregistré", o.order_id, error.message);
  return true;
}

export async function alertOrderProblem(orderId: string, what: string): Promise<void> {
  await notifyOwner("Commande à vérifier", `<p>${esc(what)}</p><p>Commande : <code>${esc(orderId)}</code> — voir ${siteUrl}/admin/commandes</p>`);
}
