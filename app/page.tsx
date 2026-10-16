import Link from "next/link";
import { getDomains, getPublishedProblems } from "@/lib/data";
import { ProblemCard } from "@/components/ProblemCard";
import { ToolRunner } from "@/components/ToolRunner";

export const revalidate = 120;

export default async function Home() {
  const [domains, problems] = await Promise.all([getDomains(), getPublishedProblems()]);
  const featured = problems.filter((p) => p.featured).slice(0, 6);
  const count = (slug: string) => problems.filter((p) => p.domains?.slug === slug).length;
  const toolCount = problems.filter((p) => p.format === "tool").length;
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>Les problèmes web qui coûtent des clients, résolus pour de bon.</h1>
            <p className="lede">Assavendo conçoit, répare et sécurise les sites, boutiques et outils de gestion des entreprises. Chaque problème traité ici s'accompagne, quand c'est possible, d'un outil que vous pouvez essayer vous-même, sur vos propres données.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary" href="/contact">Décrire votre problème</Link>
              <Link className="btn btn-ghost" href="/problemes">Parcourir les problèmes résolus</Link>
            </div>
          </div>
          <div className="live" aria-labelledby="live-title">
            <div className="live-head"><span id="live-title"><span className="dot" aria-hidden="true" />Test en direct : la sécurité de votre site</span></div>
            <div className="live-body"><ToolRunner toolKey="headers" /></div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="dom-title">
        <div className="wrap">
          <h2 id="dom-title">Dix domaines où nous intervenons</h2>
          <p className="muted">{problems.length} problèmes décrits, dont {toolCount} avec un outil réel à essayer. Le catalogue s'enrichit à chaque nouveau cas rencontré.</p>
          <div className="domain-list">
            {domains.map((d) => (
              <Link key={d.slug} href={`/problemes?domaine=${d.slug}`} className="domain-row">
                <strong>{d.name}</strong><span>{count(d.slug)} {count(d.slug) > 1 ? "problèmes" : "problème"}</span><p>{d.intro}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {featured.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="feat-title">
          <div className="wrap">
            <h2 id="feat-title">Des cas à explorer en premier</h2>
            <div className="cards">{featured.map((p) => <ProblemCard key={p.id} p={p} />)}</div>
          </div>
        </section>
      ) : null}

      <section className="section" style={{ background: "var(--night)", color: "#e6eef5" }}>
        <div className="wrap">
          <h2 style={{ color: "#fff" }}>Votre situation n'est pas dans la liste ?</h2>
          <p style={{ color: "#bcd0e0" }}>La plupart des projets commencent par un symptôme : « les clients ne trouvent pas le site », « les paiements échouent », « tout prend trop de temps ». Décrivez-le, nous vous répondons personnellement.</p>
          <Link className="btn btn-signal" href="/contact">Écrire à Assavendo</Link>
        </div>
      </section>
    </>
  );
}
