import { ArrowLeft, ArrowRight, Check, Share2, Sparkles } from "lucide-react";
import { Link, useParams } from "wouter";
import { SiteShell } from "@/components/SiteShell";
import { getPortfolioExample, portfolioExamples } from "@/data/portfolio-examples";
import NotFound from "@/pages/NotFound";
import { usePageMeta } from "@/lib/meta";
import { toast } from "sonner";

export default function ExampleDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const item = getPortfolioExample(slug);
  usePageMeta(item ? `${item.title} — Exemple de portfolio Assavendo` : "Exemple introuvable — Assavendo", item?.tagline ?? "Cet exemple de portfolio n’existe pas.");
  if (!item) return <NotFound />;
  const related = portfolioExamples.filter((entry) => entry.category === item.category && entry.slug !== item.slug).slice(0, 2);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: item.title, text: item.tagline, url });
    else { await navigator.clipboard.writeText(url); toast.success("Lien copié"); }
  };
  return <SiteShell>
    <div className="detail-topline"><Link href="/portfolio" className="back-link"><ArrowLeft size={16} /> Retour au portfolio</Link><button className="icon-action" onClick={share} aria-label="Partager cette fiche"><Share2 size={17} /></button></div>
    <section className="example-detail-hero"><div className={`detail-art art-${item.id % 8}`}><span className="detail-art-number">{item.number}</span><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><span className="detail-art-initials">{item.title.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span className="detail-art-label">CONCEPT · {item.category.toUpperCase()}</span></div><div className="detail-heading"><div className="eyebrow-row"><span className="eyebrow">{item.category}</span><span className="status-badge"><i /> Prototype de portfolio</span></div><h1>{item.title}</h1><p className="detail-tagline">{item.tagline}</p><p className="detail-audience"><span>POUR QUI</span>{item.audience}</p><Link href={`/demos/${item.slug}`} className="button button-primary">Tester cette démonstration <ArrowRight size={17} /></Link><small className="demo-note">Aucune transaction réelle · Les données sont fictives.</small></div></section>
    <section className="detail-content-grid"><div><span className="eyebrow">L’INTENTION</span><h2>Une idée rendue concrète.</h2><p>{item.categoryIntro} <strong>{item.title}</strong> met cette intention en pratique avec une expérience pensée pour être claire dès la première visite et utile à chaque étape.</p><p>Ce prototype montre comment une offre spécifique peut être racontée, parcourue et testée dans une interface cohérente. Il s’agit d’une piste de portfolio, pas d’une référence client ou d’un résultat commercial existant.</p></div><aside className="detail-pillars"><span className="eyebrow">LES FONCTIONS CLÉS</span>{item.pillars.map((pillar, index) => <div className="pillar-row" key={pillar}><span>{String(index + 1).padStart(2, "0")}</span><p><Check size={16} />{pillar}</p></div>)}<div className="pillar-audience"><span>PUBLIC VISÉ</span><p>{item.audience}</p></div></aside></section>
    <section className="detail-demo-invite"><div><Sparkles size={18} /><span>ENCORE MIEUX EN ACTION</span></div><p>Manipulez le parcours de cette idée dans son espace de démonstration intégré.</p><Link className="button button-light" href={`/demos/${item.slug}`}>Ouvrir le prototype <ArrowRight size={16} /></Link></section>
    {related.length > 0 && <section className="section related-section"><div className="section-heading"><div><span className="eyebrow">DANS LE MÊME UNIVERS</span><h2>À explorer ensuite.</h2></div><Link className="text-link" href={`/portfolio?categorie=${encodeURIComponent(item.category)}`}>Toute la catégorie <ArrowRight size={15} /></Link></div><div className="example-grid">{related.map((entry) => <div className="related-link-card" key={entry.slug}><span className="eyebrow">{entry.number} · {entry.category}</span><h3>{entry.title}</h3><p>{entry.tagline}</p><Link href={`/exemples/${entry.slug}`} className="text-link">Découvrir <ArrowRight size={15} /></Link></div>)}</div></section>}
  </SiteShell>;
}
