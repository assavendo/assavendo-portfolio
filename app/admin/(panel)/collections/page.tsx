import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { deleteCollection, saveCollection } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

type CollectionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  sort: number;
};

export default async function AdminCollections({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const [collectionsResult, itemsResult, productsResult] = await Promise.all([
    sb.from("collections").select("id,slug,title,description,status,sort").order("sort").order("title"),
    sb.from("collection_items").select("collection_id,product_id,sort").order("sort"),
    sb.from("products").select("id,title,price_cents,status").eq("status", "published").order("title").limit(500),
  ]);
  const collections = (collectionsResult.data ?? []) as CollectionRow[];
  const items = itemsResult.data ?? [];
  const products = productsResult.data ?? [];
  const selected = new Map<string, Set<string>>();
  for (const item of items) {
    if (!selected.has(item.collection_id)) selected.set(item.collection_id, new Set());
    selected.get(item.collection_id)!.add(item.product_id);
  }
  const message = sp.ok ? { text: sp.ok, kind: "ok" } : sp.erreur ? { text: sp.erreur, kind: "error" } : null;

  return (
    <div>
      <p><Link href="/admin">← Tableau de bord</Link></p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", marginBottom: ".25rem" }}>Collections éditoriales</h1>
          <p className="muted">Créez des sélections thématiques et choisissez précisément leurs produits publiés.</p>
        </div>
        <span className="badge">{collections.length} collection{collections.length > 1 ? "s" : ""}</span>
      </div>

      {message ? <p className={message.kind === "error" ? "notice error" : "notice"} role="status">{message.text}</p> : null}

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginTop: 0 }}>Nouvelle collection</h2>
        <form action={saveCollection} className="form-grid">
          <label className="field">Nom<input className="input" name="title" maxLength={120} required /></label>
          <label className="field">Slug (facultatif)<input className="input" name="slug" maxLength={80} /></label>
          <label className="field full">Description<textarea className="input" name="description" maxLength={1000} style={{ minHeight: 90 }} /></label>
          <label className="field">Statut<select className="input" name="status" defaultValue="draft"><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label>
          <label className="field">Ordre<input className="input" type="number" min="0" max="100000" name="sort" defaultValue="10" /></label>
          <fieldset className="field full">
            <legend><strong>Produits publiés</strong></legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: ".45rem .8rem" }}>
              {products.map((p) => <label key={p.id} style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}><input type="checkbox" name="product_ids" value={p.id} /> <span>{p.title}</span></label>)}
            </div>
            {!products.length ? <p className="muted">Aucun produit publié disponible.</p> : null}
          </fieldset>
          <button className="btn btn-primary" type="submit">Créer la collection</button>
        </form>
      </section>

      {collections.map((collection) => {
        const current = selected.get(collection.id) ?? new Set<string>();
        return (
          <section className="panel" style={{ marginTop: "1rem" }} key={collection.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
              <div><h2 style={{ margin: 0, fontSize: "1.25rem" }}>{collection.title}</h2><p className="muted small">/{collection.slug} · {current.size} produit{current.size > 1 ? "s" : ""}</p></div>
              <span className="status s-{collection.status}">{collection.status === "published" ? "Publié" : collection.status === "archived" ? "Archivé" : "Brouillon"}</span>
            </div>
            <form action={saveCollection} className="form-grid" style={{ marginTop: ".75rem" }}>
              <input type="hidden" name="id" value={collection.id} />
              <label className="field">Nom<input className="input" name="title" maxLength={120} defaultValue={collection.title} required /></label>
              <label className="field">Slug<input className="input" name="slug" maxLength={80} defaultValue={collection.slug} required /></label>
              <label className="field full">Description<textarea className="input" name="description" maxLength={1000} style={{ minHeight: 90 }} defaultValue={collection.description} /></label>
              <label className="field">Statut<select className="input" name="status" defaultValue={collection.status}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label>
              <label className="field">Ordre<input className="input" type="number" min="0" max="100000" name="sort" defaultValue={collection.sort} /></label>
              <fieldset className="field full">
                <legend><strong>Produits publiés</strong></legend>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: ".45rem .8rem" }}>
                  {products.map((p) => <label key={p.id} style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}><input type="checkbox" name="product_ids" value={p.id} defaultChecked={current.has(p.id)} /> <span>{p.title}</span></label>)}
                </div>
              </fieldset>
              <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                <button className="btn btn-primary" type="submit">Enregistrer</button>
                <Link className="btn btn-ghost btn-sm" href={"/collections/" + collection.slug} target="_blank" rel="noreferrer">Voir la collection</Link>
              </div>
            </form>
            <form action={deleteCollection} style={{ marginTop: ".6rem" }}>
              <input type="hidden" name="id" value={collection.id} />
              <button className="btn btn-ghost btn-sm" type="submit">Supprimer la collection</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
