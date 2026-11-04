import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { loadCart, readCart } from "@/lib/cart";
import { removeFromCart, setCartQty } from "@/app/actions/cart";
import { eur } from "@/lib/types";

export const metadata: Metadata = { title: "Panier", robots: { index: false }, alternates: { canonical: "/panier" } };
export const dynamic = "force-dynamic";

export default async function Panier({ searchParams }: { searchParams: Promise<{ ajoute?: string }> }) {
  const sp = await searchParams;
  const cart = await loadCart(await readCart());
  return (
    <div className="section"><div className="wrap">
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Votre panier</h1>
      {sp.ajoute ? <p className="alert alert-ok" role="status">Produit ajouté au panier.</p> : null}
      {cart.items.length === 0 ? (
        <div className="empty"><h2 style={{ fontSize: "1.4rem" }}>Votre panier est vide</h2><p>Parcourez le catalogue et ajoutez ce qui vous intéresse.</p><Link className="btn btn-primary" href="/boutique">Voir les produits</Link></div>
      ) : (
        <div className="cart-layout">
          <ul className="cart-list" aria-label="Articles du panier">
            {cart.items.map(({ line, product, variant, unit, total, maxQty, issue }) => (
              <li key={line.p + (line.v ?? "")} className="cart-line">
                <div className="cart-img">{product.images[0] ? <Image src={product.images[0].url} alt="" fill sizes="96px" unoptimized style={{ objectFit: "contain" }} /> : null}</div>
                <div className="cart-info">
                  <h2><Link href={`/boutique/${product.slug}`}>{product.title}</Link></h2>
                  {variant ? <p className="muted">{variant.label}</p> : null}
                  <p className="muted small">{product.kind === "physical" ? "Produit physique" : product.kind === "digital" ? "Téléchargement" : "Service"} · {unit ? eur(unit) : "Gratuit"}</p>
                  {issue ? <p className="alert alert-err" role="alert">{issue} Modifiez ou retirez cet article pour continuer.</p> : null}
                  <div className="cart-actions">
                    {product.kind === "physical" ? (
                      <form action={setCartQty} className="qty-form">
                        <input type="hidden" name="p" value={line.p} /><input type="hidden" name="v" value={line.v ?? ""} />
                        <label htmlFor={`q-${line.p}${line.v ?? ""}`}>Quantité</label>
                        <input id={`q-${line.p}${line.v ?? ""}`} className="input" type="number" name="q" min={1} max={maxQty} defaultValue={Math.min(line.q, maxQty)} inputMode="numeric" />
                        <button className="btn btn-ghost btn-sm">Mettre à jour</button>
                      </form>
                    ) : <span className="muted small">Quantité : 1</span>}
                    <form action={removeFromCart}><input type="hidden" name="p" value={line.p} /><input type="hidden" name="v" value={line.v ?? ""} /><button className="btn btn-ghost btn-sm">Retirer<span className="sr-only"> {product.title}</span></button></form>
                  </div>
                </div>
                <p className="cart-total"><span className="sr-only">Total de la ligne : </span>{total ? eur(total) : "Gratuit"}</p>
              </li>
            ))}
          </ul>
          <aside className="cart-sum" aria-labelledby="sum-t">
            <h2 id="sum-t" style={{ fontSize: "1.2rem" }}>Récapitulatif</h2>
            <dl>
              <div><dt>Sous-total</dt><dd>{eur(cart.subtotal)}</dd></div>
              {cart.hasPhysical ? <div><dt>Livraison</dt><dd>{cart.shipping ? eur(cart.shipping) : "Offerte"}</dd></div> : null}
              <div className="grand"><dt>Total TTC</dt><dd>{eur(cart.total)}</dd></div>
            </dl>
            {cart.total > 0 && cart.total < 50 ? <p className="alert alert-err" role="alert">Le montant minimum de paiement est de 0,50 €.</p> : null}
            {cart.blocked ? <p className="muted small">Résolvez les points signalés pour passer commande.</p> : <Link className="btn btn-primary btn-lg" href="/commande">Passer la commande</Link>}
            <p className="muted small">Prix toutes taxes comprises. Le stock est réservé au moment du paiement. Paiement sécurisé par Stripe.</p>
            <p><Link href="/boutique">← Continuer mes achats</Link></p>
          </aside>
        </div>
      )}
    </div></div>
  );
}
