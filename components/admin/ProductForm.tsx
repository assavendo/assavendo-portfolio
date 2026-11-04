"use client";
import { useActionState, useState } from "react";
import { saveProduct, type AdminState } from "@/app/actions/admin";
import type { Category, Product } from "@/lib/types";
import { DeliverableField, GalleryField } from "./ImagePicker";
import { SaveBar } from "./SaveBar";

type Props = { p: Product | null; categories: Category[]; brandName?: string; deliverableName?: string; cree?: boolean; catalogReady?: boolean };

export function ProductForm({ p, categories, brandName = "", deliverableName, cree = false, catalogReady = true }: Props) {
  const [state, action, pending] = useActionState(saveProduct, {} as AdminState);
  const v = (k: string, d: string | number | undefined | null) => String(state.values?.[k] ?? d ?? "");
  const [catId, setCatId] = useState(v("category_id", p?.category_id));
  const [kind, setKind] = useState(v("kind", p?.kind ?? "digital"));
  const cat = categories.find((c) => c.id === catId);
  const attrs = (cat?.attributes ?? []).concat(cat?.parent_id ? categories.find((c) => c.id === cat.parent_id)?.attributes ?? [] : []);
  const seen = new Set<string>(); const attrList = attrs.filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)));
  const fams = categories.filter((c) => !c.parent_id);
  const physical = kind === "physical";
  return (
    <form action={action} className="form-grid" noValidate>
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <label className="field full">Nom du produit<input className="input" name="title" defaultValue={v("title", p?.title)} /></label>
      <label className="field">Adresse (slug, automatique si vide)<input className="input" name="slug" defaultValue={v("slug", p?.slug)} /></label>
      <label className="field">Type<select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="digital">Produit numérique</option><option value="service">Service</option><option value="physical">Produit physique</option></select></label>
      <label className="field full">Résumé (affiché dans la boutique)<textarea className="input" name="summary" defaultValue={v("summary", p?.summary)} style={{ minHeight: 80 }} /></label>
      <label className="field full">Description complète (paragraphes séparés par une ligne vide)<textarea className="input" name="description" defaultValue={v("description", p?.description)} style={{ minHeight: 200 }} /></label>
      <label className="field full">Ce qui est inclus (un point par ligne)<textarea className="input" name="features" defaultValue={v("features", p?.features.join("\n"))} /></label>

      {catalogReady ? (
        <fieldset className="full panel" style={{ margin: 0 }}><legend><strong>Classement</strong></legend>
          <div className="form-grid">
            <label className="field">Catégorie
              <select className="input" name="category_id" value={catId} onChange={(e) => setCatId(e.target.value)}>
                <option value="">— Non classé —</option>
                {fams.map((f) => <optgroup key={f.id} label={f.name + (f.sellable ? "" : " (non validée pour la vente)")}>
                  <option value={f.id}>{f.name} (général)</option>
                  {categories.filter((c) => c.parent_id === f.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>)}
              </select></label>
            <label className="field">Marque<input className="input" name="brand" defaultValue={v("brand", brandName)} maxLength={120} /></label>
            <label className="field full">Mots-clés (séparés par des virgules, utilisés par la recherche)<input className="input" name="tags" defaultValue={v("tags", p?.tags?.join(", "))} /></label>
            {cat && !cat.sellable ? <p className="notice full" role="note">{cat.note || "Cette famille n'est pas validée pour la vente : le produit ne peut être que brouillon."}</p> : null}
          </div>
          {attrList.length ? <><h3 style={{ fontSize: "1rem", margin: "1rem 0 .5rem" }}>Caractéristiques de la catégorie</h3><div className="attr-grid">
            {attrList.map((a) => {
              const cur = v(`attr_${a.key}`, p?.attributes?.[a.key]);
              return <label className="field" key={a.key}>{a.label}{a.unit ? ` (${a.unit})` : ""}
                {a.type === "enum" ? <select className="input" name={`attr_${a.key}`} defaultValue={cur}><option value="">—</option>{a.values?.map((x) => <option key={x}>{x}</option>)}</select>
                  : a.type === "boolean" ? <select className="input" name={`attr_${a.key}`} defaultValue={cur}><option value="">—</option><option value="true">Oui</option><option value="false">Non</option></select>
                  : <input className="input" name={`attr_${a.key}`} defaultValue={cur} inputMode={a.type === "number" ? "decimal" : undefined} />}</label>;
            })}</div></> : null}
        </fieldset>
      ) : <p className="notice full" role="note">Les champs de catalogue (catégorie, stock, caractéristiques) s&apos;activent après application de la migration « catalogue » dans Supabase.</p>}

      <fieldset className="full panel" style={{ margin: 0 }}><legend><strong>Prix</strong></legend>
        <div className="form-grid">
          <label className="field">Prix TTC en € (0 = gratuit)<input className="input" type="number" step="0.01" min="0" name="price" defaultValue={v("price", p ? p.price_cents / 100 : 0)} /></label>
          {catalogReady ? <label className="field">Ancien prix barré en € (facultatif)<input className="input" type="number" step="0.01" min="0" name="compare_at" defaultValue={v("compare_at", p?.compare_at_cents ? p.compare_at_cents / 100 : "")} /><span className="muted small">Uniquement un prix réellement pratiqué avant ; il doit être supérieur au prix actuel.</span></label> : null}
          <label className="field">Lien de démonstration (https)<input className="input" type="url" name="demo_url" defaultValue={v("demo_url", p?.demo_url)} /></label>
        </div>
      </fieldset>

      {catalogReady && physical ? (
        <fieldset className="full panel" style={{ margin: 0 }}><legend><strong>Produit physique : stock, livraison, garantie</strong></legend>
          <div className="form-grid">
            <label className="field">Référence (SKU)<input className="input" name="sku" defaultValue={v("sku", p?.sku)} maxLength={64} /></label>
            <label className="field">Code-barres (EAN/GTIN, 8 à 14 chiffres)<input className="input" name="gtin" defaultValue={v("gtin", p?.gtin)} inputMode="numeric" /></label>
            <label className="field">Poids (grammes)<input className="input" type="number" min="1" name="weight_g" defaultValue={v("weight_g", p?.weight_g)} /></label>
            <label className="field">Pays d&apos;origine (code à 2 lettres)<input className="input" name="origin_country" defaultValue={v("origin_country", p?.origin_country)} maxLength={2} /></label>
            <label className="field">Frais de livraison TTC en €<input className="input" type="number" step="0.01" min="0" name="shipping" defaultValue={v("shipping", p ? (p.shipping_cents ?? 0) / 100 : 0)} /></label>
            <label className="field">Délai min. (jours)<input className="input" type="number" min="0" name="delivery_min_days" defaultValue={v("delivery_min_days", p?.delivery_min_days)} /></label>
            <label className="field">Délai max. (jours)<input className="input" type="number" min="0" name="delivery_max_days" defaultValue={v("delivery_max_days", p?.delivery_max_days)} /></label>
            <label className="field">Garantie (mois)<input className="input" type="number" min="0" name="warranty_months" defaultValue={v("warranty_months", p?.warranty_months)} /></label>
            <label className="field">Délai de retour (jours)<input className="input" type="number" min="0" name="return_days" defaultValue={v("return_days", p?.return_days ?? 14)} /></label>
            <label className="field full" style={{ flexDirection: "row", gap: ".5rem", alignItems: "center" }}><input type="checkbox" name="track_stock" defaultChecked={state.values ? state.values.track_stock === "on" : p?.track_stock ?? false} /> Suivre le stock (le produit passe « Épuisé » à zéro ; sans suivi, il n&apos;est jamais affiché épuisé)</label>
            <label className="field">Quantité en stock<input className="input" type="number" min="0" name="stock_qty" defaultValue={v("stock_qty", p?.stock_qty ?? 0)} /></label>
            <label className="field">Seuil « stock faible »<input className="input" type="number" min="0" name="low_stock_threshold" defaultValue={v("low_stock_threshold", p?.low_stock_threshold ?? 3)} /></label>
          </div>
        </fieldset>
      ) : null}

      <GalleryField initial={p?.images ?? []} />
      {kind === "digital" ? <DeliverableField initialName={deliverableName} /> : null}
      <label className="field">Statut<select className="input" name="status" defaultValue={v("status", p?.status ?? "draft")}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label>
      <div style={{ display: "grid", gap: ".4rem", alignContent: "end" }}>
        <label><input type="checkbox" name="allow_reviews" defaultChecked={state.values ? state.values.allow_reviews === "on" : p?.allow_reviews ?? true} /> Autoriser les avis</label>
        <label><input type="checkbox" name="allow_comments" defaultChecked={state.values ? state.values.allow_comments === "on" : p?.allow_comments ?? true} /> Autoriser les commentaires</label></div>
      <SaveBar pending={pending} state={state} cree={cree} />
    </form>
  );
}
