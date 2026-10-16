import { requireAdmin } from "@/lib/admin";
import { setMessageStatus } from "@/app/actions/admin";
export default async function Messages() {
  const { sb } = await requireAdmin();
  const { data } = await sb.from("contact_messages").select("*").neq("status", "archived").order("created_at", { ascending: false }).limit(100);
  return <div><h1 style={{ fontSize: "1.8rem" }}>Messages</h1>
    {(data ?? []).length === 0 ? <p className="panel">Aucun message.</p> : data!.map((m) => <div className="panel" key={m.id}>
      <p><strong>{m.name}</strong> · <a href={`mailto:${m.email}`}>{m.email}</a> · <span className="muted">{new Date(m.created_at).toLocaleString("fr-FR")}</span> {m.status === "new" ? <span className="status s-draft">Nouveau</span> : null}</p>
      {m.project_type ? <p className="muted small">{m.project_type}</p> : null}<p style={{ whiteSpace: "pre-wrap" }}>{m.message}</p>
      <form action={setMessageStatus} style={{ display: "flex", gap: ".5rem" }}><input type="hidden" name="id" value={m.id} /><button name="status" value="read" className="btn btn-ghost btn-sm">Marquer comme lu</button><button name="status" value="archived" className="btn btn-ghost btn-sm">Archiver</button></form></div>)}</div>;
}
