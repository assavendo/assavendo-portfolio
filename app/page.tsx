import type { Metadata } from "next";
import Link from "next/link";
import { getDomains, getPublishedProblems } from "@/lib/data";
import { hasOperationalTool } from "@/lib/tool-keys";
import { offers, steps } from "@/lib/site-content";
import { siteUrl } from "@/lib/env";
import { ProblemCard } from "@/components/ProblemCard";
import { ToolRunner } from "@/components/ToolRunner";
import { DomainArt } from "@/components/DomainArt";
import { Faq } from "@/components/Faq";

export const revalidate = 120;
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const [domains, problems] = await Promise.all([getDomains(), getPublishedProblems()]);
  const featured = problems.filter((p) => p.featured).slice(0, 6);
  const count = (slug: string) => problems.filter((p) => p.domains?.slug === slug).length;
  const toolCount = problems.filter(hasOperationalTool).length;   // outils réellement opérationnels, jamais le simple format « tool »
  const ld = { "@context": "https://schema.org", "@type": "Organization", name: "Assavendo", url: siteUrl, logo: `${siteUrl}/icon.svg` };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Sites, boutiques, sécurité, automatisation</p>
            <h1>Les problèmes web qui coûtent des clients, <em>résolus pour de bon.</em></h1>
            <p className="lede">Assavendo conçoit, répare et sécurise les sites, boutiques et outils de gestion des entreprises. Chaque problème décrit ici s'accompagne, quand c'est pertinent, d'un outil que vous pouvez essayer vous-même, sur vos propres données.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href="/contact?sujet=Demande%20de%20diagnostic">Demander un diagnostic <span className="arrow" aria-hidden="true">→</span></Link>
              <Link className="btn btn-ghost btn-lg" href="/problemes">Découvrir les solutions</Link>
            </div>
          </div>
          <div className="live" aria-labelledby="live-title">
            <div className="live-head"><span id="live-title"><span className="dot" aria-hidden="true" />Test en direct : la sécurité de votre site</span></div>
            <div className="live-body"><ToolRunner toolKey="headers" /></div>
          </div>
        </div>
      </section>

      <section className="trust" aria-label="Ce que vous pouvez vérifier">
        <div className="wrap"><ul>
          <li><b>{toolCount} outil{toolCount > 1 ? "s" : ""} gratuit{toolCount > 1 ? "s" : ""}</b><span>Sans inscription, utilisables dès maintenant.</span></li>
          <li><b>Rien n'est conservé</b><span>Ce que vous saisissez dans un outil n'est pas enregistré.</span></li>
          <li><b>Réponse sous deux jours ouvrés</b><span>Un message personnel, pas un envoi automatique.</span></li>
        </ul></div>
      </section>

      <section className="section" aria-labelledby="offres-titre">
        <div className="wrap">
          <div className="section-head"><p className="eyebrow">Ce que nous faisons</p><h2 id="offres-titre">Quatre façons de nous confier un problème</h2><p className="muted">Chaque mission part d'un symptôme que vous observez et se termine par une vérification mesurée.</p></div>
          <div className="offers">
            {offers.map((o) => (
              <Link key={o.domain} href={`/problemes?domaine=${o.domain}`} className="offer">
                <div className="offer-icon" style={{ overflow: "hidden", padding: 0 }}><DomainArt slug={o.domain} /></div>
                <h3>{o.title}</h3><p>{o.text}</p>
                <ul>{o.points.map((x) => <li key={x}>{x}</li>)}</ul>
                <span className="more">Voir les problèmes liés ({count(o.domain)}) →</span>
              </Link>
            ))}
          </div>
          <p style={{ marginTop: "1.5rem" }}><Link href="/offres">Comment nous établissons une proposition →</Link></p>
        </div>
      </section>

      {featured.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="feat-title">
          <div className="wrap">
            <div className="section-head"><p className="eyebrow">À explorer en premier</p><h2 id="feat-title">Des problèmes courants, expliqués simplement</h2></div>
            <div className="cards">{featured.map((p) => <ProblemCard key={p.id} p={p} />)}</div>
            <p style={{ marginTop: "1.5rem" }}><Link href="/problemes">Parcourir les {problems.length} problèmes →</Link></p>
          </div>
        </section>
      ) : null}

      <section className="section" style={{ background: "var(--surface-2)" }} aria-labelledby="methode-titre">
        <div className="wrap">
          <div className="section-head"><p className="eyebrow">Notre méthode</p><h2 id="methode-titre">Du symptôme à la preuve, en quatre étapes</h2></div>
          <ol className="steps">{steps.map((s) => <li key={s.title}><h3>{s.title}</h3><p>{s.text}</p></li>)}</ol>
        </div>
      </section>

      <section className="section" aria-labelledby="dom-title">
        <div className="wrap">
          <div className="section-head"><h2 id="dom-title">Dix domaines d'intervention</h2><p className="muted">{problems.length} problème{problems.length > 1 ? "s" : ""} décrit{problems.length > 1 ? "s" : ""} aujourd'hui, dont {toolCount} avec un outil réel. Le catalogue grandit à mesure que de nouveaux cas sont rédigés et vérifiés : les domaines sans fiche publiée sont indiqués comme à venir.</p></div>
          <div className="domain-list">
            {domains.map((d) => {
              const n = count(d.slug);
              const inner = <><div className="d-art"><DomainArt slug={d.slug} /></div><strong>{d.name}</strong><span>{n ? `${n} problème${n > 1 ? "s" : ""}` : "À venir"}</span><p>{d.intro}</p></>;
              return n ? <Link key={d.slug} href={`/problemes?domaine=${d.slug}`} className="domain-row">{inner}</Link> : <div key={d.slug} className="domain-row soon">{inner}</div>;
            })}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="faq-titre">
        <div className="wrap">
          <div className="section-head"><p className="eyebrow">Questions fréquentes</p><h2 id="faq-titre">Avant de nous écrire</h2></div>
          <Faq limit={4} />
          <p style={{ marginTop: "1.2rem" }}><Link href="/methode#questions">Toutes les questions →</Link></p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta-band">
            <div><h2>Votre situation n'est pas dans la liste ?</h2><p>La plupart des projets commencent par un symptôme : « les clients ne trouvent pas le site », « les paiements échouent », « tout prend trop de temps ». Décrivez-le, nous vous répondons personnellement.</p></div>
            <Link className="btn btn-signal btn-lg" href="/contact">Écrire à Assavendo</Link>
          </div>
        </div>
      </section>
    </>
  );
}
