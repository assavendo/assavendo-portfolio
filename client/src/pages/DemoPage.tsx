import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { Link, useParams } from "wouter";
import { SiteShell } from "@/components/SiteShell";
import { InteractiveDemo } from "@/components/InteractiveDemo";
import { getPortfolioExample } from "@/data/portfolio-examples";
import NotFound from "@/pages/NotFound";
import { usePageMeta } from "@/lib/meta";

export default function DemoPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const item = getPortfolioExample(slug);
  usePageMeta(item ? `Démo · ${item.title} — Assavendo` : "Démonstration introuvable — Assavendo", item?.tagline ?? "Cette démonstration n’existe pas.");
  if (!item) return <NotFound />;
  return <SiteShell>
    <div className="demo-page-topline"><Link href={`/exemples/${item.slug}`} className="back-link"><ArrowLeft size={16} /> Fiche du concept</Link><span className="prototype-pill"><i /> MODE PROTOTYPE</span></div>
    <section className="demo-page-heading"><span className="eyebrow">{item.number} · {item.category}</span><h1>Explorez <em>{item.title}.</em></h1><p>{item.tagline}</p></section>
    <section className="demo-stage"><InteractiveDemo item={item} /></section>
    <aside className="demo-info"><Info size={17} /><p><strong>À propos de cette démonstration.</strong> L’interface simule les actions principales de ce concept. Les données sont temporaires, aucun compte ni achat réel n’est créé.</p><Link href={`/exemples/${item.slug}`} className="text-link">Lire la fiche complète <ExternalLink size={14} /></Link></aside>
  </SiteShell>;
}
