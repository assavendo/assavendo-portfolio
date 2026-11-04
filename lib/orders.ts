import { esc, isEmailConfigured, notifyOwner, sendEmail } from "./email";
import { siteUrl } from "./env";
import type { supabaseAdmin } from "./supabase/server";

type Db = ReturnType<typeof supabaseAdmin>;
export type FulfilRow = { result: "fulfilled" | "already" | "mismatch" | "ignored" | "not_found"; order_id: string; download_token: string | null; customer_email: string | null; product_id?: string | null; email_sent: boolean };

/** Lit la première ligne renvoyée par une fonction SQL « returns table ». */
export const firstRow = <T,>(data: unknown): T | null => (Array.isArray(data) ? ((data[0] as T) ?? null) : ((data as T) ?? null));

/**
 * Envoie la confirmation d'achat (avec le lien de téléchargement si le produit comporte un fichier) et l'enregistre.
 * Retourne true quand il n'y a plus rien à retenter ; false si l'envoi a échoué et doit être repris (le webhook répond alors 500).
 */
export async function sendOrderEmail(db: Db, o: { order_id: string; download_token?: string | null; customer_email: string | null; product_id?: string | null }): Promise<boolean> {
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

/**
 * Confirmation d'une commande à lignes : récapitulatif, numéro, lien de téléchargement par fichier, information de livraison.
 * Même contrat que sendOrderEmail : true = plus rien à retenter, false = à reprendre.
 */
export async function sendCartOrderEmail(db: Db, orderId: string): Promise<boolean> {
  const { data: o } = await db.from("orders").select("id, order_number, customer_email, amount_cents, subtotal_cents, shipping_cents, expires_at, access_token, fulfilment").eq("id", orderId).maybeSingle();
  if (!o || !o.customer_email) return true;
  if (!isEmailConfigured()) {
    await db.from("orders").update({ needs_review: true, review_note: "E-mail de confirmation non envoyé : service d'e-mail non configuré." }).eq("id", orderId);
    return true;
  }
  const { data: items } = await db.from("order_items").select("title, variant_label, qty, unit_price_cents, kind, download_token, download_max").eq("order_id", orderId).order("created_at");
  const eur = (c: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(c / 100);
  const rows = (items ?? []).map((i) => `<tr><td>${esc(i.title)}${i.variant_label ? ` (${esc(i.variant_label)})` : ""}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${i.unit_price_cents ? eur(i.unit_price_cents * i.qty) : "Gratuit"}</td></tr>`).join("");
  const downloads = (items ?? []).filter((i) => i.download_token).map((i) => `<li><a href="${siteUrl}/api/download/${i.download_token}">Télécharger : ${esc(i.title)}</a> (${i.download_max} téléchargements maximum, lien valable 30 jours)</li>`).join("");
  const physical = (items ?? []).some((i) => i.kind === "physical");
  const html = `<p>Merci pour votre confiance.</p><p>Votre commande <strong>${esc(o.order_number ?? "")}</strong> est confirmée.</p>
<table style="border-collapse:collapse;width:100%" cellpadding="6"><thead><tr><th style="text-align:left">Article</th><th>Qté</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
<p>${o.shipping_cents ? `Livraison : ${eur(o.shipping_cents)}<br>` : ""}<strong>Total TTC : ${eur(o.amount_cents)}</strong></p>
${downloads ? `<p>Vos fichiers :</p><ul>${downloads}</ul><p>Ces liens sont personnels : conservez-les précieusement.</p>` : ""}
${physical ? "<p>Nous préparons l'expédition et vous écrivons dès que le colis est parti, avec le suivi.</p>" : ""}
<p>Suivre ma commande : <a href="${siteUrl}/commande/${o.access_token}">${siteUrl}/commande/${o.access_token}</a></p>
<p>Une question ? Répondez simplement à ce message.</p><p>Assavendo</p>`;
  const ok = await sendEmail({ to: o.customer_email, subject: `Votre commande ${o.order_number ?? ""}`.trim(), html });
  if (!ok) { console.error("[orders] e-mail de confirmation en échec", orderId); return false; }
  const { error } = await db.from("orders").update({ email_sent_at: new Date().toISOString() }).eq("id", orderId);
  if (error) console.error("[orders] email_sent_at non enregistré", orderId, error.message);
  return true;
}
