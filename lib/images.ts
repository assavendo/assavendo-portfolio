const BUILTIN_IMAGE_HOSTS = new Set([
  "cf.cjdropshipping.com",
  "oss-cf.cjdropshipping.com",
  "guedhfqivccvoveeqtch.supabase.co",
]);
function approvedImageHosts(): Set<string> {
  const hosts = new Set(BUILTIN_IMAGE_HOSTS);
  for (const entry of (process.env.SUPPLIER_IMAGE_HOSTS ?? "").split(",")) {
    const host = entry.trim().toLowerCase().replace(/\.$/, "");
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host)) hosts.add(host);
  }
  return hosts;
}
/** Images HTTPS uniquement depuis des domaines fournisseur explicitement autorisés. */
export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    return approvedImageHosts().has(url.hostname.toLowerCase().replace(/\.$/, ""));
  } catch {
    return false;
  }
}
