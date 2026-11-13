import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedCollectionBySlug } from "@/lib/collections";
import { getCatalog } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getPublishedCollectionBySlug(slug);
  if (!collection) return { title: "Collection introuvable" };
  return {
    title: collection.title,
    description: collection.description || ("Sélection éditoriale " + collection.title + "."),
    alternates: { canonical: "/collections/" + collection.slug },
  };
}

export default async function CollectionDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getPublishedCollectionBySlug(slug);
  if (!collection) notFound();
  const catalog = await getCatalog();

  return (
    <div className="wrap section">
      <nav className="crumbs" aria-label="Fil d'Ariane">
        <ol>
          <li><Link href="/">Accueil</Link></li>
          <li><Link href="/collections">Collections</Link></li>
          <li><span aria-current="page">{collection.title}</span></li>
        </ol>
      </nav>
      <header style={{ maxWidth: 860 }}>
        <p className="eyebrow">Collection éditoriale</p>
        <h1>{collection.title}</h1>
        <p className="lead">{collection.description || "Une sélection de produits Assavendo."}</p>
      </header>
      {!collection.products.length ? (
        <div className="empty panel" style={{ marginTop: "1.5rem" }}>
          <p>Cette collection ne contient actuellement aucun produit disponible.</p>
        </div>
      ) : (
        <div className="cards pgrid" style={{ marginTop: "1.5rem" }}>
          {collection.products.map((product) => (
            <ProductCard key={product.id} p={product} variants={catalog.variants} />
          ))}
        </div>
      )}
    </div>
  );
}
