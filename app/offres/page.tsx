import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedProblems } from "@/lib/data";
import { offers, steps } from "@/lib/site-content";
import { DomainArt } from "@/components/DomainArt";

export const revalidate = 120;
export const metadata: Metadata = { title: "Offres", description: "Les quatre domaines dans lesquels Assavendo intervient, et la façon dont une proposition écrite est établie avant tout engagement.", alternates: { canonical: "/offres" } };

export default async function Offres() {
  const problems = await getPublishedProblems();
  const count = (slug: string) => problems.filter((p) => p.domains?.slug === slug).length;
  return (
    <div className="section"><div className="wrap">
      <div className="section-head"><p className="eyebrow">Offres</p><h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Quatre domaines, une proposition écrite avant tout engagement</h1>
        <p className="lede">Nous intervenons sur des problèmes précis plutôt que de vendre des forfaits génériques. Chaque situation est différente : vous recevez un document qui détaille le périmètre, les livrables, le délai et le prix.</p></div>
      <div className="offers">
        {offers.map((o) => (
          <article key={o.domain} className="offer" style={{ cursor: "default" }}>
            <div className="offer-icon" style={{ overflow: "hidden", padding: 0 }}><DomainArt slug={o.domain} /></div>
            <h2 style={{ fontSize: "1.3rem", margin: 0 }}>{o.title}</h2><p>{o.text}</p>
            <ul>{o.points.map((x) => <li key={x}>{x}</li>)}</ul>
            <Link className="more" href={`/problemes?domaine=${o.domain}`}>Voir les problèmes liés ({count(o.domain)}) →</Link>
          </article>
        ))}
      </div>
      <section className="section-tight" style={{ marginTop: "3rem" }} aria-labelledby="devis">
        <div className="section-head"><h2 id="devis">Comment une proposition est établie</h2><p className="muted">Pas de tarif affiché hors contexte : un prix n'a de sens qu'avec un périmètre.</p></div>
        <ol className="steps">{steps.map((s) => <li key={s.title}><h3>{s.title}</h3><p>{s.text}</p></li>)}</ol>
      </section>
      <div className="cta-band" style={{ marginTop: "3rem" }}>
        <div><h2>Parlons de votre situation</h2><p>Décrivez ce que vous observez : nous revenons vers vous sous deux jours ouvrés avec un premier avis clair.</p></div>
        <Link className="btn btn-signal btn-lg" href="/contact?sujet=Demande%20de%20proposition">Demander une proposition</Link>
      </div>
    </div></div>
  );
}
