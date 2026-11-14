import { requireAdmin } from "@/lib/admin";
import { replySupportTicketAsAdmin, updateSupportTicket } from "@/app/actions/support";

export const dynamic = "force-dynamic";
const STATUS: Record<string,string> = { open:"Ouvert", pending_customer:"En attente client", pending_assavendo:"En traitement", resolved:"Résolu", closed:"Fermé" };

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const { data: tickets } = await sb.from("support_tickets").select("*").order("last_message_at", { ascending:false }).limit(50);
  const ids = (tickets ?? []).map((t) => t.id);
  const { data: messages } = ids.length ? await sb.from("support_messages").select("id,ticket_id,author_type,author_name,body,created_at").in("ticket_id", ids).order("created_at") : { data: [] };
  return <div>
    <h1 style={{ fontSize:"1.8rem" }}>Support · tickets</h1>
    {sp.ok ? <p className="alert alert-ok" role="status">{sp.ok}</p> : null}
    {sp.erreur ? <p className="alert alert-err" role="alert">{sp.erreur}</p> : null}
    {!tickets?.length ? <p className="panel">Aucun ticket.</p> : null}
    {(tickets ?? []).map((ticket) => {
      const items = (messages ?? []).filter((m) => m.ticket_id === ticket.id);
      const publicTokenUnavailable = true;
      return <article className="panel" key={ticket.id} style={{ marginTop:"1rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:".7rem", flexWrap:"wrap" }}>
          <div><h2 style={{ fontSize:"1.15rem", margin:0 }}>{ticket.ticket_number} · {ticket.subject}</h2><p className="muted small">{ticket.name} · {ticket.email} · {ticket.category}{ticket.order_reference ? ` · commande ${ticket.order_reference}` : ""}</p></div>
          <span className="status s-draft">{STATUS[ticket.status] ?? ticket.status}</span>
        </div>
        <div style={{ marginTop:".8rem" }}>{items.map((message) => <div key={message.id} style={{ padding:".65rem 0", borderTop:"1px solid var(--line,#ddd)" }}><p className="small muted"><strong>{message.author_type === "admin" ? "Assavendo" : message.author_name}</strong> · {new Date(message.created_at).toLocaleString("fr-FR")}</p><p style={{ whiteSpace:"pre-wrap" }}>{message.body}</p></div>)}</div>
        <form action={replySupportTicketAsAdmin} className="form-grid" style={{ marginTop:".8rem" }}>
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <input type="hidden" name="token" value="" />
          <label className="field full">Répondre<textarea className="input" name="body" minLength={2} maxLength={5000} required placeholder="Réponse au client…" /></label>
          <label className="field">Après réponse<select className="input" name="status" defaultValue="pending_customer"><option value="pending_customer">Attendre le client</option><option value="resolved">Marquer résolu</option><option value="closed">Fermer</option></select></label>
          <div className="full"><button className="btn btn-primary">Envoyer la réponse</button></div>
        </form>
        <form action={updateSupportTicket} style={{ marginTop:".6rem", display:"flex", gap:".5rem", flexWrap:"wrap" }}>
          <input type="hidden" name="id" value={ticket.id} />
          <label className="field">Statut<select className="input" name="status" defaultValue={ticket.status}>{Object.entries(STATUS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="field">Priorité<select className="input" name="priority" defaultValue={ticket.priority}><option value="low">Faible</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option></select></label>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf:"end" }}>Enregistrer</button>
        </form>
      </article>;
    })}
  </div>;
}
