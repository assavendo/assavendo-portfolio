"use client";
import { useActionState } from "react";
import { sendLoginLink } from "@/app/actions/account";
import type { FormState } from "@/app/actions/contact";
import { Turnstile } from "./Turnstile";

export function CustomerLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendLoginLink, { ok: false, message: "" } as FormState);
  if (state.ok) return <p className="alert alert-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="buy-form" noValidate>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <input type="hidden" name="next" value={next} />
      <label className="field">Adresse e-mail<input className="input" type="email" name="email" autoComplete="email" required defaultValue={state.values?.email} /></label>
      <Turnstile resetKey={state} />
      <button className="btn btn-primary btn-lg" disabled={pending}>{pending ? "Envoi…" : "Recevoir mon lien de connexion"}</button>
      {state.message ? <p className="alert alert-err" role="alert">{state.message}</p> : null}
      <p className="muted small">Pas de mot de passe : nous vous envoyons un lien à usage unique. Si vous n&apos;avez pas encore de compte, il est créé automatiquement.</p>
    </form>
  );
}
