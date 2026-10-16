import { ArrowRight, ArrowUpRight, FileText, FlaskConical, WandSparkles } from "lucide-react";
import { Link } from "wouter";
import type { PortfolioExample } from "@/data/portfolio-examples";

const kindLabel: Record<PortfolioExample["kind"], string> = {
  CRÉER: "Outil à tester",
  GÉNÉRER: "Livrable à générer",
  EXPLIQUER: "Étude à consulter",
};
const kindIcon = { CRÉER: FlaskConical, GÉNÉRER: WandSparkles, EXPLIQUER: FileText };

export function ExampleCard({ item }: { item: PortfolioExample }) {
  const Icon = kindIcon[item.kind];
  return (
    <article className="example-card problem-card">
      <div className={`example-art art-${item.id % 8}`} aria-hidden="true">
        <span className="art-number">P{item.number}</span>
        <span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" />
        <span className="art-word">{item.categoryCode}{item.number}</span>
        <span className="art-category">{item.category}</span>
      </div>
      <div className="example-card-body">
        <div className="eyebrow-row"><span className="eyebrow">{item.category}</span><span className="number-chip">P{item.number} / 100</span></div>
        <h3><Link href={`/problemes/${item.slug}`}>{item.title}</Link></h3>
        <p>{item.tagline}</p>
        <div className="problem-card-meta"><span><Icon size={13} />{kindLabel[item.kind]}</span><span>{item.audiences.includes("entreprise") ? "Entreprise" : "Particulier"}</span></div>
        <div className="card-actions">
          <Link className="text-link" href={`/problemes/${item.slug}`}>Lire la fiche <ArrowRight size={15} /></Link>
          <Link className="icon-link" href={`/demos/${item.slug}`} aria-label={`Tester ou consulter P${item.number} — ${item.title}`}><ArrowUpRight size={17} /></Link>
        </div>
      </div>
    </article>
  );
}
