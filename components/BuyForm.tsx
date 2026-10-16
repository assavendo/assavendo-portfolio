"use client";
import { useActionState } from "react";
import { startCheckout } from "@/app/actions/checkout";
import type { FormState } from "@/app/actions/contact";
export function BuyForm({ productId, label }: { productId: string; label: string }) {
  const [state, action, pending] = useActionState(startCheckout, { ok: false, message: "" } as FormState);
  return (
    <form action={action} style={{ display: "grid", gap: ".8rem" }}>
      <input type="hidden" name="productId" value={productId} />
      <label className="field">Adresse e-mail pour recevoir votre achat<input className="input" type="email" name="email" autoComplete="email" required /></label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Redirection vers le paiement…" : label}</button>
      {state.message ? <p className="alert alert-err" role="alert">{state.message}</p> : null}
      <p className="muted small">Paiement sécurisé par Stripe. Vos données de carte ne transitent jamais par ce site. En continuant, vous acceptez les <a href="/conditions-de-vente">conditions de vente</a>.</p>
    </form>
  );
}
