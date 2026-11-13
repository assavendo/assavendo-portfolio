import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { isSupabaseConfigured } from "./env";

type AdminContext = {
  sb: Awaited<ReturnType<typeof supabaseServer>>;
  user: { id: string; email: string };
  mfaRequired: boolean;
};

/** Session + appartenance admin. Utilisé aussi par l'écran de sécurité MFA, avant challenge. */
export async function requireAdminBase() {
  if (!isSupabaseConfigured) redirect("/admin/login?erreur=config");
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data } = await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) redirect("/admin/login?erreur=droits");
  return { sb, user: { id: user.id, email: (user.email ?? "").toLowerCase() } };
}

/**
 * Vérifie la session, le rôle admin et impose le second facteur dès qu'un TOTP administrateur
 * vérifié existe sur le compte. Sans facteur encore enrôlé, l'accès reste possible pour permettre
 * le premier enrôlement depuis /admin/securite.
 */
export async function requireAdmin(nextPath = "/admin"): Promise<AdminContext> {
  const { sb, user } = await requireAdminBase();
  const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] = await Promise.all([
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    sb.auth.mfa.listFactors(),
  ]);
  if (aalError) console.error("[admin] AAL", aalError.message);
  if (factorsError) console.error("[admin] MFA factors", factorsError.message);
  const mfaRequired = (factors?.totp ?? []).some((f) => f.status === "verified");
  if (mfaRequired && aal?.currentLevel !== "aal2") {
    const safe = /^\/admin(?:\/[a-z0-9/_-]+)?$/.test(nextPath) ? nextPath : "/admin";
    redirect("/admin/mfa?next=" + encodeURIComponent(safe));
  }
  return { sb, user, mfaRequired };
}
