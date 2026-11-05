// Règles pures du routeur (aucun accès réseau ni base) : testables seules.
export type KeyRow = {
  id: string; provider: string; label: string; base_url: string; model: string; secret_enc: string; key_hint: string; roles: string[];
  priority: number; enabled: boolean; cooldown_until: string | null; fail_count: number; daily_limit: number | null; used_day: string; used_today: number;
};
export type Failure = { kind: "rate_limit" | "quota" | "auth" | "model" | "server" | "network" | "bad_request"; cooldownSec: number; disable: boolean; retryNext: boolean; message: string };

export const ROLES = ["general", "support", "recherche", "catalogue"] as const;
export const PRESETS: Record<string, { baseUrl: string; model: string; label: string }> = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", label: "OpenRouter" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", label: "Groq" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", label: "DeepSeek" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", label: "OpenAI" },
  custom: { baseUrl: "", model: "", label: "Compatible OpenAI (personnalisé)" },
};

/** Que faire d'une clé après une réponse d'erreur : attendre, désactiver, ou passer à la suivante. */
export function classifyFailure(status: number | null, retryAfterSec?: number | null, detail = ""): Failure {
  const msg = detail.slice(0, 200);
  if (status === null) return { kind: "network", cooldownSec: 60, disable: false, retryNext: true, message: msg || "Réseau indisponible" };
  if (status === 429) return { kind: "rate_limit", cooldownSec: Math.min(Math.max(retryAfterSec ?? 60, 10), 3600), disable: false, retryNext: true, message: "Limite de débit atteinte" };
  if (status === 402) return { kind: "quota", cooldownSec: 6 * 3600, disable: false, retryNext: true, message: "Crédit ou quota épuisé" };
  if (status === 401 || status === 403) return { kind: "auth", cooldownSec: 0, disable: true, retryNext: true, message: "Clé refusée (invalide, révoquée ou sans droit)" };
  if (status === 404) return { kind: "model", cooldownSec: 600, disable: false, retryNext: true, message: "Modèle ou adresse introuvable pour cette clé" };
  if (status >= 500) return { kind: "server", cooldownSec: 60, disable: false, retryNext: true, message: `Erreur du fournisseur (${status})` };
  return { kind: "bad_request", cooldownSec: 0, disable: false, retryNext: false, message: msg || `Requête refusée (${status})` };
}

/** Clés utilisables pour un rôle, dans l'ordre : priorité croissante, puis la moins sollicitée aujourd'hui. */
export function candidates(keys: KeyRow[], role: string, now = new Date()): KeyRow[] {
  const today = now.toISOString().slice(0, 10);
  return keys
    .filter((k) => k.enabled && (k.roles.includes(role) || k.roles.includes("general")))
    .filter((k) => !k.cooldown_until || new Date(k.cooldown_until) <= now)
    .filter((k) => k.daily_limit == null || (k.used_day === today ? k.used_today : 0) < k.daily_limit)
    .sort((a, b) => a.priority - b.priority || (a.used_day === today ? a.used_today : 0) - (b.used_day === today ? b.used_today : 0));
}
/** Une clé dédiée au rôle passe avant une clé « general » de même priorité. */
export const specificFirst = (list: KeyRow[], role: string) => [...list].sort((a, b) => a.priority - b.priority || Number(b.roles.includes(role)) - Number(a.roles.includes(role)));

/** Masque tout ce qui ressemble à une clé dans un texte destiné aux journaux ou à l'écran. */
export const scrub = (s: string) => s.replace(/(sk|gsk|or|xai|pk)[-_][A-Za-z0-9_\-]{12,}/g, "[clé masquée]").replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [masqué]");
