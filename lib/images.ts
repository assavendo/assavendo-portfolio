const DEFAULT_ALLOWED_IMAGE_HOSTS = ["cf.cjdropshipping.com", "oss-cf.cjdropshipping.com", "images.unsplash.com", "supabase.co"];

export function allowedImageHosts(): string[] {
  const configured = String(process.env.ASSAVENDO_ALLOWED_IMAGE_HOSTS ?? "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_IMAGE_HOSTS, ...configured])];
}

function hostnameAllowed(host: string): boolean {
  const normalized = host.toLowerCase();
  return allowedImageHosts().some((allowed) => normalized === allowed || (allowed === "supabase.co" && normalized.endsWith(".supabase.co")) || normalized.endsWith("." + allowed));
}

/** Images externes : HTTPS, hôte explicitement autorisé, sans identifiants et hors réseau privé. */
export function isAllowedImageUrl(u: string): boolean {
  try {
    const x = new URL(u);
    const host = x.hostname.toLowerCase();
    if (x.protocol !== "https:" || x.username || x.password) return false;
    if (!host || !hostnameAllowed(host)) return false;
    if (host === "localhost" || host.endsWith(".local") || host === "metadata.google.internal") return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|::1$)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch { return false; }
}

/** Retourne une URL interne pour ne pas exposer le domaine fournisseur au navigateur client. */
export function publicImageUrl(url: string, supplier = false): string {
  if (!supplier || !isAllowedImageUrl(url)) return url;
  return "/api/media/image?url=" + encodeURIComponent(url);
}
