import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/customer";
import { getCatalog } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function Favoris() {
  const { sb, user } = await requireCustomer("/compte/favoris");
  const [{ data }, catalog] = await Promise.all([sb.from("favorites").select("product_id").eq("user_id", user.id), getCatalog()]);
  const ids = new Set((data ?? []).map((f) => f.product_id));
  const items = catalog.products.filter((p) => ids.has(p.id));
  return (
    <div className="section"><div className="wrap">
      <p><Link href="/compte">← Mon compte</Link></p>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)" }}>Mes favoris</h1>
      {items.length ? <div className="cards pgrid">{items.map((p) => <ProductCard key={p.id} p={p} variants={catalog.variants} />)}</div> : <div className="empty"><p>Aucun favori. Utilisez « Ajouter aux favoris » sur une fiche produit.</p><Link className="btn btn-primary" href="/boutique">Voir la boutique</Link></div>}
    </div></div>
  );
}
