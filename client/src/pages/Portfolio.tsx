import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, ArrowRight, Sparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { SiteShell } from "@/components/SiteShell";
import { ExampleCard } from "@/components/ExampleCard";
import { portfolioCategories, portfolioExamples, type ProblemKind } from "@/data/portfolio-examples";
import { usePageMeta } from "@/lib/meta";

const PAGE_SIZE = 24;
const kindOptions: Array<{ value: "Toutes" | ProblemKind; label: string }> = [
  { value: "Toutes", label: "Tous les formats" }, { value: "CRÉER", label: "À tester" }, { value: "GÉNÉRER", label: "À générer" }, { value: "EXPLIQUER", label: "À consulter" },
];

export default function Portfolio() {
  usePageMeta("100 problèmes réels du web — Assavendo", "Explorez 100 problèmes web réels, classés par domaine, type de réponse et public visé. Chaque fiche propose un outil, un livrable ou une étude consultable.");
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const [category, setCategory] = useState(params.get("categorie") ?? "Toutes les catégories");
  const [kind, setKind] = useState<"Toutes" | ProblemKind>("Toutes");
  const [audience, setAudience] = useState<"tous" | "entreprise" | "particulier">("tous");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filtered = useMemo(() => portfolioExamples.filter((item) => {
    const haystack = `${item.title} ${item.problem} ${item.cause} ${item.solution} ${item.onSite} ${item.stack} ${item.category}`.toLocaleLowerCase("fr-FR");
    return (category === "Toutes les catégories" || item.category === category) && (kind === "Toutes" || item.kind === kind) && (audience === "tous" || item.audiences.includes(audience)) && (!search || haystack.includes(search.toLocaleLowerCase("fr-FR")));
  }), [category, kind, audience, search]);
  const visible = filtered.slice(0, visibleCount);
  const reset = () => { setCategory("Toutes les catégories"); setKind("Toutes"); setAudience("tous"); setSearch(""); setVisibleCount(PAGE_SIZE); };
  return <SiteShell>
    <section className="page-intro portfolio-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> CAHIER DES CHARGES ASSAVENDO · P01—P100</span><h1>100 problèmes.<br /><em>100 réponses concrètes.</em></h1><p>Ce ne sont plus des idées de business : ce sont 100 situations réelles rencontrées par des particuliers, des indépendants et des entreprises. Chaque fiche explique la cause, la méthode et le livrable construit sur le site.</p></div><div className="portfolio-count-card"><span>FICHES DOCUMENTÉES</span><strong>100</strong><small>10 domaines · 3 formats</small><Sparkles size={20} /></div></section>
    <section className="section catalog-section"><div className="catalog-toolbar"><label className="search-field"><Search size={17} /><input aria-label="Rechercher un problème" placeholder="Rechercher un symptôme, une technologie…" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(PAGE_SIZE); }} /><kbd>⌘ K</kbd></label><label className="category-select"><SlidersHorizontal size={16} /><select aria-label="Filtrer par domaine" value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(PAGE_SIZE); }}><option>Toutes les catégories</option>{portfolioCategories.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label className="category-select"><select aria-label="Filtrer par type" value={kind} onChange={(event) => { setKind(event.target.value as "Toutes" | ProblemKind); setVisibleCount(PAGE_SIZE); }}>{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="category-select"><select aria-label="Filtrer par public visé" value={audience} onChange={(event) => { setAudience(event.target.value as typeof audience); setVisibleCount(PAGE_SIZE); }}><option value="tous">Tous les publics</option><option value="entreprise">Entreprises</option><option value="particulier">Particuliers</option></select></label><span className="catalog-results">{filtered.length} fiche{filtered.length > 1 ? "s" : ""}</span></div>
      <div className="category-pills"><button className={category === "Toutes les catégories" ? "category-pill active" : "category-pill"} onClick={() => { setCategory("Toutes les catégories"); setVisibleCount(PAGE_SIZE); }}>Tout <span>100</span></button>{portfolioCategories.map((item) => <button key={item.name} className={category === item.name ? "category-pill active" : "category-pill"} onClick={() => { setCategory(item.name); setVisibleCount(PAGE_SIZE); }}>{item.name}</button>)}</div>
      {(kind !== "Toutes" || audience !== "tous" || search) && <div className="active-filters"><span>Filtres actifs</span>{kind !== "Toutes" && <button onClick={() => setKind("Toutes")}>{kindOptions.find((option) => option.value === kind)?.label} <X size={12} /></button>}{audience !== "tous" && <button onClick={() => setAudience("tous")}>{audience === "entreprise" ? "Entreprises" : "Particuliers"} <X size={12} /></button>}{search && <button onClick={() => setSearch("")}>« {search} » <X size={12} /></button>}<button className="clear-filters" onClick={reset}>Tout effacer</button></div>}
      {visible.length ? <div className="example-grid catalog-grid">{visible.map((item) => <ExampleCard item={item} key={item.slug} />)}</div> : <div className="empty-state"><Search size={28} /><h2>Aucune fiche trouvée</h2><p>Essayez un autre terme, un autre domaine ou réinitialisez les filtres.</p><button className="button button-outline" onClick={reset}>Réinitialiser les filtres</button></div>}
      {visibleCount < filtered.length && <div className="load-more"><button className="button button-outline" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Charger 24 autres fiches <ArrowRight size={16} /></button><span>{visible.length} sur {filtered.length}</span></div>}
      <p className="catalog-disclaimer"><Sparkles size={14} /> Les données sont issues du cahier des charges fourni. Les exemples affichés sont identifiés comme données d’exemple et aucune saisie n’est conservée.</p>
    </section>
  </SiteShell>;
}
