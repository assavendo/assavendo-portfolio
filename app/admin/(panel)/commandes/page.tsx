import { requireAdmin } from "@/lib/admin";
import { eur } from "@/lib/types";
import { renewDownload, resolveOrderReview, revokeDownload, updateFulfilment } from "@/app/actions/admin";

type Row = { id: string; product_id: string | null; customer_email: string; amount_cents: number; status: string; created_at: string; paid_at: string | null; download_count: number; download_max: number; expires_at: string | null; download_token: string | null; email_sent_at: string | null; needs_review: boolean; review_note: string | null; consent_digital_waiver: boolean; products: { title: string; kind: string } | null; order_number: string | null; fulfilment: string; tracking_number: string | null; tracking_url: string | null; shipping: { name?: string; address?: Record<string, string | null> } | null; order_items: { title: string; qty: number; variant_label: string | null; kind: string; download_token: string | null }[] };
const label: Record<string, string> = { pending: "En attente", paid: "Payée", canceled: "Annulée", refunded: "Remboursée" };
const titleOf = (o: Row) => (o.order_items?.length ? o.order_items.map((i) => `${i.qty} × ${i.title}${i.variant_label ? ` (${i.variant_label})` : ""}`).join(", ") : o.products?.title ?? "Produit supprimé");
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");

export default async function Commandes() {
  const { sb } = await requireAdmin();
  let { data, error } = await sb.from("orders")
    .select("id, product_id, customer_email, amount_cents, status, created_at, paid_at, download_count, download_max, expires_at, download_token, email_sent_at, needs_review, review_note, consent_digital_waiver, order_number, fulfilment, tracking_number, tracking_url, shipping, products(title, kind), order_items(title, qty, variant_label, kind, download_token)")
    .order("created_at", { ascending: false }).limit(200);
  if (error) {   // migration « panier » pas encore appliquée : l'ancienne lecture reste possible
    const old = await sb.from("orders").select("id, product_id, customer_email, amount_cents, status, created_at, paid_at, download_count, download_max, expires_at, download_token, email_sent_at, needs_review, review_note, consent_digital_waiver, products(title, kind)").order("created_at", { ascending: false }).limit(200);
    data = old.data as never; error = old.error;
  }
  if (error) return <div><h1 style={{ fontSize: "1.8rem" }}>Commandes</h1><p className="alert alert-err" role="alert">Lecture impossible : {error.message}</p></div>;
  const rows = (data ?? []) as unknown as Row[];
  const hourAgo = Date.now() - 36e5;
  // Rapprochement : ce qui demande une action humaine
  const toCheck = rows.filter((o) => o.needs_review || (o.status === "paid" && !o.email_sent_at) || (o.status === "pending" && new Date(o.created_at).getTime() < hourAgo));
  return <div><h1 style={{ fontSize: "1.8rem" }}>Commandes</h1>
    <section className="panel" aria-labelledby="a-verifier" style={{ marginBottom: "1.5rem" }}>
      <h2 id="a-verifier" style={{ fontSize: "1.2rem" }}>À vérifier ({toCheck.length})</h2>
      <p className="muted small">Paiements dont la confirmation n'a pas été envoyée, montants inattendus, commandes restées en attente depuis plus d'une heure. Comparez avec le tableau de bord Stripe.</p>
      {toCheck.length === 0 ? <p>Rien à traiter : chaque paiement a sa livraison confirmée.</p> : <ul className="plain">{toCheck.map((o) => (
        <li key={o.id} style={{ padding: ".6rem 0", borderTop: "1px solid var(--line, #dde3ea)" }}>
          <strong>{o.order_number ? `${o.order_number} · ` : ""}{titleOf(o)}</strong> — {o.customer_email} — {eur(o.amount_cents)} — {label[o.status]} ({day(o.created_at)})
          <br /><span className="muted small">{o.review_note ?? (o.status === "pending" ? "Paiement jamais confirmé : session abandonnée ou événement Stripe perdu." : "Confirmation par e-mail non envoyée.")}</span>
          <div style={{ display: "flex", gap: ".5rem", marginTop: ".4rem", flexWrap: "wrap" }}>
            {o.status === "paid" && (o.product_id !== null || o.order_items?.some((i) => i.kind === "digital")) ? <form action={renewDownload}><input type="hidden" name="id" value={o.id} /><button className="btn btn-ghost btn-sm">Émettre un nouveau lien</button></form> : null}
            {o.needs_review ? <form action={resolveOrderReview}><input type="hidden" name="id" value={o.id} /><button className="btn btn-ghost btn-sm">Marquer comme traité</button></form> : null}
          </div>
        </li>))}</ul>}
    </section>
    {(() => { const ship = rows.filter((o) => o.status === "paid" && o.order_items?.some((i) => i.kind === "physical") && o.fulfilment !== "delivered"); return (
    <section className="panel" aria-labelledby="a-expedier" style={{ marginBottom: "1.5rem" }}>
      <h2 id="a-expedier" style={{ fontSize: "1.2rem" }}>À expédier ({ship.length})</h2>
      {ship.length === 0 ? <p>Aucun colis en attente.</p> : <ul className="plain">{ship.map((o) => (
        <li key={o.id} style={{ padding: ".7rem 0", borderTop: "1px solid var(--line, #dde3ea)" }}>
          <strong>{o.order_number}</strong> — {o.customer_email} — {titleOf(o)}<br />
          <span className="muted small">{o.shipping?.name ? `${o.shipping.name}, ` : ""}{[o.shipping?.address?.line1, o.shipping?.address?.line2, o.shipping?.address?.postal_code, o.shipping?.address?.city, o.shipping?.address?.country].filter(Boolean).join(" ")}</span>
          <form action={updateFulfilment} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".4rem", alignItems: "end" }}>
            <input type="hidden" name="id" value={o.id} />
            <label className="field">État<select className="input" name="fulfilment" defaultValue={o.fulfilment === "none" ? "to_prepare" : o.fulfilment}><option value="to_prepare">À préparer</option><option value="preparing">En préparation</option><option value="shipped">Expédiée</option><option value="delivered">Livrée</option></select></label>
            <label className="field">N° de suivi<input className="input" name="tracking_number" defaultValue={o.tracking_number ?? ""} /></label>
            <label className="field">Lien de suivi (https)<input className="input" name="tracking_url" defaultValue={o.tracking_url ?? ""} /></label>
            <button className="btn btn-ghost btn-sm">Enregistrer</button>
          </form>
        </li>))}</ul>}
    </section>); })()}
    {rows.length === 0 ? <p className="panel">Aucune commande.</p> : <div className="table-scroll"><table className="tbl"><thead><tr><th>Date</th><th>Produit</th><th>Client</th><th>Montant</th><th>Statut</th><th>Téléchargements</th><th>Expire</th><th>Lien</th></tr></thead><tbody>
      {rows.map((o) => <tr key={o.id}><td>{day(o.created_at)}</td><td>{o.order_number ? <><b>{o.order_number}</b><br /></> : null}{titleOf(o)}</td><td>{o.customer_email}</td><td>{eur(o.amount_cents)}</td><td>{label[o.status]}</td><td>{o.product_id ? String(o.download_count) + "/" + String(o.download_max) : o.order_items?.some((i) => i.kind === "digital") ? "Par fichier" : "—"}</td><td>{day(o.expires_at)}</td>
        <td>{o.download_token || o.order_items?.some((i) => i.download_token) ? <form action={revokeDownload}><input type="hidden" name="id" value={o.id} /><button className="btn btn-ghost btn-sm">Révoquer</button></form> : "—"}</td></tr>)}</tbody></table></div>}
    <p className="muted small" style={{ marginTop: "1rem" }}>Les remboursements se font dans le tableau de bord Stripe ; le statut se met à jour automatiquement et le lien est désactivé.</p></div>;
}
