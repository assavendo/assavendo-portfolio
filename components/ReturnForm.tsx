"use client";
import { useActionState } from "react";
import { requestReturn } from "@/app/actions/account";
import type { FormState } from "@/app/actions/contact";
import { RETURN_REASONS } from "@/lib/returns";

export function ReturnForm({ token, itemId }: { token: string; itemId: string }) {
  const [state, action, pending] = useActionState(requestReturn, { ok: false, message: "" } as FormState);
  if (state.ok) return <p className="alert alert-ok" role="status">{state.message}</p>;
  return (
    <details>
      <summary>Demander un retour</summary>
      <form action={action} className="buy-form" noValidate style={{ marginTop: ".6rem" }}>
        <input type="hidden" name="token" value={token} /><input type="hidden" name="item" value={itemId} />
        <label className="field">Motif<select className="input" name="reason" defaultValue=""><option value="" disabled>— Choisir —</option>{Object.entries(RETURN_REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field">Précisions (facultatif)<textarea className="input" name="details" maxLength={2000} style={{ minHeight: 80 }} /></label>
        <button className="btn btn-ghost btn-sm" disabled={pending}>{pending ? "Envoi…" : "Envoyer la demande"}</button>
        {state.message ? <p className="alert alert-err" role="alert">{state.message}</p> : null}
      </form>
    </details>
  );
}
