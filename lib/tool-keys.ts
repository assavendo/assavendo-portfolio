/** Identifiants des outils interactifs réellement opérationnels (à tenir synchronisé avec components/ToolRunner.tsx et la table SQL tool_keys). */
export const toolKeys = ["seo", "headers", "email-auth", "roas", "cart", "abtest", "password-leak", "image-compress", "pagespeed"] as const;
export type ToolKey = (typeof toolKeys)[number];

export function isToolKey(key: string | null | undefined): key is ToolKey {
  return typeof key === "string" && (toolKeys as readonly string[]).includes(key);
}

/**
 * Source unique de vérité : une fiche « a un outil » si et seulement si son format est « tool »
 * ET que sa clé correspond à un outil réellement construit. Badge, compteur et page utilisent cette fonction.
 */
export function hasOperationalTool(p: { format: string; tool_key: string | null | undefined }): boolean {
  return p.format === "tool" && isToolKey(p.tool_key);
}

/** Limites annoncées sous chaque outil : un outil heuristique ne se présente jamais comme un audit complet. */
export const toolLimits: Record<ToolKey, string> = {
  seo: "Analyse du code HTML reçu, sans exécuter JavaScript : un site qui construit sa page dans le navigateur peut sembler pauvre ici alors que Google le voit autrement. Heuristique indicative, pas un audit complet.",
  headers: "Lit uniquement les en-têtes renvoyés par l'adresse indiquée. Ne remplace ni un audit de sécurité ni un test d'intrusion.",
  "email-auth": "Contrôle SPF, DMARC et les sélecteurs DKIM les plus courants. Un sélecteur personnalisé ne peut pas être deviné : son absence ici ne prouve pas qu'il n'existe pas.",
  roas: "Modèle de calcul fondé sur les chiffres que vous saisissez. Aide au calcul, pas un conseil financier.",
  cart: "Estimation fondée sur vos propres chiffres. Elle illustre un ordre de grandeur, pas un engagement de résultat.",
  abtest: "Méthode statistique classique, valable pour un test préparé à l'avance et non interrompu en cours de route.",
  "password-leak": "Indique si un mot de passe figure dans des fuites connues, pas s'il est solide. N'utilisez pas un mot de passe que vous employez encore.",
  "image-compress": "La compression s'effectue dans votre navigateur : vos images ne sont envoyées nulle part. Vérifiez toujours le rendu avant de remplacer un fichier.",
  pagespeed: "Mesure de laboratoire (téléphone simulé) fournie par Google PageSpeed Insights : elle varie d'une mesure à l'autre et ne garantit ni classement ni ventes.",
};
