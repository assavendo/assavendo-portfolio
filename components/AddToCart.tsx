import { addToCart } from "@/app/actions/cart";
import { eur, type Product, type Variant } from "@/lib/types";

/** Formulaire d'ajout au panier : fonctionne sans JavaScript (action serveur). */
export function AddToCart({ p, variants, slug, notice }: { p: Product; variants: Variant[]; slug: string; notice?: string }) {
  const tracked = p.kind === "physical" && p.track_stock;
  const soldOut = tracked && (variants.length ? variants.every((v) => v.stock_qty <= 0) : (p.stock_qty ?? 0) <= 0);
  if (p.price_cents > 0 && p.price_cents < 50) return <p className="muted">Ce produit n&apos;est pas vendu en ligne : <a href="/contact">contactez-nous</a>.</p>;
  if (soldOut) return <p className="stock out" role="status">Épuisé pour le moment. <a href="/contact?sujet=Disponibilit%C3%A9%20produit">Nous écrire</a></p>;
  const maxQty = tracked && !variants.length ? Math.min(10, p.stock_qty ?? 1) : 10;
  const msg: Record<string, string> = { declinaison: "Choisissez une déclinaison.", indisponible: "Ce produit n'est plus disponible.", plein: "Votre panier est plein (20 lignes).", invalide: "Demande invalide." };
  return (
    <form action={addToCart} className="add-form">
      <input type="hidden" name="p" value={p.id} /><input type="hidden" name="back" value={`/boutique/${slug}`} />
      {notice && msg[notice] ? <p className="alert alert-err" role="alert">{msg[notice]}</p> : null}
      {variants.length ? (
        <label className="field">Choisissez une option
          <select className="input" name="v" required defaultValue="">
            <option value="" disabled>— Sélectionner —</option>
            {variants.map((v) => <option key={v.id} value={v.id} disabled={tracked && v.stock_qty <= 0}>{v.label}{v.price_cents != null && v.price_cents !== p.price_cents ? ` · ${eur(v.price_cents)}` : ""}{tracked && v.stock_qty <= 0 ? " · épuisé" : ""}</option>)}
          </select></label>
      ) : null}
      <div className="row">
        {p.kind === "physical" ? <label className="field" style={{ maxWidth: "6rem" }}>Quantité<input className="input" type="number" name="q" min={1} max={maxQty} defaultValue={1} inputMode="numeric" /></label> : null}
        <button className="btn btn-primary btn-lg" type="submit">{p.price_cents === 0 ? "Recevoir gratuitement" : "Ajouter au panier"}</button>
        <button className="btn btn-ghost btn-lg" type="submit" name="now" value="1">Acheter maintenant</button>
      </div>
      <p className="muted small">Prix TTC. Paiement sécurisé par Stripe : vos données de carte ne transitent jamais par ce site.</p>
    </form>
  );
}
