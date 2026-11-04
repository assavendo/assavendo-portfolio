import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/customer";
import { supabaseAdmin } from "@/lib/supabase/server";
import { signOutCustomer, deleteAccount } from "@/app/actions/account";
import { eur } from "@/lib/types";
import { RETURN_STATUS } from "@/lib/returns";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false }, alternates: { canonical: "/compte" } };
export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { pending: "En attente", paid: "Payée", canceled: "Annulée", refunded: "Remboursée" };

export default async function Compte({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const sp = await searchParams;
  const { user } = await requireCustomer("/compte");
  const db = supabaseAdmin();
  const { data: orders } = await db.from("orders").select("id, order_number, status, amount_cents, created_at, access_token, fulfilment").eq("customer_email", user.email).neq("status", "pending").order("created_at", { ascending: false }).limit(50);
  const { data: returns } = await db.from("return_requests").select("id, status, created_at, order_items(title)").eq("email", user.email).order("created_at", { ascending: false }).limit(20);
  const d = (s: string) => new Date(s).toLocaleDateString("fr-FR");
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)" }}>Mon compte</h1>
      <p className="muted">Connecté avec <strong>{user.email}</strong></p>
      <nav aria-label="Espace client" className="chips" style={{ margin: "1rem 0" }}>
        <li><Link className="chip" href="/compte/favoris">Mes favoris</Link></li><li><Link className="chip" href="/compte/adresses">Mes adresses</Link></li><li><Link className="chip" href="/compte/export">Exporter mes données</Link></li>
        <li><form action={signOutCustomer}><button className="chip" type="submit">Me déconnecter</button></form></li>
      </nav>
      {sp.erreur === "confirmation" ? <p className="alert alert-err" role="alert">Tapez SUPPRIMER pour confirmer.</p> : null}
      <h2 style={{ fontSize: "1.4rem" }}>Mes commandes</h2>
      {!orders?.length ? <p className="panel">Aucune commande pour le moment. <Link href="/boutique">Voir la boutique</Link></p> : (
        <div className="table-scroll"><table className="tbl"><thead><tr><th>Commande</th><th>Date</th><th>Statut</th><th>Total</th><th /></tr></thead><tbody>
          {orders.map((o) => <tr key={o.id}><td>{o.order_number ?? "—"}</td><td>{d(o.created_at)}</td><td>{STATUS[o.status] ?? o.status}</td><td>{eur(o.amount_cents)}</td><td>{o.access_token ? <Link href={`/commande/${o.access_token}`}>Détail, téléchargements, retour</Link> : null}</td></tr>)}
        </tbody></table></div>
      )}
      {returns?.length ? <><h2 style={{ fontSize: "1.4rem", marginTop: "2rem" }}>Mes retours</h2><ul className="plain">{returns.map((r) => <li key={r.id}>{(r.order_items as unknown as { title: string } | null)?.title} — {RETURN_STATUS[r.status]} ({d(r.created_at)})</li>)}</ul></> : null}
      <details className="panel" style={{ marginTop: "2.5rem" }}>
        <summary>Supprimer mon compte</summary>
        <p className="muted small">Vos favoris, adresses et données de contact sont effacés ; vos commandes sont anonymisées (les pièces comptables sont conservées sans lien avec votre identité). Action irréversible.</p>
        <form action={deleteAccount} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "end" }}>
          <label className="field">Tapez SUPPRIMER pour confirmer<input className="input" name="confirm" autoComplete="off" /></label>
          <button className="btn btn-ghost btn-sm">Supprimer définitivement</button>
        </form>
      </details>
    </div></div>
  );
}
