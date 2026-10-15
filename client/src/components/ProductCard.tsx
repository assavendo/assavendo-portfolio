import { ArrowUpRight, Heart, MessageCircle, Star } from "lucide-react";
import { Link } from "wouter";

type StoreProduct = { id: number; slug: string; title: string; summary: string; priceCents: number; currency: string; imageUrl?: string | null; likes: number; reviews: number; rating: number };
export function ProductCard({ product }: { product: StoreProduct }) {
  const price = new Intl.NumberFormat("fr-FR", { style: "currency", currency: product.currency || "EUR" }).format(product.priceCents / 100);
  return <article className="product-card"><Link href={`/produits/${product.slug}`} className="product-card-art" aria-label={`Voir ${product.title}`}>
    {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <div className="product-placeholder"><span>{product.title.slice(0, 1)}</span><i /><b /></div>}
    <span className="product-card-arrow"><ArrowUpRight size={17} /></span>
  </Link><div className="product-card-body"><span className="eyebrow">CRÉATION ASSAVENDO</span><h3><Link href={`/produits/${product.slug}`}>{product.title}</Link></h3><p>{product.summary}</p><div className="product-card-bottom"><strong>{price}</strong><div className="product-social"><span><Heart size={13} /> {product.likes}</span><span><Star size={13} /> {product.reviews ? product.rating.toFixed(1) : "Nouveau"}</span><span><MessageCircle size={13} /> {product.reviews}</span></div></div></div></article>;
}
