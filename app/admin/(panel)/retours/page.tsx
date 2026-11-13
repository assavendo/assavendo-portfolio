import { requireAdmin } from "@/lib/admin";
import { processReturn } from "@/app/actions/admin";
import { RETURN_REASONS, RETURN_STATUS } from "@/lib/returns";

type Row = { id: string; status: string; reason: string; details: string; admin_note: string; email: string; created_at: string; order_items: { title: string; qty: number } | null; orders: { order_number: string | null } | null };
const NEXT_STATUS: Record<string, string[]> = {
  requested: ["approved", "refused"],
  approved: ["received", "refused", "refunded"],
  received: ["refunded"],
  refused: [],
  refunded: [],
};

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
          <label className="field">Décision<select className="input" name="status" defaultValue={NEXT_STATUS[r.status]?.[0] ?? r.status} disabled={!NEXT_STATUS[r.status]?.length}>
            {NEXT_STATUS[r.status]?.map((s) => <option key={s} value={s}>{s === "approved" ? "Accepter" : s === "refused" ? "Refuser" : s === "received" ? "Colis reçu" : "Remboursé (fait dans Stripe)"}</option>)}
            {!NEXT_STATUS[r.status]?.length ? <option value={r.status}>{RETURN_STATUS[r.status]}</option> : null}
          </select></label>
          <label className="field">Message au client<input className="input" name="admin_note" defaultValue={r.admin_note} /></label>
          {(r.status === "approved") ? <label className="full"><input type="checkbox" name="restock" /> Remettre l&apos;article en stock si « colis reçu » et article revendable</label> : null}
          <div className="full"><button className="btn btn-ghost btn-sm">Enregistrer</button></div>
        </form>
      </li>))}</ul>}
    <p className="muted small">Le remboursement s&apos;effectue dans le tableau de bord Stripe ; le statut de la commande se met à jour automatiquement.</p></div>;
}
