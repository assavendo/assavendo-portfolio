import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblem, getPublishedProblems } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { ProblemCover } from "@/components/ProblemCover";
import { ProblemCard } from "@/components/ProblemCard";
import { ToolRunner } from "@/components/ToolRunner";
import { toolKeys } from "@/lib/tool-keys";

export const revalidate = 120;
export async function generateStaticParams() { return (await getPublishedProblems()).map((p) => ({ slug: p.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProblem((await params).slug); if (!p) return {};
  return { title: p.title, description: p.hook || p.symptom.slice(0, 160), alternates: { canonical: `/problemes/${p.slug}` }, openGraph: { title: p.title, description: p.hook, images: p.cover_url ? [p.cover_url] : undefined } };
}

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, all] = await Promise.all([getProblem(slug), getPublishedProblems()]);
  if (!p) notFound();
  const related = all.filter((x) => x.id !== p.id && x.domains?.slug === p.domains?.slug).slice(0, 3);
  const hasTool = p.format === "tool" && p.tool_key && (toolKeys as readonly string[]).includes(p.tool_key);
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.hook, dateModified: p.updated_at, author: { "@type": "Organization", name: "Assavendo" }, publisher: { "@type": "Organization", name: "Assavendo" }, mainEntityOfPage: `${siteUrl}/problemes/${p.slug}`, ...(p.cover_url ? { image: p.cover_url } : {}) };
  return (
    <article className="section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <div className="wrap">
        <nav className="crumbs" aria-label="Fil d'Ariane"><Link href="/problemes">Problèmes résolus</Link>{p.domains ? <> / <Link href={`/problemes?domaine=${p.domains.slug}`}>{p.domains.name}</Link></> : null}</nav>
        <div className="p-hero">
          <div>
            <h1 style={{ fontSize: "clamp(2rem,4.2vw,3.2rem)" }}>{p.title}</h1>
            <p className="lede" style={{ fontSize: "1.2rem", color: "var(--ink-2)" }}>{p.hook}</p>
            <div className="hero-cta">
              <Link href={`/contact?sujet=${encodeURIComponent(p.title)}`} className="btn btn-primary">Régler ce problème avec Assavendo</Link>
              {hasTool ? <a href="#outil" className="btn btn-ghost">Essayer l'outil</a> : null}
            </div>
          </div>
          <div className="p-cover"><ProblemCover p={p} priority sizes="(max-width: 900px) 100vw, 520px" /></div>
        </div>

        <div className="p-layout" style={{ marginTop: "3rem" }}>
          <div>
            {p.symptom ? <section className="block"><h2>Ce que vous observez</h2><p>{p.symptom}</p></section> : null}
            {p.cost ? <section className="block"><h2>Ce que cela vous coûte</h2><p>{p.cost}</p></section> : null}
            {p.cause ? <section className="block"><h2>Pourquoi cela arrive</h2><p>{p.cause}</p></section> : null}
            {hasTool ? (
              <section id="outil" className="tool-zone" aria-labelledby="outil-titre">
                <header><h2 id="outil-titre">Essayez par vous-même</h2><span className="tag tag-tool">Outil réel, sans inscription</span></header>
                <div className="tool-body">{p.tool_intro ? <p>{p.tool_intro}</p> : null}<ToolRunner toolKey={p.tool_key!} /></div>
                <p className="disclaimer">Résultats calculés à partir des données que vous saisissez ou de ce que votre site expose publiquement. Aucune donnée n'est conservée.</p>
              </section>
            ) : null}
            {p.what_we_do ? <section className="block"><h2>Ce que fait Assavendo</h2><p>{p.what_we_do}</p>{p.deliverables.length ? <><h3 style={{ marginTop: "1.2rem" }}>Ce que vous recevez</h3><ul>{p.deliverables.map((d) => <li key={d}>{d}</li>)}</ul></> : null}</section> : null}
            {p.outcome ? <section className="block"><h2>Le résultat attendu</h2><p>{p.outcome}</p></section> : null}
          </div>
          <aside className="aside" aria-label="Résumé du problème">
            <h2>Parlons de votre cas</h2>
            <p>Décrivez votre situation : nous revenons vers vous personnellement, avec un premier avis clair.</p>
            <Link href={`/contact?sujet=${encodeURIComponent(p.title)}`} className="btn btn-signal">Demander un échange</Link>
            <dl>
              {p.who ? <><dt>Pour qui</dt><dd>{p.who}</dd></> : null}
              {p.stack.length ? <><dt>Technologies habituelles</dt><dd>{p.stack.join(", ")}</dd></> : null}
            </dl>
          </aside>
        </div>

        {related.length ? <section style={{ marginTop: "4rem" }}><h2>Dans le même domaine</h2><div className="cards">{related.map((r) => <ProblemCard key={r.id} p={r} />)}</div></section> : null}
      </div>
    </article>
  );
}
