import { requireAdmin } from "@/lib/admin";
import { processReturn } from "@/app/actions/admin";
import { RETURN_REASONS, RETURN_STATUS } from "@/lib/returns";

type Row = { id: string; status: string; reason: string; details: string; admin_note: string; email: string; created_at: string; order_items: { title: string; qty: number } | null; orders: { order_number: string | null } | null };
export default async function Retours() {
  const { sb } = await requireAdmin();
  const { data, error } = await sb.from("return_requests").select("id, status, reason, details, admin_note, email, created_at, order_items(title, qty), orders(order_number)").order("created_at", { ascending: false }).limit(200);
  if (error) return <div><h1 style={{ fontSize: "1.8rem" }}>Retours</h1><p className="alert alert-err" role="alert">Lecture impossible : {error.message}. La migration « espace client » est-elle appliquée ?</p></div>;
  const rows = (data ?? []) as unknown as Row[];
  return <div><h1 style={{ fontSize: "1.8rem" }}>Retours</h1>
    {rows.length === 0 ? <p className="panel">Aucune demande de retour.</p> : <ul className="plain">{rows.map((r) => (
      <li key={r.id} className="panel" style={{ marginBottom: "1rem" }}>
        <strong>{r.orders?.order_number}</strong> — {r.order_items?.qty} × {r.order_items?.title} — {r.email} — <b>{RETURN_STATUS[r.status]}</b> <span className="muted small">({new Date(r.created_at).toLocaleDateString("fr-FR")})</span><br />
        Motif : {RETURN_REASONS[r.reason]}{r.details ? <> — « {r.details} »</> : null}
        <form action={processReturn} className="form-grid" style={{ marginTop: ".6rem" }}>
          <input type="hidden" name="id" value={r.id} />
          <label className="field">Décision<select className="input" name="status" defaultValue={r.status === "requested" ? "approved" : r.status}><option value="approved">Accepter</option><option value="refused">Refuser</option><option value="received">Colis reçu</option><option value="refunded">Remboursé (fait dans Stripe)</option></select></label>
          <label className="field">Message au client<input className="input" name="admin_note" defaultValue={r.admin_note} /></label>
          <label className="full"><input type="checkbox" name="restock" /> Remettre l&apos;article en stock (si « colis reçu » et article revendable)</label>
          <div className="full"><button className="btn btn-ghost btn-sm">Enregistrer</button></div>
        </form>
      </li>))}</ul>}
    <p className="muted small">Le remboursement s&apos;effectue dans le tableau de bord Stripe ; le statut de la commande se met à jour automatiquement.</p></div>;
}
