export type Proposal = { title: string; summary: string; description: string; kind: "physical" | "digital" | "service"; price_eur: number; features: string[]; tags: string[] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Extrait un objet JSON d'une réponse de modèle (avec ou sans bloc de code), puis le valide strictement : le contenu de l'IA n'est jamais pris tel quel. */
export function parseProposal(text: string): { ok: true; value: Proposal } | { ok: false; error: string } {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "Aucun JSON dans la réponse de l'IA." };
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]); } catch { return { ok: false, error: "JSON invalide dans la réponse de l'IA." }; }
  const title = str(o.title, 160), summary = str(o.summary, 300);
  if (title.length < 4) return { ok: false, error: "Titre manquant ou trop court." };
  if (summary.length < 10) return { ok: false, error: "Résumé manquant ou trop court." };
  const kind = o.kind === undefined ? "digital" : o.kind;
  if (kind !== "physical" && kind !== "digital" && kind !== "service") return { ok: false, error: "Type de produit inconnu." };
  const price = o.price_eur === undefined || o.price_eur === "" ? 0 : Number(o.price_eur);
  if (!Number.isFinite(price) || price < 0 || price > 100000) return { ok: false, error: "Prix invalide." };
  return { ok: true, value: { title, summary, description: str(o.description, 6000), kind, price_eur: price, features: list(o.features, 10, 200), tags: list(o.tags, 10, 40) } };
}

/**
 * Une réponse n'est envoyée sans validation (mode « auto ») que si elle est courte, sans lien externe, sans adresse e-mail ni numéro
 * et sans engagement financier. Dans tous les autres cas elle reste un brouillon à valider.
 */
export function safeToAutoSend(body: string, siteHost: string): boolean {
  if (body.length < 20 || body.length > 1500) return false;
  const urls = body.match(/https?:\/\/[^\s)>"]+/gi) ?? [];
  if (urls.some((u) => { try { return new URL(u).hostname !== siteHost; } catch { return true; } })) return false;
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(body)) return false;
  if (/\b(rembours|geste commercial|remise|réduction|gratuit|garantie à vie|virement|iban)\w*/i.test(body)) return false;
  return true;
}
