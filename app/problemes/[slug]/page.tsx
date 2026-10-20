import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblem, getPublishedProblems } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { hasOperationalTool, isToolKey, toolLimits } from "@/lib/tool-keys";
import { ProblemCover } from "@/components/ProblemCover";
import { ProblemCard } from "@/components/ProblemCard";
import { ToolRunner } from "@/components/ToolRunner";

export const revalidate = 120;
export async function generateStaticParams() { return (await getPublishedProblems()).map((p) => ({ slug: p.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProblem((await params).slug); if (!p) return {};
  const title = p.seo_title || p.title; const description = p.seo_description || p.hook || p.symptom.slice(0, 160);
  return { title, description, alternates: { canonical: `/problemes/${p.slug}` }, openGraph: { title, description, type: "article", ...(p.cover_url ? { images: [p.cover_url] } : {}) } };
}

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, all] = await Promise.all([getProblem(slug), getPublishedProblems()]);
  if (!p) notFound();
  const related = all.filter((x) => x.id !== p.id && x.domains?.slug === p.domains?.slug).slice(0, 3);
  const hasTool = hasOperationalTool(p);
  const contact = `/contact?sujet=${encodeURIComponent(p.title)}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.hook, dateModified: p.updated_at, ...(p.published_at ? { datePublished: p.published_at } : {}), author: { "@type": "Organization", name: "Assavendo" }, publisher: { "@type": "Organization", name: "Assavendo" }, mainEntityOfPage: `${siteUrl}/problemes/${p.slug}`, ...(p.cover_url ? { image: p.cover_url } : {}) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Problèmes résolus", item: `${siteUrl}/problemes` }, ...(p.domains ? [{ "@type": "ListItem", position: 2, name: p.domains.name, item: `${siteUrl}/problemes?domaine=${p.domains.slug}` }] : []), { "@type": "ListItem", position: p.domains ? 3 : 2, name: p.title }] },
  ];
  return (
    <article className="section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <div className="wrap">
        <nav className="crumbs" aria-label="Fil d'Ariane"><Link href="/problemes">Problèmes résolus</Link>{p.domains ? <> / <Link href={`/problemes?domaine=${p.domains.slug}`}>{p.domains.name}</Link></> : null}</nav>
        <div className="p-hero">
          <div>
            {hasTool ? <p className="eyebrow">Avec un outil à essayer</p> : <p className="eyebrow">Explication détaillée</p>}
            <h1 style={{ fontSize: "clamp(2rem,4.2vw,3.2rem)" }}>{p.title}</h1>
            <p className="lede">{p.hook}</p>
            <div className="hero-cta">
              {hasTool ? <><a href="#outil" className="btn btn-primary btn-lg">Essayer l'outil</a><Link href={contact} className="btn btn-ghost btn-lg">Demander un diagnostic</Link></>
                : <><Link href={contact} className="btn btn-primary btn-lg">Demander un diagnostic</Link><a href="#solution" className="btn btn-ghost btn-lg">Voir notre méthode</a></>}
            </div>
          </div>
          <div className="p-cover"><ProblemCover p={p} priority sizes="(max-width: 900px) 100vw, 520px" /></div>
        </div>

        {(p.symptom || p.cost || p.cause) ? (
          <div className="triptych">
            {p.symptom ? <section><h2>Ce que vous observez</h2><p>{p.symptom}</p></section> : null}
            {p.cost ? <section><h2>Ce que cela vous coûte</h2><p>{p.cost}</p></section> : null}
            {p.cause ? <section><h2>Pourquoi cela arrive</h2><p>{p.cause}</p></section> : null}
          </div>
        ) : null}

        <div className="p-layout" style={{ marginTop: "2.5rem" }}>
          <div>
            {hasTool && isToolKey(p.tool_key) ? (
              <section id="outil" className="tool-zone" aria-labelledby="outil-titre">
                <header><h2 id="outil-titre">Essayez par vous-même</h2><span className="tag tag-tool">Outil réel, sans inscription</span></header>
                <div className="tool-body">{p.tool_intro ? <p>{p.tool_intro}</p> : null}<ToolRunner toolKey={p.tool_key} /></div>
                <p className="disclaimer"><strong>Limites de cet outil.</strong> {toolLimits[p.tool_key]}</p>
              </section>
            ) : null}
            {p.what_we_do ? (
              <section id="solution" className="block"><h2>Ce que fait Assavendo</h2><p>{p.what_we_do}</p>
                {p.deliverables.length ? <><h3 style={{ marginTop: "1.4rem" }}>Ce que vous recevez</h3><ul className="deliverables">{p.deliverables.map((d) => <li key={d}>{d}</li>)}</ul></> : null}
              </section>
            ) : null}
            {p.outcome ? <section className="block"><h2>Le résultat attendu</h2><p>{p.outcome}</p><p className="muted small">C'est un objectif de travail, vérifié par une mesure avant et après l'intervention : ce n'est pas une garantie de résultat commercial.</p></section> : null}
            <section className="block">
              <div className="cta-band" style={{ padding: "1.6rem" }}><div><h2 style={{ fontSize: "1.4rem" }}>{hasTool ? "Le résultat vous inquiète ?" : "Ce problème vous concerne ?"}</h2><p>Décrivez votre cas : nous revenons vers vous personnellement, avec un premier avis clair.</p></div><Link href={contact} className="btn btn-signal">Demander un échange</Link></div>
            </section>
          </div>
          <aside className="aside" aria-label="Résumé du problème">
            <h2>Parlons de votre cas</h2>
            <p>Un message suffit : nous répondons sous deux jours ouvrés.</p>
            <Link href={contact} className="btn btn-signal">Demander un échange</Link>
            <dl>
              {p.who ? <><dt>Pour qui</dt><dd>{p.who}</dd></> : null}
              {p.stack.length ? <><dt>Technologies habituelles</dt><dd>{p.stack.join(", ")}</dd></> : null}
            </dl>
          </aside>
        </div>

        {related.length ? <section style={{ marginTop: "4rem" }} aria-labelledby="lies"><h2 id="lies">Dans le même domaine</h2><div className="cards">{related.map((r) => <ProblemCard key={r.id} p={r} />)}</div></section> : null}
      </div>
    </article>
  );
}
