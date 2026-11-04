import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { eur } from "@/lib/types";

export const metadata: Metadata = { title: "Suivi de commande", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { pending: "En attente de paiement", paid: "Payée", canceled: "Annulée", refunded: "Remboursée" };
const FULFIL: Record<string, string> = { none: "", to_prepare: "À préparer", preparing: "En préparation", shipped: "Expédiée", delivered: "Livrée" };

/** Suivi d'une commande par lien personnel (jeton aléatoire de 64 caractères reçu par e-mail). Aucun compte requis. */
export default async function Suivi({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token) || !process.env.SUPABASE_SECRET_KEY) notFound();
  const db = supabaseAdmin();
  const { data: o } = await db.from("orders").select("id, order_number, status, fulfilment, tracking_number, tracking_url, amount_cents, subtotal_cents, shipping_cents, created_at, paid_at").eq("access_token", token).maybeSingle();
  if (!o) notFound();
  const { data: items } = await db.from("order_items").select("title, variant_label, qty, unit_price_cents, kind, download_token, download_count, download_max, expires_at").eq("order_id", o.id).order("created_at");
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.6rem)" }}>Commande {o.order_number}</h1>
      <p><strong>{STATUS[o.status] ?? o.status}</strong>{o.fulfilment && o.fulfilment !== "none" && o.status === "paid" ? ` · ${FULFIL[o.fulfilment]}` : ""} <span className="muted">· passée le {d(o.created_at)}</span></p>
      {o.status === "pending" ? <p className="alert alert-err" role="status">Le paiement n&apos;a pas encore été confirmé. S&apos;il a abouti, cette page se mettra à jour dans quelques minutes.</p> : null}
      {o.tracking_number || o.tracking_url ? <p>Suivi du colis : {o.tracking_url ? <a href={o.tracking_url} target="_blank" rel="noopener noreferrer">{o.tracking_number ?? "Suivre le colis"}</a> : o.tracking_number}</p> : null}
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Article</th><th>Qté</th><th>Total</th></tr></thead><tbody>
        {(items ?? []).map((i, k) => <tr key={k}><td>{i.title}{i.variant_label ? ` (${i.variant_label})` : ""}
          {o.status === "paid" && i.download_token ? <><br /><a href={`/api/download/${i.download_token}`}>Télécharger le fichier</a> <span className="muted small">({i.download_count}/{i.download_max} utilisés{i.expires_at ? `, jusqu'au ${d(i.expires_at)}` : ""})</span></> : null}</td><td>{i.qty}</td><td>{i.unit_price_cents ? eur(i.unit_price_cents * i.qty) : "Gratuit"}</td></tr>)}
      </tbody></table></div>
      <p style={{ marginTop: "1rem" }}>{o.shipping_cents ? <>Livraison : {eur(o.shipping_cents)}<br /></> : null}<strong>Total TTC : {eur(o.amount_cents)}</strong></p>
      <p className="muted small">Ce lien est personnel : ne le partagez pas. Une question, un retour à demander ? <Link href={`/contact?sujet=${encodeURIComponent("Commande " + o.order_number)}`}>Écrivez-nous</Link> en rappelant le numéro de commande.</p>
    </div></div>
  );
}
