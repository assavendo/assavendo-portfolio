"use client";
import { useActionState } from "react";
import { replySupportTicket } from "@/app/actions/support";
import type { FormState } from "@/app/actions/contact";
import { Turnstile } from "./Turnstile";

export function SupportReplyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(replySupportTicket, { ok: false, message: "" });
  return (
    <form action={action} className="form-grid" noValidate>
      <input type="hidden" name="token" value={token} />
      <label className="field full">Ajouter un message<textarea className="input" name="body" minLength={2} maxLength={5000} required placeholder="Votre réponse ou une précision supplémentaire." /></label>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <Turnstile className="full" resetKey={state} />
      <div className="full">
        {state.message ? <p className={state.ok ? "alert alert-ok" : "alert alert-err"} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
        <button className="btn btn-primary" disabled={pending || state.ok}>{pending ? "Envoi…" : "Ajouter le message"}</button>
      </div>
    </form>
  );
}
