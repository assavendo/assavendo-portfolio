import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, ArrowRight, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { SiteShell } from "@/components/SiteShell";
import { ExampleCard } from "@/components/ExampleCard";
import { portfolioCategories, portfolioExamples } from "@/data/portfolio-examples";
import { usePageMeta } from "@/lib/meta";

const PAGE_SIZE = 24;
export default function Portfolio() {
  usePageMeta("Portfolio de 100 concepts — Assavendo", "Cent concepts de business en ligne répartis en dix catégories. Consultez les fiches et testez leurs démonstrations interactives.");
  const [location] = useLocation();
  const initial = new URLSearchParams(location.split("?")[1] ?? "").get("categorie") ?? "Toutes les catégories";
  const [category, setCategory] = useState(initial);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filtered = useMemo(() => portfolioExamples.filter((item) => (category === "Toutes les catégories" || item.category === category) && (!search || `${item.title} ${item.tagline} ${item.category}`.toLocaleLowerCase("fr-FR").includes(search.toLocaleLowerCase("fr-FR")))), [category, search]);
  const visible = filtered.slice(0, visibleCount);
  return <SiteShell>
    <section className="page-intro portfolio-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> COLLECTION ASSAVENDO · 01—100</span><h1>Cent idées.<br /><em>Cent façons de commencer.</em></h1><p>Des concepts de business en ligne, classés par univers. Chaque fiche présente une cible, une promesse et un parcours à tester — sans les confondre avec des produits ou clients réels.</p></div><div className="portfolio-count-card"><span>LA COLLECTION COMPLÈTE</span><strong>100</strong><small>concepts en 10 catégories</small><Sparkles size={20} /></div></section>
    <section className="section catalog-section"><div className="catalog-toolbar"><label className="search-field"><Search size={17} /><input aria-label="Rechercher un exemple" placeholder="Rechercher une idée, un secteur…" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(PAGE_SIZE); }} /><kbd>⌘ K</kbd></label><label className="category-select"><SlidersHorizontal size={16} /><select aria-label="Filtrer par catégorie" value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(PAGE_SIZE); }}><option>Toutes les catégories</option>{portfolioCategories.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><span className="catalog-results">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span></div>
      <div className="category-pills"><button className={category === "Toutes les catégories" ? "category-pill active" : "category-pill"} onClick={() => { setCategory("Toutes les catégories"); setVisibleCount(PAGE_SIZE); }}>Tout <span>100</span></button>{portfolioCategories.map((item) => <button key={item.name} className={category === item.name ? "category-pill active" : "category-pill"} onClick={() => { setCategory(item.name); setVisibleCount(PAGE_SIZE); }}>{item.name}</button>)}</div>
      {visible.length ? <div className="example-grid catalog-grid">{visible.map((item) => <ExampleCard item={item} key={item.slug} />)}</div> : <div className="empty-state"><Search size={28} /><h2>Aucune idée trouvée</h2><p>Essayez un autre terme ou une autre catégorie.</p><button className="button button-outline" onClick={() => { setSearch(""); setCategory("Toutes les catégories"); }}>Réinitialiser les filtres</button></div>}
      {visibleCount < filtered.length && <div className="load-more"><button className="button button-outline" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Charger 24 autres exemples <ArrowRight size={16} /></button><span>{visible.length} sur {filtered.length}</span></div>}
      <p className="catalog-disclaimer"><Sparkles size={14} /> Les fiches présentées sont des concepts de démonstration réalisés pour le portfolio Assavendo, pas des entreprises déjà exploitées.</p>
    </section>
  </SiteShell>;
}
