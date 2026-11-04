"use client";
import { useActionState } from "react";
import { startCartCheckout } from "@/app/actions/checkout";
import type { FormState } from "@/app/actions/contact";
import { Turnstile } from "./Turnstile";

export function CheckoutForm({ hasPaidDigital, hasPhysical, free, totalLabel }: { hasPaidDigital: boolean; hasPhysical: boolean; free: boolean; totalLabel: string }) {
  const [state, action, pending] = useActionState(startCartCheckout, { ok: false, message: "" } as FormState);
  const v = state.values ?? {};
  if (state.ok) return <div className="alert alert-ok" role="status">{state.message}</div>;
  return (
    <form action={action} className="buy-form" noValidate>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="field">Adresse e-mail pour recevoir votre confirmation<input className="input" type="email" name="email" autoComplete="email" required defaultValue={v.email} /></label>
      <label className="check"><input type="checkbox" name="terms" defaultChecked={v.terms === "on"} /><span>J&apos;ai lu et j&apos;accepte les <a href="/conditions-de-vente" target="_blank" rel="noopener">conditions de vente</a>.</span></label>
      {hasPaidDigital ? <label className="check"><input type="checkbox" name="waiver" defaultChecked={v.waiver === "on"} /><span>Je demande la livraison immédiate du contenu numérique et je reconnais que je perds mon droit de rétractation dès le début du téléchargement.</span></label> : null}
      <Turnstile resetKey={state} />
      <button className="btn btn-primary btn-lg" disabled={pending}>{pending ? (free ? "Envoi…" : "Redirection vers le paiement…") : free ? "Valider ma commande" : `Payer ${totalLabel}`}</button>
      {state.message ? <p className="alert alert-err" role="alert">{state.message}</p> : null}
      {free ? null : <p className="muted small">Paiement sécurisé par Stripe : vos données de carte ne transitent jamais par ce site. {hasPhysical ? "L'adresse de livraison est demandée sur la page de paiement. " : ""}Une facture vous est envoyée par e-mail.</p>}
    </form>
  );
}
