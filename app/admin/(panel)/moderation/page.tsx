import { requireAdmin } from "@/lib/admin";
import { moderate, replyAsOwner } from "@/app/actions/admin";

function Decision({ kind, id }: { kind: "comment" | "review"; id: string }) {
  return <form action={moderate} style={{ display: "flex", gap: ".5rem", marginTop: ".6rem" }}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
    <button name="decision" value="approved" className="btn btn-primary btn-sm">Publier</button><button name="decision" value="rejected" className="btn btn-ghost btn-sm">Refuser</button></form>;
}
export default async function Moderation() {
  const { sb } = await requireAdmin();
  const [c, r, approved] = await Promise.all([
    sb.from("product_comments").select("id, author_name, body, created_at, product_id, products(title)").eq("status", "pending").order("created_at"),
    sb.from("product_reviews").select("id, author_name, rating, body, created_at, products(title)").eq("status", "pending").order("created_at"),
    sb.from("product_comments").select("id, product_id, author_name, body, is_owner_reply, parent_id, products(title)").eq("status", "approved").eq("is_owner_reply", false).is("parent_id", null).order("created_at", { ascending: false }).limit(15),
  ]);
  return <div><h1 style={{ fontSize: "1.8rem" }}>Modération</h1>
    <h2>Avis en attente ({r.data?.length ?? 0})</h2>
    {(r.data ?? []).length === 0 ? <p className="muted">Rien à modérer.</p> : (r.data as any[]).map((x) => <div className="panel" key={x.id}><strong>{x.author_name}</strong> · {"★".repeat(x.rating)} · <span className="muted">{x.products?.title}</span><p>{x.body}</p><Decision kind="review" id={x.id} /></div>)}
    <h2>Commentaires en attente ({c.data?.length ?? 0})</h2>
    {(c.data ?? []).length === 0 ? <p className="muted">Rien à modérer.</p> : (c.data as any[]).map((x) => <div className="panel" key={x.id}><strong>{x.author_name}</strong> · <span className="muted">{x.products?.title}</span><p>{x.body}</p><Decision kind="comment" id={x.id} /></div>)}
    <h2>Répondre à un commentaire publié</h2>
    {(approved.data ?? []).map((x: any) => <div className="panel" key={x.id}><strong>{x.author_name}</strong> · <span className="muted">{x.products?.title}</span><p>{x.body}</p>
      <form action={replyAsOwner} style={{ display: "grid", gap: ".5rem" }}><input type="hidden" name="parent" value={x.id} /><input type="hidden" name="product" value={x.product_id} /><label className="field">Votre réponse<textarea className="input" name="body" required style={{ minHeight: 70 }} /></label><button className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }}>Répondre au nom d'Assavendo</button></form></div>)}</div>;
}
