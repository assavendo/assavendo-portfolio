"use client";
import { useActionState, useMemo, useState } from "react";
import { startCartCheckout } from "@/app/actions/checkout";
import type { FormState } from "@/app/actions/contact";
import type { CheckoutShippingOption } from "@/lib/dropship/logistics";
import { Turnstile } from "./Turnstile";

export function CheckoutForm({
  hasPaidDigital, hasPhysical, free, totalLabel, shippingOptions, shippingError, subtotalCents,
}: {
  hasPaidDigital: boolean; hasPhysical: boolean; free: boolean; totalLabel: string;
  shippingOptions: CheckoutShippingOption[]; shippingError: string; subtotalCents: number;
}) {
  const [state, action, pending] = useActionState(startCartCheckout, { ok: false, message: "" } as FormState);
  const v = state.values ?? {};
  const [selectedCode, setSelectedCode] = useState(String(v.shipping_method ?? shippingOptions[0]?.code ?? ""));
  const selected = useMemo(() => shippingOptions.find((x) => x.code === selectedCode) ?? shippingOptions[0] ?? null, [shippingOptions, selectedCode]);
  const totalCents = subtotalCents + (selected?.priceCents ?? 0);
  const amountLabel = totalCents ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(totalCents / 100) : totalLabel;

  if (state.ok) return <div className="alert alert-ok" role="status">{state.message}</div>;
  if (hasPhysical && shippingError) return <div className="alert alert-err" role="alert">La livraison ne peut pas encore être calculée : {shippingError}</div>;
  if (hasPhysical && !shippingOptions.length) return <div className="alert alert-err" role="alert">Aucune méthode de livraison n’est actuellement disponible pour ce panier.</div>;

  return (
    <form action={action} className="buy-form" noValidate>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="field">Adresse e-mail<input className="input" type="email" name="email" autoComplete="email" required defaultValue={v.email} /></label>
      {hasPhysical ? (
        <>
          <fieldset className="buy-form" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Adresse de livraison</legend>
            <label className="field">Nom complet<input className="input" name="name" autoComplete="name" required defaultValue={v.name} /></label>
            <label className="field">Adresse<input className="input" name="line1" autoComplete="address-line1" required defaultValue={v.line1} /></label>
            <label className="field">Complément d’adresse<input className="input" name="line2" autoComplete="address-line2" defaultValue={v.line2} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(120px,.4fr) 1fr", gap: ".7rem" }}>
              <label className="field">Code postal<input className="input" name="postal_code" autoComplete="postal-code" required defaultValue={v.postal_code} /></label>
              <label className="field">Ville<input className="input" name="city" autoComplete="address-level2" required defaultValue={v.city} /></label>
            </div>
            <label className="field">Pays<select className="input" name="country" defaultValue={String(v.country ?? "FR")}>
              <option value="FR">France</option>
            </select></label>
            <label className="field">Téléphone<input className="input" type="tel" name="phone" autoComplete="tel" required defaultValue={v.phone} /></label>
          </fieldset>

          <fieldset className="buy-form" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Mode de livraison</legend>
            {shippingOptions.map((option) => (
              <label key={option.code} className="check" style={{ alignItems: "center", padding: ".55rem .7rem", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12 }}>
                <input type="radio" name="shipping_method" value={option.code} checked={selected?.code === option.code} onChange={() => setSelectedCode(option.code)} />
                <span style={{ display: "grid", gap: 2 }}>
                  <strong>{option.label}</strong>
                  <span className="muted small">{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(option.priceCents / 100)}{option.requirements.length ? " · informations supplémentaires vérifiées au paiement" : ""}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="muted small">Les options sont calculées à partir du panier, du poids et de la destination. Le montant est recalculé côté serveur juste avant la création du paiement.</p>
        </>
      ) : null}
      <label className="check"><input type="checkbox" name="terms" defaultChecked={v.terms === "on"} /><span>J&apos;ai lu et j&apos;accepte les <a href="/conditions-de-vente" target="_blank" rel="noopener">conditions de vente</a>.</span></label>
      {hasPaidDigital ? <label className="check"><input type="checkbox" name="waiver" defaultChecked={v.waiver === "on"} /><span>Je demande la livraison immédiate du contenu numérique et je reconnais que je perds mon droit de rétractation dès le début du téléchargement.</span></label> : null}
      <Turnstile resetKey={state} />
      <button className="btn btn-primary btn-lg" disabled={pending || (hasPhysical && !selected)}>{pending ? (free ? "Envoi…" : "Redirection vers le paiement…") : free ? "Valider ma commande" : "Payer " + amountLabel}</button>
      {state.message ? <p className="alert alert-err" role="alert">{state.message}</p> : null}
      {free ? null : <p className="muted small">Paiement sécurisé par Stripe. {hasPhysical ? "Votre adresse de livraison a été enregistrée avant le paiement." : ""} Une facture vous est envoyée par e-mail.</p>}
    </form>
  );
}
