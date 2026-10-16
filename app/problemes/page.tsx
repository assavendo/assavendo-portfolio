import type { Metadata } from "next";
import Link from "next/link";
import { getDomains, searchProblems } from "@/lib/data";
import { ProblemCard } from "@/components/ProblemCard";

export const metadata: Metadata = { title: "Problèmes web résolus", description: "Les problèmes qui coûtent des clients aux entreprises en ligne, expliqués simplement, avec ce que nous faisons et, quand c'est possible, un outil à essayer.", alternates: { canonical: "/problemes" } };
type SP = Promise<{ q?: string; domaine?: string; format?: string; public?: string }>;

export default async function Catalogue({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [domains, results] = await Promise.all([getDomains(), searchProblems({ q: sp.q?.slice(0, 80), domain: sp.domaine, format: sp.format, audience: sp.public })]);
  const active = Boolean(sp.q || sp.domaine || sp.format || sp.public);
  return (
    <div className="section">
      <div className="wrap">
        <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Problèmes web résolus</h1>
        <p className="muted">Chaque fiche décrit ce que vous observez, ce que cela coûte, ce que nous faisons, et propose un outil réel lorsque c'est pertinent.</p>
        <form className="filters" role="search" aria-label="Filtrer les problèmes">
          <label className="field">Rechercher<input className="input" type="search" name="q" defaultValue={sp.q} placeholder="lent, paiement, Google, e-mails…" /></label>
          <label className="field">Domaine<select className="input" name="domaine" defaultValue={sp.domaine ?? ""}><option value="">Tous les domaines</option>{domains.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></label>
          <label className="field">Contenu<select className="input" name="format" defaultValue={sp.format ?? ""}><option value="">Tous</option><option value="tool">Avec un outil à tester</option><option value="study">Explication détaillée</option></select></label>
          <label className="field">Public<select className="input" name="public" defaultValue={sp.public ?? ""}><option value="">Tous</option><option value="entreprise">Entreprises</option><option value="particulier">Particuliers</option></select></label>
          <button className="btn btn-primary">Filtrer</button>
        </form>
        <p aria-live="polite" className="muted">{results.length} {results.length > 1 ? "résultats" : "résultat"}{active ? <> · <Link href="/problemes">Réinitialiser</Link></> : null}</p>
        {results.length ? <div className="cards">{results.map((p) => <ProblemCard key={p.id} p={p} />)}</div> : (
          <div className="panel"><h2 style={{ fontSize: "1.3rem" }}>Aucun problème ne correspond à cette recherche</h2><p>Essayez un mot plus général, ou décrivez votre situation : c'est peut-être le prochain cas que nous ajouterons.</p><Link className="btn btn-primary" href="/contact">Décrire votre situation</Link></div>
        )}
      </div>
    </div>
  );
}
