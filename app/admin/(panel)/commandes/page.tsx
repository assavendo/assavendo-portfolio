import { requireAdmin } from "@/lib/admin";
import { eur } from "@/lib/types";
export default async function Commandes() {
  const { sb } = await requireAdmin();
  const { data } = await sb.from("orders").select("id, customer_email, amount_cents, status, created_at, paid_at, download_count, products(title)").order("created_at", { ascending: false }).limit(100);
  const label: Record<string, string> = { pending: "En attente", paid: "Payée", canceled: "Annulée", refunded: "Remboursée" };
  return <div><h1 style={{ fontSize: "1.8rem" }}>Commandes</h1>
    {(data ?? []).length === 0 ? <p className="panel">Aucune commande.</p> : <div className="table-scroll"><table className="tbl"><thead><tr><th>Date</th><th>Produit</th><th>Client</th><th>Montant</th><th>Statut</th><th>Téléchargements</th></tr></thead><tbody>
      {(data as any[]).map((o) => <tr key={o.id}><td>{new Date(o.created_at).toLocaleDateString("fr-FR")}</td><td>{o.products?.title}</td><td>{o.customer_email}</td><td>{eur(o.amount_cents)}</td><td>{label[o.status]}</td><td>{o.download_count}/5</td></tr>)}</tbody></table></div>}
    <p className="muted small" style={{ marginTop: "1rem" }}>Les remboursements se font dans le tableau de bord Stripe ; le statut se met à jour automatiquement.</p></div>;
}
