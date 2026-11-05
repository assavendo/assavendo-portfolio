import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SupplierImportForm } from "@/components/admin/SupplierImportForm";
import { PremiumImageButton } from "@/components/admin/PremiumImageButton";

type ImportImage = { url?: string; alt?: string; credit?: string; kind?: string };
type Extracted = { page_title?: string; product_name?: string; description?: string; brand?: string; sku?: string; gtin?: string; supplier_price?: number | null; currency?: string; availability?: string; price_note?: string };
const statuses: Record<string, string> = { queued: "En attente", running: "Analyse", needs_review: "À vérifier", approved: "Brouillon créé", rejected: "Refusé", failed: "Échec" };
const date = (d: string) => new Date(d).toLocaleString("fr-FR");

export const dynamic = "force-dynamic";
export default async function Dropshipping({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await requireAdmin(); const sp = await searchParams;
  const { data, error } = await supabaseAdmin().from("dropship_imports").select("id,supplier_url,product_query,status,images,extracted,error,product_id,created_at,updated_at,decided_at").order("created_at", { ascending: false }).limit(30);
  return <div>
    <h1 style={{ fontSize: "1.8rem" }}>Import fournisseur</h1>
    <p className="muted" style={{ maxWidth: "75ch" }}>Donnez une page publique et le nom du produit. L’IA prépare un brouillon, sans publier ni acheter quoi que ce soit. Il faut encore fixer le prix, le stock, les délais et vérifier les droits et la conformité. La synchronisation des stocks fournisseurs et le transfert automatique des commandes ne sont pas encore activés.</p>
    {sp.ok ? <p className="alert alert-ok" role="status">{sp.ok}</p> : null}
    {sp.erreur ? <p className="alert alert-err" role="alert">{sp.erreur}</p> : null}
    <section className="panel" aria-labelledby="import-form-title">
      <h2 id="import-form-title" style={{ fontSize: "1.2rem" }}>Préparer un produit</h2>
      <SupplierImportForm />
    </section>
    <section aria-labelledby="import-list-title">
      <h2 id="import-list-title" style={{ fontSize: "1.3rem" }}>Imports récents ({data?.length ?? 0})</h2>
      {error ? <p className="alert alert-err" role="alert">Lecture des imports impossible.</p> : null}
      {!error && !(data ?? []).length ? <p className="panel muted">Aucun import fournisseur pour le moment.</p> : null}
      {(data ?? []).map((item) => {
        const extracted = (item.extracted ?? {}) as Extracted;
        const images = (Array.isArray(item.images) ? item.images : []) as ImportImage[];
        const premium = images.find((image) => image.kind === "premium" && image.url);
        const source = images.find((image) => image.kind === "source" && image.url);
        return <article className="panel" key={item.id} style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>{item.product_query}</h3><span className={`status ${item.status === "needs_review" || item.status === "approved" ? "s-published" : "s-draft"}`}>{statuses[item.status] ?? item.status}</span>
          </div>
          <p className="muted small">Créé le {date(item.created_at)} · Référence {item.id}</p>
          <p><a href={item.supplier_url} target="_blank" rel="noreferrer">Ouvrir la page fournisseur</a></p>
          {extracted.product_name ? <p><strong>Nom extrait :</strong> {extracted.product_name}{extracted.brand ? ` · ${extracted.brand}` : ""}</p> : null}
          {extracted.description ? <p>{extracted.description}</p> : null}
          {extracted.supplier_price !== null && extracted.supplier_price !== undefined ? <p className="muted small">Prix lu sur la page : {extracted.supplier_price} {extracted.currency || "(devise non précisée)"}. Non utilisé comme prix de vente.</p> : null}
          {extracted.availability ? <p className="muted small">Disponibilité annoncée par la source : {extracted.availability}. Non synchronisée.</p> : null}
          {source || premium ? <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: ".75rem 0" }}>
            {source?.url ? <figure style={{ margin: 0 }}><a href={source.url} target="_blank" rel="noreferrer">Ouvrir l’image source du fournisseur</a><figcaption className="muted small">Lien source; ouvert séparément car la CSP n’autorise pas les images externes.</figcaption></figure> : null}
            {premium?.url ? <figure style={{ margin: 0 }}><Image src={premium.url} alt={premium.alt || "Image produit générée par IA à vérifier"} width={200} height={180} style={{ maxHeight: 180, objectFit: "contain", background: "white", borderRadius: 6 }} /><figcaption className="muted small">Image IA — vérification obligatoire</figcaption></figure> : null}
          </div> : null}
          {item.status === "needs_review" && source ? <PremiumImageButton importId={item.id} /> : null}
          {item.status === "needs_review" ? <p className="notice">La décision de créer un brouillon est dans le <Link href="/admin/ia">Centre IA</Link>. La publication reste une action séparée.</p> : null}
          {item.product_id ? <p><Link href={`/admin/produits?id=${item.product_id}`}>Ouvrir le produit brouillon</Link></p> : null}
          {item.error ? <p className="alert alert-err" role="alert">{item.error}</p> : null}
        </article>;
      })}
    </section>
  </div>;
}
