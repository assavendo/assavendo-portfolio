import type { Metadata } from "next";
import { verifyAdminMfa } from "@/app/actions/admin";
import { requireAdminBase } from "@/lib/admin";

export const metadata: Metadata = { title: "Vérification administrateur", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MfaChallenge({ searchParams }: { searchParams: Promise<{ next?: string; erreur?: string }> }) {
  const { sb } = await requireAdminBase();
  const sp = await searchParams;
  const { data: factors } = await sb.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  const next = /^\/admin(?:\/[a-z0-9/_-]+)?$/.test(sp.next ?? "") ? sp.next! : "/admin";
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!factor) return <div className="section"><div className="wrap" style={{ maxWidth: 520 }}><h1>Second facteur non configuré</h1><p>Configurez d'abord le 2FA dans <a href="/admin/securite">Sécurité administrateur</a>.</p></div></div>;
  if (aal?.currentLevel === "aal2") return <div className="section"><div className="wrap" style={{ maxWidth: 520 }}><p>Vérification déjà validée. <a href={next}>Continuer</a>.</p></div></div>;
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 520 }}>
      <h1>Vérification administrateur</h1>
      <p className="muted">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.</p>
      {sp.erreur === "1" ? <p className="alert alert-err" role="alert">Le code fourni est incorrect ou expiré.</p> : null}
      <form action={verifyAdminMfa} className="buy-form">
        <input type="hidden" name="next" value={next} />
        <label className="field">Code à 6 chiffres
          <input className="input" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} minLength={6} pattern="[0-9]{6}" required />
        </label>
        <button className="btn btn-primary btn-lg" type="submit">Vérifier</button>
      </form>
    </div></div>
  );
}
