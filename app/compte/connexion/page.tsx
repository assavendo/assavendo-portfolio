import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerLoginForm } from "@/components/LoginForm";
import { currentCustomer, safeNext } from "@/lib/customer";

export const metadata: Metadata = { title: "Connexion", robots: { index: false }, alternates: { canonical: "/compte/connexion" } };
export const dynamic = "force-dynamic";
export default async function Connexion({ searchParams }: { searchParams: Promise<{ next?: string; erreur?: string }> }) {
  const sp = await searchParams; const next = safeNext(sp.next);
  if (await currentCustomer()) redirect(next);
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)" }}>Mon compte</h1>
      <p className="muted">Retrouvez vos commandes, vos téléchargements, vos favoris et vos adresses.</p>
      {sp.erreur === "lien" ? <p className="alert alert-err" role="alert">Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau ci-dessous.</p> : null}
      {sp.erreur === "config" ? <p className="alert alert-err" role="alert">Les comptes ne sont pas encore activés sur ce site.</p> : null}
      <CustomerLoginForm next={next} />
    </div></div>
  );
}
