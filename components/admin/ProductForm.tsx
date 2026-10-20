"use client";
import { useActionState } from "react";
import { saveProduct, type AdminState } from "@/app/actions/admin";
import type { Product } from "@/lib/types";
import { DeliverableField, GalleryField } from "./ImagePicker";

export function ProductForm({ p, deliverableName, cree = false }: { p: Product | null; deliverableName?: string; cree?: boolean }) {
  const [state, action, pending] = useActionState(saveProduct, {} as AdminState);
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <label className="field full">Nom du produit<input className="input" name="title" defaultValue={state.values?.title ?? (p?.title)} required /></label>
      <label className="field">Adresse (slug)<input className="input" name="slug" defaultValue={state.values?.slug ?? (p?.slug)} /></label>
      <label className="field">Type<select className="input" name="kind" defaultValue={state.values?.kind ?? (p?.kind ?? "digital")}><option value="digital">Produit numérique</option><option value="service">Service</option><option value="physical">Produit physique</option></select></label>
      <label className="field full">Résumé (affiché dans la boutique)<textarea className="input" name="summary" defaultValue={state.values?.summary ?? (p?.summary)} required style={{ minHeight: 80 }} /></label>
      <label className="field full">Description complète (paragraphes séparés par une ligne vide)<textarea className="input" name="description" defaultValue={state.values?.description ?? (p?.description)} style={{ minHeight: 200 }} /></label>
      <label className="field full">Ce qui est inclus (un point par ligne)<textarea className="input" name="features" defaultValue={state.values?.features ?? (p?.features.join("\n"))} /></label>
      <label className="field">Prix TTC en € (0 = gratuit)<input className="input" type="number" step="0.01" min="0" name="price" defaultValue={state.values?.price ?? (p ? p.price_cents / 100 : 0)} required /></label>
      <label className="field">Lien de démonstration (https)<input className="input" type="url" name="demo_url" defaultValue={state.values?.demo_url ?? (p?.demo_url ?? "")} /></label>
      <GalleryField initial={p?.images ?? []} />
      <DeliverableField initialName={deliverableName} />
      <label className="field">Statut<select className="input" name="status" defaultValue={state.values?.status ?? (p?.status ?? "draft")}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label>
      <div style={{ display: "grid", gap: ".4rem", alignContent: "end" }}>
        <label><input type="checkbox" name="allow_reviews" defaultChecked={state.values ? state.values.allow_reviews === "on" : p?.allow_reviews ?? true} /> Autoriser les avis</label>
        <label><input type="checkbox" name="allow_comments" defaultChecked={state.values ? state.values.allow_comments === "on" : p?.allow_comments ?? true} /> Autoriser les commentaires</label></div>
      <div className="full"><button className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
        {state.error ? <p className="alert alert-err" role="alert" style={{ marginTop: ".8rem" }}>{state.error}</p> : null}{!state.ok && !state.error && cree ? <p className="alert alert-ok" role="status" style={{ marginTop: ".8rem" }}>Créé. Vous pouvez continuer à le modifier ici.</p> : null}{state.ok ? <p className="alert alert-ok" role="status" style={{ marginTop: ".8rem" }}>{state.ok}</p> : null}</div>
    </form>
  );
}
