// Règles de retour (pures, testées). Le délai court à partir de la livraison ; à défaut de date de livraison enregistrée,
// de la date de paiement augmentée du délai de livraison maximal annoncé sur la fiche produit.
export type ReturnInput = { paid_at: string | null; delivered_at: string | null; delivery_max_days: number | null; return_days: number };
const DAY = 864e5;
export function returnDeadline(o: ReturnInput): Date | null {
  const start = o.delivered_at ? new Date(o.delivered_at).getTime() : o.paid_at ? new Date(o.paid_at).getTime() + (o.delivery_max_days ?? 0) * DAY : null;
  return start === null ? null : new Date(start + o.return_days * DAY);
}
export function canRequestReturn(o: ReturnInput & { kind: string; status: string }, now = new Date()): boolean {
  if (o.kind !== "physical" || o.status !== "paid" || o.return_days <= 0) return false;
  const d = returnDeadline(o); return d !== null && now.getTime() <= d.getTime();
}
export const RETURN_REASONS: Record<string, string> = { changed_mind: "J'ai changé d'avis", defective: "Produit défectueux", not_as_described: "Différent de la description", damaged: "Reçu endommagé", other: "Autre raison" };
export const RETURN_STATUS: Record<string, string> = { requested: "Demandé", approved: "Accepté : renvoyez le colis", refused: "Refusé", received: "Colis reçu", refunded: "Remboursé" };
