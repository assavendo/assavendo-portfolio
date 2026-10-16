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
  usePageMeta(item ? `Test P${item.number} · ${item.title} — Assavendo` : "Démonstration introuvable — Assavendo", item?.onSite ?? "Cette démonstration n’existe pas.");
  if (!item) return <NotFound />;
  return <SiteShell>
    <div className="demo-page-topline"><Link href={`/problemes/${item.slug}`} className="back-link"><ArrowLeft size={16} /> Fiche P{item.number}</Link><span className="prototype-pill"><i /> {item.kind === "EXPLIQUER" ? "ÉTUDE CONSULTABLE" : "MODE DÉMONSTRATION"}</span></div>
    <section className="demo-page-heading"><span className="eyebrow">P{item.number} · {item.category} · {item.kind}</span><h1>{item.kind === "EXPLIQUER" ? <>Comprendre <em>{item.title}.</em></> : <>Traiter <em>{item.title}.</em></>}</h1><p>{item.onSite}</p></section>
    <section className="demo-stage"><InteractiveDemo item={item} /></section>
    <aside className="demo-info"><Info size={17} /><p><strong>{item.kind === "EXPLIQUER" ? "Étude consultable." : "Démonstration testable."}</strong> Les données préchargées sont explicitement fictives. Le traitement reste dans le navigateur lorsque cela est possible et aucune saisie n’est conservée.</p><Link href={`/problemes/${item.slug}`} className="text-link">Lire la fiche complète <ExternalLink size={14} /></Link></aside>
  </SiteShell>;
}
