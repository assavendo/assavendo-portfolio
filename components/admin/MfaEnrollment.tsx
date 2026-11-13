"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function MfaEnrollment() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  async function start() {
    setBusy(true); setMessage("");
    try {
      const sb = supabaseBrowser();
      const { data: factors, error: listError } = await sb.auth.mfa.listFactors();
      if (listError) throw listError;

      for (const factor of factors?.all ?? []) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error: unenrollError } = await sb.auth.mfa.unenroll({ factorId: factor.id });
          if (unenrollError) throw unenrollError;
        }
      }

      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Assavendo Admin" });
      if (error || !data?.id || !data.totp) throw error ?? new Error("Configuration MFA impossible.");
      setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
    } catch {
      setMessage("Impossible de préparer le second facteur. Réessayez.");
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!setup) return;
    if (!/^\d{6}$/.test(code)) { setMessage("Saisissez le code à 6 chiffres affiché par votre application d'authentification."); return; }
    setBusy(true); setMessage("");
    try {
      const sb = supabaseBrowser();
      const { data: challenge, error: challengeError } = await sb.auth.mfa.challenge({ factorId: setup.id });
      if (challengeError || !challenge) throw challengeError ?? new Error("Challenge MFA impossible.");
      const { error } = await sb.auth.mfa.verify({ factorId: setup.id, challengeId: challenge.id, code });
      if (error) throw error;
      setSetup(null); setCode("");
      setMessage("Second facteur activé. Les prochaines connexions administrateur demanderont un code.");
      router.refresh();
    } catch {
      setMessage("Code MFA incorrect ou expiré. Vérifiez l'heure de votre téléphone et réessayez.");
    } finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <h2 style={{ fontSize: "1.2rem" }}>Configurer l'authentification à deux facteurs</h2>
      {!setup ? (
        <>
          <p className="muted">Utilisez une application TOTP (1Password, Google Authenticator, Authy, etc.). Aucun code secret n'est envoyé à Assavendo.</p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={start}>{busy ? "Préparation…" : "Configurer le 2FA"}</button>
        </>
      ) : (
        <div style={{ display: "grid", gap: ".8rem" }}>
          <p>Scannez le QR code, puis saisissez le code à 6 chiffres généré par votre application.</p>
          <div style={{ width: 220, maxWidth: "100%", padding: ".7rem", background: "#fff", borderRadius: 8 }}>
            <Image src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qr)}`} alt="QR code pour configurer le second facteur" width={220} height={220} unoptimized style={{ display: "block", width: "100%", height: "auto" }} />
          </div>
          <p className="small muted">Clé de secours manuelle : <code>{setup.secret}</code></p>
          <label className="field">Code de vérification
            <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={verify}>{busy ? "Vérification…" : "Activer le 2FA"}</button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setSetup(null)}>Annuler</button>
          </div>
        </div>
      )}
      {message ? <p className="alert alert-ok" role="status" style={{ marginTop: ".8rem" }}>{message}</p> : null}
    </div>
  );
}
