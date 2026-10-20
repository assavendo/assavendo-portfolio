/** Hôtes d'images acceptés : doivent correspondre à `images.remotePatterns` de next.config.mjs, sinon next/image refuse l'image. */
export function isAllowedImageUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && (x.hostname === "images.unsplash.com" || x.hostname.endsWith(".supabase.co"));
  } catch { return false; }
}
