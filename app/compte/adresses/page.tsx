import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/customer";
import { deleteAddress } from "@/app/actions/account";
import { AddressForm } from "@/components/AddressForm";

export const metadata: Metadata = { title: "Mes adresses", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function Adresses({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const { sb, user } = await requireCustomer("/compte/adresses");
  const sp = await searchParams;
  const { data } = await sb.from("addresses").select("*").eq("user_id", user.id).order("created_at");
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 820 }}>
      <p><Link href="/compte">← Mon compte</Link></p>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)" }}>Mes adresses</h1>
      {sp.supprime === "1" ? <p className="alert alert-ok" role="status">Adresse supprimée.</p> : null}
      <p className="muted">Pour votre information : l&apos;adresse de livraison de chaque commande se saisit sur la page de paiement sécurisée.</p>
      {(data ?? []).length ? <ul className="plain">{(data ?? []).map((a) => (
        <li key={a.id} className="panel" style={{ marginBottom: ".8rem" }}>
          <strong>{a.label}</strong><br />{a.full_name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.postal_code} {a.city}, {a.country}{a.phone ? <><br />{a.phone}</> : null}
          <form action={deleteAddress} style={{ marginTop: ".5rem" }}><input type="hidden" name="id" value={a.id} /><button className="btn btn-ghost btn-sm">Supprimer<span className="sr-only"> {a.label}</span></button></form>
        </li>))}</ul> : <p className="panel">Aucune adresse enregistrée.</p>}
      <h2 style={{ fontSize: "1.3rem", marginTop: "2rem" }}>Ajouter une adresse</h2>
      <AddressForm />
    </div></div>
  );
}
