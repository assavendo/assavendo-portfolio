import type { Metadata } from "next";
import Link from "next/link";
import { getCatalog, childrenOf, countByCategory, families_ } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { siteUrl } from "@/lib/env";

export const revalidate = 60;
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function ShopHome() {
  const catalog = await getCatalog();
  const { products, categories, variants } = catalog;
  const counts = countByCategory(categories, products);
  const fams = families_(categories).filter((f) => f.kind !== "service");
  const latest = products.slice(0, 8);
  const digital = products.filter((p) => p.kind === "digital").slice(0, 4);
  const promos = products.filter((p) => p.compare_at_cents && p.compare_at_cents > p.price_cents).slice(0, 4);
  const ld = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Assavendo", url: siteUrl, logo: `${siteUrl}/icon.svg` },
    { "@context": "https://schema.org", "@type": "WebSite", name: "Assavendo", url: siteUrl, potentialAction: { "@type": "SearchAction", target: `${siteUrl}/boutique?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <section className="shop-hero">
        <div className="wrap">
          <p className="eyebrow" style={{ color: "var(--signal)" }}>La boutique Assavendo</p>
          <h1>Des produits clairs, un achat sans surprise.</h1>
          <p className="lede">Produits physiques et téléchargements, prix affichés toutes taxes comprises, paiement sécurisé et fiche complète avant d&apos;acheter.</p>
          <form role="search" action="/boutique" method="get" className="shop-search">
            <label className="sr-only" htmlFor="home-q">Rechercher dans la boutique</label>
            <input id="home-q" name="q" type="search" placeholder="Que cherchez-vous ?" maxLength={120} />
            <button className="btn btn-signal" type="submit">Rechercher</button>
          </form>
        </div>
      </section>

      <section className="section-tight" aria-label="Catégories">
        <div className="wrap">
          <details className="cats-toggle">
            <summary>Catégories</summary>
            <ul className="cat-tiles">
              {fams.map((f) => {
                const n = counts.get(f.slug) ?? 0;
                return <li key={f.id}><Link className="cat-tile" href={`/categorie/${f.slug}`}><strong>{f.name}</strong><span>{n ? `${n} produit${n > 1 ? "s" : ""}` : `${childrenOf(categories, f.id).length} rayons`}{!f.sellable ? " · en préparation" : ""}</span></Link></li>;
              })}
            </ul>
          </details>
        </div>
      </section>

      {latest.length ? (
        <section className="section-tight" aria-labelledby="new-t"><div className="wrap">
          <div className="section-head"><h2 id="new-t">Nouveautés</h2></div>
          <div className="cards pgrid">{latest.map((p) => <ProductCard key={p.id} p={p} variants={variants} />)}</div>
          <p style={{ marginTop: "1.2rem" }}><Link href="/boutique?tri=nouveautes">Voir tous les produits →</Link></p>
        </div></section>
      ) : (
        <section className="section-tight"><div className="wrap"><div className="empty">
          <h2 style={{ fontSize: "1.5rem" }}>Le catalogue se remplit</h2>
          <p>Nous ne mettons en vente que des produits vérifiés, avec une fiche complète : prix, livraison, retour, garantie. Les premiers arrivent bientôt. En attendant, vous pouvez nous dire ce que vous cherchez.</p>
          <Link className="btn btn-primary" href="/contact?sujet=Id%C3%A9e%20de%20produit">Proposer un produit ou un besoin</Link>
        </div></div></section>
      )}

      {promos.length ? (
        <section className="section-tight" aria-labelledby="promo-t"><div className="wrap">
          <div className="section-head"><h2 id="promo-t">Promotions</h2></div>
          <div className="cards pgrid">{promos.map((p) => <ProductCard key={p.id} p={p} variants={variants} />)}</div>
          <p style={{ marginTop: "1.2rem" }}><Link href="/promotions">Toutes les promotions →</Link></p>
        </div></section>
      ) : null}

      {digital.length ? (
        <section className="section-tight" aria-labelledby="num-t"><div className="wrap">
          <div className="section-head"><h2 id="num-t">Téléchargements</h2><p className="muted">Livrés par lien sécurisé dès le paiement confirmé.</p></div>
          <div className="cards pgrid">{digital.map((p) => <ProductCard key={p.id} p={p} variants={variants} />)}</div>
          <p style={{ marginTop: "1.2rem" }}><Link href="/numerique">Tout le numérique →</Link></p>
        </div></section>
      ) : null}

      <section className="section-tight" aria-labelledby="eng-t"><div className="wrap">
        <div className="section-head"><h2 id="eng-t">Nos engagements</h2></div>
        <ul className="promises">
          <li><b>Prix toutes taxes comprises</b><span>Le montant affiché est le montant payé, frais de livraison indiqués avant le paiement.</span></li>
          <li><b>Paiement sécurisé</b><span>Traité par Stripe : nous ne voyons ni ne conservons votre carte.</span></li>
          <li><b>Rétractation de 14 jours</b><span>Selon la nature du produit, conformément à nos <Link href="/conditions-de-vente">conditions de vente</Link>.</span></li>
          <li><b>Aucun faux avis, aucune fausse urgence</b><span>Pas de stock inventé, pas de compte à rebours artificiel, pas de remise sur un prix fictif.</span></li>
        </ul>
      </div></section>

      <section className="section-tight"><div className="wrap">
        <div className="cta-band">
          <div><h2>Une entreprise avec un site, une boutique ou un outil à réparer ?</h2><p>Assavendo intervient aussi sur mesure : audit, réparation, sécurité, automatisation. Tout est regroupé dans « Services &amp; solutions ».</p></div>
          <Link className="btn btn-signal btn-lg" href="/services">Découvrir les services</Link>
        </div>
      </div></section>
    </>
  );
}
