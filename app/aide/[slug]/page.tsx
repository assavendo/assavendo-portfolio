import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedHelpArticle } from "@/lib/help";
import { siteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedHelpArticle(slug);
  if (!article) return { title: "Aide" };
  return { title: article.title, description: article.summary, alternates: { canonical: `/aide/${article.slug}` } };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getPublishedHelpArticle(slug);
  if (!article) notFound();
  const paragraphs = article.content.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="section"><article className="wrap" style={{ maxWidth: 800 }}>
      <p><Link href="/aide">← Centre d'aide</Link></p>
      <span className="eyebrow">{article.category}</span>
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>{article.title}</h1>
      <p className="lead">{article.summary}</p>
      <div className="panel" style={{ marginTop: "1.5rem" }}>
        {paragraphs.map((p, index) => <p key={index} style={{ whiteSpace: "pre-wrap" }}>{p}</p>)}
      </div>
      <div className="cta-band" style={{ marginTop: "2rem" }}>
        <div><h2>Vous avez encore besoin d'aide ?</h2><p>Créez un ticket sécurisé et gardez le lien de suivi.</p></div>
        <Link className="btn btn-signal btn-lg" href="/aide#ticket">Créer un ticket</Link>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context":"https://schema.org","@type":"Article","headline":article.title,"description":article.summary,
        "mainEntityOfPage":`${siteUrl}/aide/${article.slug}`,
        "dateModified":article.updated_at
      }) }} />
    </article></div>
  );
}
