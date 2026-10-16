"use client";
import { useActionState } from "react";
import Script from "next/script";
import { submitContact, type FormState } from "@/app/actions/contact";

const initial: FormState = { ok: false, message: "" };
export function ContactForm({ defaultMessage = "" }: { defaultMessage?: string }) {
  const [state, action, pending] = useActionState(submitContact, initial);
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (state.ok) return <div className="alert alert-ok" role="status">{state.message}</div>;
  return (
    <form action={action} className="form-grid" noValidate>
      <label className="field">Nom<input className="input" name="name" autoComplete="name" required /></label>
      <label className="field">Adresse e-mail<input className="input" type="email" name="email" autoComplete="email" required /></label>
      <label className="field full">Type de projet (facultatif)
        <select className="input" name="projectType" defaultValue=""><option value="">Je ne sais pas encore</option><option>Site vitrine ou refonte</option><option>Boutique en ligne et paiements</option><option>Sécurité ou conformité</option><option>Automatisation ou IA</option><option>Données et tableaux de bord</option><option>Autre besoin</option></select>
      </label>
      <label className="field full">Votre besoin<textarea className="input" name="message" defaultValue={defaultMessage} required minLength={12} placeholder="Décrivez la situation, ce que vous observez et ce que cela vous coûte." /></label>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {site ? <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" /><div className="cf-turnstile full" data-sitekey={site} /></> : null}
      <label className="full" style={{ display: "flex", gap: ".6rem", alignItems: "flex-start", fontSize: ".92rem" }}>
        <input type="checkbox" name="consent" required style={{ marginTop: ".3rem" }} />
        <span>J'accepte que mes informations soient utilisées pour répondre à ma demande, conformément à la <a href="/confidentialite">politique de confidentialité</a>.</span>
      </label>
      <div className="full">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Envoi en cours…" : "Envoyer ma demande"}</button>
        {state.message ? <p role="alert" className="alert alert-err" style={{ marginTop: "1rem" }}>{state.message}</p> : null}
      </div>
    </form>
  );
}
