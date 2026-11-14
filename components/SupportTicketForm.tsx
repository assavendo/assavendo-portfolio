"use client";
import { useActionState } from "react";
import { createSupportTicket } from "@/app/actions/support";
import type { FormState } from "@/app/actions/contact";
import { Turnstile } from "./Turnstile";

const initial: FormState = { ok: false, message: "" };
const CATEGORIES = ["Commande", "Paiement", "Livraison", "Numérique", "Retour", "Compte", "Avis", "Autre"];

export function SupportTicketForm() {
  const [state, action, pending] = useActionState(createSupportTicket, initial);
  const values = state.values ?? {};
  const ticketUrl = values.ticketUrl;
  return (
    <form action={action} className="form-grid" noValidate>
      <label className="field">Nom<input className="input" name="name" autoComplete="name" required defaultValue={values.name} /></label>
      <label className="field">E-mail<input className="input" type="email" name="email" autoComplete="email" required defaultValue={values.email} /></label>
      <label className="field">Catégorie<select className="input" name="category" defaultValue={values.category ?? "Commande"}>{CATEGORIES.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="field">Numéro de commande (facultatif)<input className="input" name="order_reference" maxLength={80} placeholder="Ex. AV-20261114-ABCD1234" defaultValue={values.order_reference} /></label>
      <label className="field full">Sujet<input className="input" name="subject" maxLength={180} required defaultValue={values.subject} /></label>
      <label className="field full">Votre message<textarea className="input" name="body" minLength={10} maxLength={5000} required defaultValue={values.body} placeholder="Décrivez le problème, ce que vous avez déjà essayé et ce que vous attendez." /></label>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <Turnstile className="full" resetKey={state} />
      <label className="full check"><input type="checkbox" name="consent" required defaultChecked={values.consent === "on"} /><span>J'accepte le traitement de ma demande conformément à la <a href="/confidentialite">politique de confidentialité</a>.</span></label>
      <div className="full">
        {state.ok ? <div className="alert alert-ok" role="status"><p>{state.message}</p>{ticketUrl ? <p><a className="btn btn-primary btn-sm" href={ticketUrl}>Ouvrir mon ticket</a></p> : null}</div> : null}
        {!state.ok && state.message ? <p className="alert alert-err" role="alert">{state.message}</p> : null}
        {!state.ok ? <button className="btn btn-primary" disabled={pending}>{pending ? "Création…" : "Créer un ticket"}</button> : null}
      </div>
    </form>
  );
}
