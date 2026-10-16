import { legal, missing } from "@/lib/legal";
export function Todo() {
  if (!missing.length) return null;
  return <p className="todo" role="note"><strong>À compléter avant la mise en ligne :</strong> {missing.join(", ")}. Renseignez les variables <code>LEGAL_*</code> dans l'environnement de déploiement.</p>;
}
export const v = (x?: string) => x ?? "[à compléter]";
export { legal };
