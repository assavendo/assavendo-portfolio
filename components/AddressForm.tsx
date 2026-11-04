"use client";
import { useActionState } from "react";
import { addAddress } from "@/app/actions/account";
import type { FormState } from "@/app/actions/contact";

export function AddressForm() {
  const [state, action, pending] = useActionState(addAddress, { ok: false, message: "" } as FormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="form-grid" noValidate>
      <label className="field">Libellé<input className="input" name="label" defaultValue={v.label ?? "Domicile"} /></label>
      <label className="field">Nom du destinataire<input className="input" name="full_name" autoComplete="name" defaultValue={v.full_name} /></label>
      <label className="field full">Adresse<input className="input" name="line1" autoComplete="address-line1" defaultValue={v.line1} /></label>
      <label className="field full">Complément<input className="input" name="line2" autoComplete="address-line2" defaultValue={v.line2} /></label>
      <label className="field">Code postal<input className="input" name="postal_code" autoComplete="postal-code" defaultValue={v.postal_code} /></label>
      <label className="field">Ville<input className="input" name="city" autoComplete="address-level2" defaultValue={v.city} /></label>
      <label className="field">Pays (code à 2 lettres)<input className="input" name="country" defaultValue={v.country ?? "FR"} maxLength={2} /></label>
      <label className="field">Téléphone (facultatif)<input className="input" name="phone" autoComplete="tel" defaultValue={v.phone} /></label>
      <div className="full"><button className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Ajouter l'adresse"}</button>
        {state.message ? <p className={`alert ${state.ok ? "alert-ok" : "alert-err"}`} role={state.ok ? "status" : "alert"} style={{ marginTop: ".8rem" }}>{state.message}</p> : null}</div>
    </form>
  );
}
