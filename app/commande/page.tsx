import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadCart, readCart } from "@/lib/cart";
import { eur } from "@/lib/types";
import { CheckoutForm } from "@/components/CheckoutForm";
import { quoteCartShippingOptions } from "@/lib/dropship/logistics";

export const metadata: Metadata = { title: "Commande", robots: { index: false }, alternates: { canonical: "/commande" } };
export const dynamic = "force-dynamic";

export default async function Commande({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const sp = await searchParams;
  const cart = await loadCart(await readCart());
  if (!cart.items.length) redirect("/panier");
  if (cart.blocked) redirect("/panier");
  let shippingOptions: Awaited<ReturnType<typeof quoteCartShippingOptions>> = [];
  let shippingError = "";
  if (cart.hasPhysical && cart.shippingDynamic) {
    try { shippingOptions = await quoteCartShippingOptions(await readCart(), "FR"); }
    catch (error) { shippingError = error instanceof Error ? error.message : "Les méthodes de livraison ne sont pas disponibles."; }
  }
  return (
    <div className="section"><div className="wrap">
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Commande</h1>
      {sp.paiement === "annule" ? <p className="alert alert-err" role="status">Paiement annulé : aucun montant n&apos;a été prélevé. Votre panier est conservé.</p> : null}
      <div className="cart-layout">
        <CheckoutForm hasPaidDigital={cart.hasPaidDigital} hasPhysical={cart.hasPhysical} free={cart.total === 0} totalLabel={cart.total ? eur(cart.total) : "Gratuit"} shippingOptions={shippingOptions} shippingError={shippingError} subtotalCents={cart.subtotal} />
        <aside className="cart-sum" aria-labelledby="rec-t">
          <h2 id="rec-t" style={{ fontSize: "1.2rem" }}>Votre commande</h2>
          <ul className="plain">{cart.items.map(({ line, product, variant, unit, total }) => <li key={line.p + (line.v ?? "")} style={{ display: "flex", justifyContent: "space-between", gap: ".8rem", padding: ".3rem 0" }}><span>{line.q} × {product.title}{variant ? ` (${variant.label})` : ""}</span><span>{unit ? eur(total) : "Gratuit"}</span></li>)}</ul>
          <dl><div><dt>Sous-total</dt><dd>{eur(cart.subtotal)}</dd></div>{cart.hasPhysical ? <div><dt>Livraison</dt><dd>{cart.shippingDynamic ? "Choisie ci-dessous" : (cart.shipping ? eur(cart.shipping) : "Offerte")}</dd></div> : null}<div className="grand"><dt>Total TTC</dt><dd>{eur(cart.total)}</dd></div></dl>
          <p><Link href="/panier">← Modifier le panier</Link></p>
        </aside>
      </div>
    </div></div>
  );
}
