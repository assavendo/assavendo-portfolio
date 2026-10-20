import { createHash } from "node:crypto";

/**
 * Empreinte irréversible d'une adresse IP (consentements, journal de téléchargement) : l'adresse elle-même n'est jamais stockée.
 * Le sel vient de IP_HASH_SALT ; à défaut, de la clé secrète Supabase (serveur uniquement).
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || process.env.SUPABASE_SECRET_KEY || "assavendo";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
