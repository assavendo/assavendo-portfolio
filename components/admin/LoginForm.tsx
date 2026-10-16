"use client";
import { useActionState } from "react";
import { signIn } from "@/app/actions/admin";
export function LoginForm() {
  const [s, action, pending] = useActionState(signIn, null as { error?: string } | null);
  return (
    <form action={action} style={{ display: "grid", gap: "1rem", maxWidth: 380 }}>
      <label className="field">E-mail<input className="input" type="email" name="email" autoComplete="username" required /></label>
      <label className="field">Mot de passe<input className="input" type="password" name="password" autoComplete="current-password" required minLength={8} /></label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</button>
      {s?.error ? <p className="alert alert-err" role="alert">{s.error}</p> : null}
    </form>
  );
}
