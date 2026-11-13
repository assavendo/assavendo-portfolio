import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { unenrollAdminMfa } from "@/app/actions/admin";
import { MfaEnrollment } from "@/components/admin/MfaEnrollment";

export const metadata: Metadata = { title: "Sécurité administrateur", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Securite({ searchParams }: { searchParams: Promise<{ mfa?: string; erreur?: string }> }) {
  const { sb } = await requireAdmin("/admin/securite");
  const sp = await searchParams;
  const { data: factors } = await sb.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
  return (
    <div>
      <h1 style={{ fontSize: "1.8rem" }}>Sécurité administrateur</h1>
      {sp.erreur === "confirmation" ? <p className="alert alert-err" role="alert">Tapez exactement « DESACTIVER » pour confirmer.</p> : null}
      {sp.mfa === "off" ? <p className="alert alert-ok" role="status">Le second facteur a été désactivé. Réactivez-le avant la prochaine ouverture commerciale.</p> : null}
      {verified.length ? (
        <section className="panel">
          <h2 style={{ fontSize: "1.2rem" }}>2FA actif</h2>
          <p>Ce compte administrateur est protégé par un authentificateur TOTP. Les accès à l'administration demandent désormais le code du second facteur.</p>
          <form action={unenrollAdminMfa} style={{ marginTop: "1rem", display: "grid", gap: ".6rem", maxWidth: 420 }}>
            <input type="hidden" name="factorId" value={verified[0].id} />
            <label className="field">Confirmation
              <input className="input" name="confirm" autoComplete="off" placeholder="DESACTIVER" />
            </label>
            <button className="btn btn-ghost" type="submit">Désactiver temporairement le 2FA</button>
          </form>
        </section>
      ) : (
        <>
          <p className="alert alert-err" role="alert">Le compte administrateur n'a pas encore de second facteur actif. Tant que vous n'en avez pas configuré, le mot de passe reste le seul facteur d'accès à l'administration.</p>
          <MfaEnrollment />
        </>
      )}
    </div>
  );
}
