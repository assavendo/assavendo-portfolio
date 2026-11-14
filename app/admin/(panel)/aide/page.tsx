import { requireAdmin } from "@/lib/admin";
import { saveHelpArticle, deleteHelpArticle } from "@/app/actions/support";

export const dynamic = "force-dynamic";

export default async function AdminHelp({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string; id?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const { data: articles } = await sb.from("help_articles").select("*").order("sort").order("title");
  const current = sp.id ? (articles ?? []).find((a) => a.id === sp.id) : null;
  return <div>
    <h1 style={{ fontSize:"1.8rem" }}>Centre d'aide</h1>
    {sp.ok ? <p className="alert alert-ok" role="status">{sp.ok}</p> : null}
    {sp.erreur ? <p className="alert alert-err" role="alert">{sp.erreur}</p> : null}
    <section className="panel">
      <h2 style={{ fontSize:"1.2rem" }}>{current ? "Modifier l'article" : "Nouvel article"}</h2>
      <form action={saveHelpArticle} className="form-grid">
        <input type="hidden" name="id" value={current?.id ?? ""} />
        <label className="field">Titre<input className="input" name="title" required maxLength={160} defaultValue={current?.title ?? ""} /></label>
        <label className="field">Slug<input className="input" name="slug" maxLength={120} placeholder="laissez vide pour générer" defaultValue={current?.slug ?? ""} /></label>
        <label className="field">Catégorie<input className="input" name="category" required maxLength={80} defaultValue={current?.category ?? "Général"} /></label>
        <label className="field">Ordre<input className="input" name="sort" type="number" min={0} max={100000} defaultValue={current?.sort ?? 100} /></label>
        <label className="field full">Résumé<textarea className="input" name="summary" maxLength={500} rows={2} defaultValue={current?.summary ?? ""} /></label>
        <label className="field full">Contenu<textarea className="input" name="content" required minLength={20} maxLength={20000} rows={14} defaultValue={current?.content ?? ""} /></label>
        <label className="field">Statut<select className="input" name="status" defaultValue={current?.status ?? "draft"}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label>
        <div className="full"><button className="btn btn-primary">{current ? "Enregistrer" : "Créer"}</button>{current ? <a className="btn btn-ghost btn-sm" href="/admin/aide">Nouvel article</a> : null}</div>
      </form>
    </section>
    <section>
      <h2 style={{ fontSize:"1.3rem", marginTop:"1.5rem" }}>Articles ({articles?.length ?? 0})</h2>
      {(articles ?? []).map((article) => <article className="panel" key={article.id}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:".5rem", flexWrap:"wrap" }}>
          <div><strong>{article.title}</strong><p className="muted small">{article.category} · {article.status} · /aide/{article.slug}</p></div>
          <div style={{ display:"flex", gap:".4rem" }}><a className="btn btn-ghost btn-sm" href={`/admin/aide?id=${article.id}`}>Modifier</a><a className="btn btn-ghost btn-sm" href={`/aide/${article.slug}`}>Voir</a><form action={deleteHelpArticle}><input type="hidden" name="id" value={article.id}/><button className="btn btn-ghost btn-sm">Supprimer</button></form></div>
        </div>
        <p>{article.summary}</p>
      </article>)}
    </section>
  </div>;
}
