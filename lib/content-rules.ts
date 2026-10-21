import { isToolKey } from "./tool-keys.ts";

/** Un slug ne doit contenir ni code d'origine (« p01- »), ni segment purement numérique : le catalogue grandit sans numérotation. */
export function slugProblem(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "L'adresse ne doit contenir que des minuscules, des chiffres et des tirets.";
  if (/^p\d{1,3}-/.test(slug)) return "L'adresse ne doit pas commencer par un code numéroté (p01-…).";
  if (slug.split("-").some((s) => /^\d+$/.test(s))) return "L'adresse ne doit pas contenir de numéro isolé.";
  if (slug.length > 80) return "L'adresse est trop longue (80 caractères maximum).";
  return null;
}

export type PublishableProblem = {
  slug: string; title: string; hook: string; who: string; symptom: string; cost: string; cause: string; what_we_do: string;
  deliverables: string[]; outcome: string; stack: string[]; audiences: string[]; format: string; tool_key?: string | null; tool_intro?: string | null;
};

const REQUIRED: [keyof PublishableProblem, string][] = [
  ["hook", "l'accroche"], ["who", "« Pour qui »"], ["symptom", "« Ce que vous observez »"], ["cost", "« Ce que cela coûte »"],
  ["cause", "« Pourquoi cela arrive »"], ["what_we_do", "« Ce que fait Assavendo »"], ["outcome", "« Le résultat attendu »"],
];

/**
 * Règles bloquantes avant publication. Renvoie la liste des erreurs (vide = publiable).
 * Utilisée par le seed, l'administration et la commande `npm run check`.
 */
export function validatePublishable(p: PublishableProblem): string[] {
  const errors: string[] = [];
  const s = slugProblem(p.slug); if (s) errors.push(s);
  if (p.title.trim().length < 4) errors.push("Le titre est trop court.");
  for (const [k, label] of REQUIRED) if (!String(p[k] ?? "").trim()) errors.push(`Renseignez ${label}.`);
  if (!p.deliverables.filter((d) => d.trim()).length) errors.push("Ajoutez au moins un livrable concret.");
  if (!p.audiences.length) errors.push("Choisissez au moins un public.");
  if (p.symptom.trim() && p.symptom.trim() === p.cost.trim()) errors.push("« Ce que cela coûte » ne peut pas recopier le symptôme.");
  const last = p.deliverables.at(-1)?.trim();
  if (last && last === p.outcome.trim()) errors.push("Le résultat attendu ne peut pas recopier le dernier livrable.");
  if (new Set(p.deliverables.map((d) => d.trim())).size !== p.deliverables.length) errors.push("Les livrables contiennent des doublons.");
  if (p.deliverables.some((d) => d.trim() === p.cause.trim() || d.trim() === p.what_we_do.trim())) errors.push("Un livrable recopie la cause ou la méthode.");
  if (p.format === "tool" && !isToolKey(p.tool_key)) errors.push("Le format « outil » exige une clé d'outil existante ; sinon choisissez « Explication ».");
  if (p.format !== "tool" && p.tool_key) errors.push("Une fiche « Explication » ne peut pas référencer un outil.");
  if (p.stack.some((t) => /\.$/.test(t.trim()))) errors.push("Les technologies ne se terminent pas par un point.");
  // Une promesse absolue est refusée ; une phrase qui nie la garantie (« aucun classement n'est garanti ») reste autorisée.
  const promises = p.outcome.split(/(?<=[.!?])\s+/).filter((sentence) => !/\b(aucun|aucune|pas|jamais|sans)\b|\bn['’]/i.test(sentence));
  if (promises.some((sentence) => /\b(garanti[es]?|garantie|100 ?%|sans risque)\b/i.test(sentence))) errors.push("Le résultat attendu ne doit pas contenir de promesse absolue.");
  return errors;
}
