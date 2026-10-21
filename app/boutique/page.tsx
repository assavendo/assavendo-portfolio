import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublishedProducts } from "@/lib/data";
import { eur } from "@/lib/types";

export const metadata: Metadata = { title: "Boutique", description: "Modèles, outils et services Assavendo, à acheter en ligne en paiement sécurisé.", alternates: { canonical: "/boutique" } };
export const revalidate = 60;

export default async function Boutique() {
  const products = await getPublishedProducts();
  return (
    <div className="section"><div className="wrap">
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Boutique</h1>
      <p className="muted">Des produits conçus par Assavendo, avec aperçu et essai avant achat lorsque c'est possible.</p>
      {products.length === 0 ? <div className="empty"><h2 style={{ fontSize: "1.5rem" }}>La boutique ouvre bientôt</h2><p>Nous ne mettons en vente que des produits terminés, testés et livrables. Le premier est en préparation. Dites-nous ce qui vous serait utile.</p><Link className="btn btn-primary" href="/contact?sujet=Id%C3%A9e%20de%20produit">Proposer un besoin</Link></div> : (
        <div className="cards">{products.map((p) => (
          <article className="card" key={p.id}>
            <div className="card-media">{p.images[0] ? <Image src={p.images[0].url} alt={p.images[0].alt || p.title} fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 400px" unoptimized style={{ objectFit: "contain", objectPosition: "center" }} /> : <div className="cover-fallback" aria-hidden="true">{p.title}</div>}</div>
            <div className="card-body"><h3><Link href={`/boutique/${p.slug}`}>{p.title}</Link></h3><p>{p.summary}</p><div className="card-foot"><span className="price">{p.price_cents ? eur(p.price_cents) : "Gratuit"}</span></div></div>
          </article>
        ))}</div>
      )}
    </div></div>
  );
}
