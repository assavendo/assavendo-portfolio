/** Images fournisseur publiques : HTTPS uniquement, sans identifiants URL et hors hôtes locaux/privés. */
export function isAllowedImageUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" || x.username || x.password) return false;
    const host = x.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host === "metadata.google.internal") return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|::1$)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch { return false; }
}
