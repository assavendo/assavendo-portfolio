import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedCollections } from "@/lib/collections";

export const metadata: Metadata = {
  title: "Collections",
  description: "Sélections éditoriales de produits Assavendo.",
  alternates: { canonical: "/collections" },
};
export const revalidate = 60;

export default async function CollectionsPage() {
  const collections = await getPublishedCollections();
  return (
    <div className="wrap section">
      <nav className="crumbs" aria-label="Fil d'Ariane">
        <ol><li><Link href="/">Accueil</Link></li><li><span aria-current="page">Collections</span></li></ol>
      </nav>
      <header style={{ maxWidth: 820 }}>
        <p className="eyebrow">Sélections Assavendo</p>
        <h1>Collections éditoriales</h1>
        <p className="lead">Des sélections thématiques pour découvrir plus rapidement les produits qui vont ensemble.</p>
      </header>
      {!collections.length ? (
        <div className="empty panel" style={{ marginTop: "1.5rem" }}>
          <p>Aucune collection publiée pour le moment.</p>
        </div>
      ) : (
        <div className="cards pgrid" style={{ marginTop: "1.5rem" }}>
          {collections.map((collection) => (
            <article className="card" key={collection.id}>
              <div className="card-body">
                <p className="eyebrow">Collection</p>
                <h2 style={{ marginTop: 0 }}>{collection.title}</h2>
                <p>{collection.description || "Une sélection de produits Assavendo."}</p>
                <Link className="btn btn-secondary btn-sm" href={"/collections/" + collection.slug}>Voir la sélection</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
