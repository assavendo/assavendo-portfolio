"use client";

import { useActionState } from "react";
import type { Variant } from "@/lib/types";
import { deleteProductVariant, saveProductVariant, type AdminState } from "@/app/actions/admin";

function eurValue(cents: number | null) {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function VariantRow({ productId, variant }: { productId: string; variant: Variant }) {
  const [state, action, pending] = useActionState(saveProductVariant, {} as AdminState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteProductVariant, {} as AdminState);

  return (
    <div className="panel" style={{ display: "grid", gap: ".75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong>{variant.label}</strong>
        <span className="muted small">{variant.active ? "Active" : "Inactive"} · stock {variant.stock_qty}</span>
      </div>
      <form action={action} className="form-grid">
        <input type="hidden" name="id" value={variant.id} />
        <input type="hidden" name="product_id" value={productId} />
        <label className="field">Libellé<input className="input" name="label" defaultValue={variant.label} maxLength={160} required /></label>
        <label className="field">SKU<input className="input" name="sku" defaultValue={variant.sku ?? ""} maxLength={64} /></label>
        <label className="field">Prix TTC (vide = prix produit)<input className="input" type="number" min="0" step="0.01" name="price" defaultValue={eurValue(variant.price_cents)} /></label>
        <label className="field">Stock<input className="input" type="number" min="0" max="1000000" name="stock_qty" defaultValue={variant.stock_qty} required /></label>
        <label className="field">Ordre<input className="input" type="number" min="0" max="100000" name="sort" defaultValue={variant.sort} required /></label>
        <label className="field full">Options (JSON objet)
          <textarea className="input" name="options_json" defaultValue={JSON.stringify(variant.options ?? {}, null, 2)} style={{ minHeight: 80, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} />
          <span className="muted small">Exemple : {"{"}"couleur":"Noir","taille":"M"{"}"}. Les valeurs restent du texte.</span>
        </label>
        <label className="field full" style={{ flexDirection: "row", gap: ".5rem", alignItems: "center" }}>
          <input type="checkbox" name="active" defaultChecked={variant.active} /> Variante vendable
        </label>
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer la variante"}</button>
          <span className="muted small" role="status" aria-live="polite">{state.ok ?? state.error ?? ""}</span>
        </div>
      </form>
      <form action={deleteAction} style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
        <input type="hidden" name="id" value={variant.id} />
        <input type="hidden" name="product_id" value={productId} />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={deletePending}>{deletePending ? "Suppression…" : "Supprimer cette variante"}</button>
        <span className="muted small" role="status" aria-live="polite">{deleteState.ok ?? deleteState.error ?? ""}</span>
      </form>
    </div>
  );
}

function NewVariant({ productId, nextSort }: { productId: string; nextSort: number }) {
  const [state, action, pending] = useActionState(saveProductVariant, {} as AdminState);
  return (
    <form action={action} className="form-grid panel" style={{ marginTop: "1rem" }}>
      <input type="hidden" name="product_id" value={productId} />
      <label className="field">Libellé<input className="input" name="label" placeholder="Noir · M" maxLength={160} required /></label>
      <label className="field">SKU<input className="input" name="sku" placeholder="SKU-001" maxLength={64} /></label>
      <label className="field">Prix TTC (vide = prix produit)<input className="input" type="number" min="0" step="0.01" name="price" /></label>
      <label className="field">Stock<input className="input" type="number" min="0" max="1000000" name="stock_qty" defaultValue="0" required /></label>
      <label className="field">Ordre<input className="input" type="number" min="0" max="100000" name="sort" defaultValue={nextSort} required /></label>
      <label className="field full">Options (JSON objet)
        <textarea className="input" name="options_json" defaultValue='{"couleur":"Noir"}' style={{ minHeight: 80, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} />
      </label>
      <label className="field full" style={{ flexDirection: "row", gap: ".5rem", alignItems: "center" }}>
        <input type="checkbox" name="active" defaultChecked /> Variante vendable
      </label>
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Création…" : "Ajouter la variante"}</button>
        <span className="muted small" role="status" aria-live="polite">{state.ok ?? state.error ?? ""}</span>
      </div>
    </form>
  );
}

export function VariantEditor({ productId, variants }: { productId: string; variants: Variant[] }) {
  const nextSort = variants.length ? Math.max(...variants.map((v) => v.sort)) + 10 : 10;
  return (
    <section className="panel" style={{ marginTop: "1rem" }} aria-labelledby="variants-title">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <h2 id="variants-title" style={{ margin: 0, fontSize: "1.3rem" }}>Variantes</h2>
          <p className="muted small">Prix, stock, SKU, options et activation sont propres à chaque variante.</p>
        </div>
        <span className="badge">{variants.length} variante{variants.length > 1 ? "s" : ""}</span>
      </div>
      {variants.map((variant) => <VariantRow key={variant.id} productId={productId} variant={variant} />)}
      <NewVariant productId={productId} nextSort={nextSort} />
    </section>
  );
}
