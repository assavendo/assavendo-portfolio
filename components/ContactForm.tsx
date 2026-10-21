"use client";
import { useActionState } from "react";
import { submitContact, type FormState } from "@/app/actions/contact";
import { Turnstile } from "./Turnstile";

const initial: FormState = { ok: false, message: "" };
const TYPES = ["Site vitrine ou refonte", "Boutique en ligne et paiements", "Sécurité ou conformité", "Automatisation ou IA", "Données et tableaux de bord", "Autre besoin"];

export function ContactForm({ defaultMessage = "" }: { defaultMessage?: string }) {
  const [state, action, pending] = useActionState(submitContact, initial);
  const v = state.values ?? {};
  if (state.ok) return <div className="alert alert-ok" role="status">{state.message}</div>;
  return (
    <form action={action} className="form-grid" noValidate>
      <label className="field">Nom<input className="input" name="name" autoComplete="name" required defaultValue={v.name} /></label>
      <label className="field">Adresse e-mail<input className="input" type="email" name="email" autoComplete="email" required defaultValue={v.email} /></label>
      <label className="field full">Type de projet (facultatif)
        <select className="input" name="projectType" defaultValue={v.projectType ?? ""}><option value="">Je ne sais pas encore</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="field full">Votre besoin<textarea className="input" name="message" defaultValue={v.message ?? defaultMessage} required minLength={12} placeholder="Décrivez la situation, ce que vous observez et ce que cela vous coûte." /></label>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <Turnstile className="full" resetKey={state} />
      <label className="full check">
        <input type="checkbox" name="consent" required defaultChecked={v.consent === "on"} />
        <span>J'accepte que mes informations soient utilisées pour répondre à ma demande, conformément à la <a href="/confidentialite">politique de confidentialité</a>.</span>
      </label>
      <div className="full">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Envoi en cours…" : "Envoyer ma demande"}</button>
        {state.message ? <p role="alert" className="alert alert-err" style={{ marginTop: "1rem" }}>{state.message}</p> : null}
      </div>
    </form>
  );
}
