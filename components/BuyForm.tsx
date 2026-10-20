"use client";
import { useActionState } from "react";
import { startCheckout } from "@/app/actions/checkout";
import type { FormState } from "@/app/actions/contact";
import { Turnstile } from "./Turnstile";

type Kind = "digital" | "service" | "physical";
export function BuyForm({ productId, label, kind, free }: { productId: string; label: string; kind: Kind; free: boolean }) {
  const [state, action, pending] = useActionState(startCheckout, { ok: false, message: "" } as FormState);
  const v = state.values ?? {};
  if (state.ok) return <div className="alert alert-ok" role="status">{state.message}</div>;
  return (
    <form action={action} className="buy-form">
      <input type="hidden" name="productId" value={productId} />
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label className="field">{free ? "Adresse e-mail pour recevoir le lien" : "Adresse e-mail pour recevoir votre commande"}<input className="input" type="email" name="email" autoComplete="email" required defaultValue={v.email} /></label>
      <label className="check"><input type="checkbox" name="terms" required defaultChecked={v.terms === "on"} /><span>J'ai lu et j'accepte les <a href="/conditions-de-vente" target="_blank" rel="noopener">conditions de vente</a>.</span></label>
      {kind === "digital" && !free ? <label className="check"><input type="checkbox" name="waiver" required defaultChecked={v.waiver === "on"} /><span>Je demande la livraison immédiate du contenu numérique et je reconnais que je perds mon droit de rétractation dès le début du téléchargement.</span></label> : null}
      <Turnstile resetKey={state} />
      <button className="btn btn-primary btn-lg" disabled={pending}>{pending ? (free ? "Envoi…" : "Redirection vers le paiement…") : label}</button>
      {state.message ? <p className="alert alert-err" role="alert">{state.message}</p> : null}
      {free ? null : <p className="muted small">Paiement sécurisé par Stripe : vos données de carte ne transitent jamais par ce site. {kind === "physical" ? "L'adresse de livraison est demandée sur la page de paiement." : "Une facture vous est envoyée par e-mail."}</p>}
    </form>
  );
}
