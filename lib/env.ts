/**
 * Configuration publique. En production, l'adresse du site est OBLIGATOIRE : aucun repli sur localhost
 * (les canoniques, le sitemap et les données structurées en dépendent).
 */
function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  const isProd = env.NODE_ENV === "production";
  const isVercelPreview = env.VERCEL_ENV === "preview" && env.VERCEL_URL;
  const raw = explicit || (isVercelPreview ? `https://${env.VERCEL_URL}` : undefined) || (isProd ? undefined : "http://localhost:3000");
  if (!raw) throw new Error("NEXT_PUBLIC_SITE_URL est obligatoire en production (adresse publique complète, en https).");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`NEXT_PUBLIC_SITE_URL est invalide : « ${raw} ».`); }
  if (isProd && (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) || url.protocol !== "https:")) {
    throw new Error("NEXT_PUBLIC_SITE_URL doit être une adresse https publique en production (pas localhost).");
  }
  return url.origin;
}
export { resolveSiteUrl };

export const siteUrl = resolveSiteUrl();
export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
/** Production Vercel (et pas une préproduction ni la CI) : aucun repli de contenu n'est toléré. */
export const isProductionDeployment = process.env.VERCEL_ENV === "production";
/** Contenu local autorisé uniquement hors production, quand Supabase n'est pas configuré (développement, CI, aperçu). */
export const allowLocalContent = !isSupabaseConfigured && !isProductionDeployment;
