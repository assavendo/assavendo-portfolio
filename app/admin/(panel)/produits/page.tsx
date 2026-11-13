import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { ProductForm } from "@/components/admin/ProductForm";
import { VariantEditor } from "@/components/admin/VariantEditor";
import { deleteProduct } from "@/app/actions/admin";
import { eur, type Category, type Product, type Variant } from "@/lib/types";

export default async function Produits({ searchParams }: { searchParams: Promise<{ id?: string; cree?: string }> }) {
  const { sb } = await requireAdmin(); const sp = await searchParams;
  if (sp.id) {
    const p = sp.id === "nouveau" ? null : ((await sb.from("products").select("*").eq("id", sp.id).maybeSingle()).data as Product | null);
    const cats = await sb.from("categories").select("*").order("sort");
    const brand = p?.brand_id ? (await sb.from("brands").select("name").eq("id", p.brand_id).maybeSingle()).data : null;
    const d = p ? (await sb.from("product_deliverables").select("file_name").eq("product_id", p.id).maybeSingle()).data : null;
    const variants = p ? ((await sb.from("product_variants").select("*").eq("product_id", p.id).order("sort").order("created_at")).data as Variant[]) : [];
    return <div><p><Link href="/admin/produits">← Retour à la liste</Link></p><h1 style={{ fontSize: "1.8rem" }}>{p ? "Modifier le produit" : "Nouveau produit"}</h1><div className="panel"><ProductForm p={p} categories={(cats.data ?? []) as Category[]} catalogReady={!cats.error} brandName={brand?.name} deliverableName={d?.file_name} cree={sp.cree === "1"} /></div>
      {p ? <><VariantEditor productId={p.id} variants={variants} /><form action={deleteProduct}><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost btn-sm">Supprimer définitivement</button></form></> : null}</div>;
  }
  const { data } = await sb.from("products").select("id, title, price_cents, status").order("created_at", { ascending: false });
  return <div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}><h1 style={{ fontSize: "1.8rem", margin: 0 }}>Produits</h1><Link className="btn btn-primary" href="/admin/produits?id=nouveau">Ajouter un produit</Link></div>
    {(data ?? []).length === 0 ? <p className="panel" style={{ marginTop: "1rem" }}>Aucun produit pour le moment. Ajoutez le premier : image, description, prix, fichier livré après paiement.</p> :
      <div className="table-scroll"><table className="tbl" style={{ marginTop: "1rem" }}><thead><tr><th>Produit</th><th>Prix</th><th>Statut</th></tr></thead><tbody>{(data ?? []).map((r) => <tr key={r.id}><td><Link href={`/admin/produits?id=${r.id}`}>{r.title}</Link></td><td>{r.price_cents ? eur(r.price_cents) : "Gratuit"}</td><td><span className={`status s-${r.status}`}>{({ draft: "Brouillon", published: "Publié", archived: "Archivé" } as any)[r.status]}</span></td></tr>)}</tbody></table></div>}</div>;
}
