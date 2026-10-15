import { ArrowUpRight, ShoppingBag, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { SiteShell } from "@/components/SiteShell";
import { ProductCard } from "@/components/ProductCard";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/meta";

export default function Store() {
  usePageMeta("Boutique Assavendo — Créations à adopter", "Découvrez les produits Assavendo réellement publiés. Les démonstrations de portfolio ne sont pas des articles commerciaux.");
  const products = trpc.product.list.useQuery();
  return <SiteShell><section className="page-intro store-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> BOUTIQUE ASSAVENDO</span><h1>Des créations<br /><em>à adopter.</em></h1><p>Une sélection séparée du portfolio : seuls les produits réellement publiés apparaissent ici, avec leurs informations, leurs avis et leur parcours d’achat.</p></div><div className="store-intro-mark"><ShoppingBag size={42} strokeWidth={1.1} /><span>01 / STORE</span></div></section>
    <section className="section store-section"><div className="section-heading"><div><span className="eyebrow">SÉLECTION EN LIGNE</span><h2>Produits Assavendo</h2></div><Link className="text-link" href="/portfolio">Retour aux concepts <ArrowUpRight size={15} /></Link></div>
      {products.isLoading ? <div className="loading-state">Chargement de la boutique…</div> : products.error ? <div className="empty-state"><ShoppingBag size={30} /><h2>La boutique se prépare.</h2><p>Les produits ne sont pas disponibles pour le moment. Réessayez dans quelques instants.</p><button className="button button-outline" onClick={() => products.refetch()}>Réessayer</button></div> : products.data?.length ? <div className="product-grid">{products.data.map((product) => <ProductCard product={product} key={product.id} />)}</div> : <div className="store-empty"><div className="empty-bag"><ShoppingBag size={28} /><span>0</span></div><span className="eyebrow">LE PREMIER CHAPITRE S’ÉCRIT ICI</span><h2>La boutique ouvrira avec vos créations.</h2><p>Les 100 concepts du portfolio sont des démonstrations, pas des produits à acheter. Connectez-vous à l’administration pour publier votre première création réelle.</p><Link className="button button-primary" href="/admin">Accéder à l’administration <ArrowUpRight size={16} /></Link></div>}
      <div className="store-footnote"><Sparkles size={15} /><span>Les exemples de portfolio sont des prototypes, jamais des articles commerciaux.</span></div>
    </section></SiteShell>;
}
