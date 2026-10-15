import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import type { PortfolioExample } from "@/data/portfolio-examples";

export function ExampleCard({ item }: { item: PortfolioExample }) {
  return (
    <article className="example-card">
      <div className={`example-art art-${item.id % 8}`} aria-hidden="true">
        <span className="art-number">{item.number}</span>
        <span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" />
        <span className="art-word">{item.title.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
        <span className="art-category">{item.category}</span>
      </div>
      <div className="example-card-body">
        <div className="eyebrow-row"><span className="eyebrow">{item.category}</span><span className="number-chip">{item.number} / 100</span></div>
        <h3><Link href={`/exemples/${item.slug}`}>{item.title}</Link></h3>
        <p>{item.tagline}</p>
        <div className="card-actions">
          <Link className="text-link" href={`/exemples/${item.slug}`}>Découvrir <ArrowRight size={15} /></Link>
          <Link className="icon-link" href={`/demos/${item.slug}`} aria-label={`Tester ${item.title}`}><ArrowUpRight size={17} /></Link>
        </div>
      </div>
    </article>
  );
}
