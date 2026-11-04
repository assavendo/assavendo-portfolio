import Link from "next/link";
import { ProductCard } from "./ProductCard";
import { applyFilters, buildDocs, facet, filtersToParams, type Filters, type SortKey } from "@/lib/search";
import { breadcrumb, childrenOf, countByCategory, families_, type Catalog } from "@/lib/catalog";
import type { AttrDef, Category } from "@/lib/types";

const PAGE = 24;
const SORTS: [SortKey, string][] = [["pertinence", "Pertinence"], ["nouveautes", "Nouveautés"], ["prix-asc", "Prix croissant"], ["prix-desc", "Prix décroissant"]];
const KINDS = [["", "Tous"], ["physical", "Produits physiques"], ["digital", "Téléchargements"], ["service", "Services"]] as const;

type Props = { catalog: Catalog; filters: Filters; basePath: string; category?: Category | null; page?: number; promoOnly?: boolean; title: string; intro?: string };

export function CatalogView({ catalog, filters, basePath, category, page = 1, promoOnly, title, intro }: Props) {
  const { categories, brands, variants } = catalog;
  const pool = promoOnly ? catalog.products.filter((p) => p.compare_at_cents && p.compare_at_cents > p.price_cents) : catalog.products;
  const effective: Filters = category ? { ...filters, categories: [category.slug] } : filters;
  const docs = buildDocs(pool, categories, brands);
  const vmap = new Map<string, { stock_qty: number; active: boolean }[]>();
  for (const v of variants) vmap.set(v.product_id, [...(vmap.get(v.product_id) ?? []), v]);
  const { items, total } = applyFilters(docs, effective, categories, brands, vmap);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cur = Math.min(Math.max(1, page), pages);
  const shown = items.slice((cur - 1) * PAGE, cur * PAGE);
  const counts = countByCategory(categories, pool);
  const crumbs = breadcrumb(categories, category);
  const attrDefs: AttrDef[] = category ? category.attributes.filter((a) => a.filterable) : [];
  // facettes calculées sur les produits de la catégorie courante (avant filtres d'attributs) : valeurs réelles uniquement
  const facetPool = category ? applyFilters(docs, { ...effective, attrs: {} }, categories, brands, vmap).items : [];
  const url = (f: Filters, p = 1) => { const u = filtersToParams(f); if (category) u.delete("cat"); if (p > 1) u.set("page", String(p)); const s = u.toString(); return s ? `${basePath}?${s}` : basePath; };
  const chips: { label: string; href: string }[] = [];
  if (filters.q) chips.push({ label: `« ${filters.q} »`, href: url({ ...filters, q: "" }) });
  if (filters.kind) chips.push({ label: KINDS.find((k) => k[0] === filters.kind)?.[1] ?? "", href: url({ ...filters, kind: "" }) });
  if (filters.min != null) chips.push({ label: `Dès ${filters.min} €`, href: url({ ...filters, min: null }) });
  if (filters.max != null) chips.push({ label: `Jusqu'à ${filters.max} €`, href: url({ ...filters, max: null }) });
  if (filters.inStock) chips.push({ label: "En stock", href: url({ ...filters, inStock: false }) });
  for (const b of filters.brands) chips.push({ label: brands.find((x) => x.slug === b)?.name ?? b, href: url({ ...filters, brands: filters.brands.filter((x) => x !== b) }) });
  for (const [k, vals] of Object.entries(filters.attrs)) for (const v of vals) chips.push({ label: `${attrDefs.find((a) => a.key === k)?.label ?? k} : ${v}`, href: url({ ...filters, attrs: { ...filters.attrs, [k]: vals.filter((x) => x !== v) } }) });
  const usedBrands = brands.filter((b) => pool.some((p) => p.brand_id === b.id));
  const subs = category ? childrenOf(categories, category.parent_id ? category.parent_id : category.id) : families_(categories);
  const hasFilters = chips.length > 0;

  return (
    <div className="section"><div className="wrap">
      {crumbs.length ? <nav aria-label="Fil d'Ariane" className="crumbs"><ol><li><Link href="/">Accueil</Link></li><li><Link href="/boutique">Boutique</Link></li>{crumbs.map((c, i) => <li key={c.id}>{i === crumbs.length - 1 ? <span aria-current="page">{c.name}</span> : <Link href={`/categorie/${c.slug}`}>{c.name}</Link>}</li>)}</ol></nav> : null}
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>{title}</h1>
      {intro ? <p className="muted" style={{ maxWidth: "70ch" }}>{intro}</p> : null}
      {category && !category.sellable ? <p className="notice" role="note"><b>Catégorie en préparation.</b> Cette famille de produits est soumise à des règles particulières ; nous ne la mettons en vente qu&apos;une fois ces règles vérifiées.</p> : null}

      <div className="shop-layout">
        <aside className="filters" aria-label="Filtres">
          <details open={hasFilters || undefined} className="filters-box">
            <summary>Filtrer et trier{hasFilters ? ` (${chips.length})` : ""}</summary>
            <form method="get" action={basePath}>
              <label className="f-label" htmlFor="f-q">Rechercher</label>
              <input id="f-q" name="q" type="search" defaultValue={filters.q} placeholder="Nom, marque, mot-clé" maxLength={120} />
              <label className="f-label" htmlFor="f-tri">Trier par</label>
              <select id="f-tri" name="tri" defaultValue={filters.sort}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <fieldset><legend className="f-label">Type</legend>
                {KINDS.map(([v, l]) => <label key={v} className="f-check"><input type="radio" name="type" value={v} defaultChecked={filters.kind === v} /> {l}</label>)}
              </fieldset>
              <fieldset><legend className="f-label">Prix (€)</legend>
                <div className="f-row"><label className="sr-only" htmlFor="f-min">Prix minimum</label><input id="f-min" name="min" inputMode="decimal" placeholder="Min" defaultValue={filters.min ?? ""} /><label className="sr-only" htmlFor="f-max">Prix maximum</label><input id="f-max" name="max" inputMode="decimal" placeholder="Max" defaultValue={filters.max ?? ""} /></div>
              </fieldset>
              <label className="f-check"><input type="checkbox" name="stock" value="1" defaultChecked={filters.inStock} /> Uniquement en stock</label>
              {usedBrands.length ? <fieldset><legend className="f-label">Marque</legend>{usedBrands.map((b) => <label key={b.id} className="f-check"><input type="checkbox" name="marque" value={b.slug} defaultChecked={filters.brands.includes(b.slug)} /> {b.name}</label>)}</fieldset> : null}
              {attrDefs.map((a) => {
                const opts = facet(facetPool, a.key);
                if (!opts.length) return null;
                return <fieldset key={a.key}><legend className="f-label">{a.label}{a.unit ? ` (${a.unit})` : ""}</legend>{opts.map((o) => <label key={o.value} className="f-check"><input type="checkbox" name={`a_${a.key}`} value={o.value} defaultChecked={filters.attrs[a.key]?.includes(o.value)} /> {o.label} <span className="muted">({o.count})</span></label>)}</fieldset>;
              })}
              <div className="f-actions"><button className="btn btn-primary btn-sm" type="submit">Appliquer</button>{hasFilters ? <Link className="btn btn-ghost btn-sm" href={basePath}>Réinitialiser</Link> : null}</div>
            </form>
          </details>
          <nav aria-label="Catégories" className="cat-nav">
            <h2 className="f-label">Catégories</h2>
            <ul>
              {category && category.parent_id ? <li><Link href={`/categorie/${breadcrumb(categories, category)[0].slug}`}>← {breadcrumb(categories, category)[0].name}</Link></li> : null}
              {subs.map((c) => <li key={c.id}><Link href={`/categorie/${c.slug}`} aria-current={category?.slug === c.slug ? "page" : undefined}>{c.name}{counts.get(c.slug) ? <span className="muted"> ({counts.get(c.slug)})</span> : null}</Link></li>)}
            </ul>
          </nav>
        </aside>

        <section aria-label="Résultats" aria-live="polite">
          <p className="result-count"><b>{total}</b> produit{total > 1 ? "s" : ""}{filters.q ? <> pour « {filters.q} »</> : null}</p>
          {chips.length ? <ul className="chips" aria-label="Filtres actifs">{chips.map((c) => <li key={c.label + c.href}><Link href={c.href} className="chip">{c.label} <span aria-hidden="true">×</span><span className="sr-only"> : retirer ce filtre</span></Link></li>)}</ul> : null}
          {shown.length ? (
            <div className="cards pgrid">{shown.map((p) => <ProductCard key={p.id} p={p} variants={variants} />)}</div>
          ) : (
            <div className="empty">
              {pool.length === 0 ? <><h2 style={{ fontSize: "1.4rem" }}>{promoOnly ? "Aucune promotion en ce moment" : "Le catalogue se remplit"}</h2><p>{promoOnly ? "Nous n'affichons une réduction que lorsqu'elle est réelle et vérifiable." : "Nous ne mettons en vente que des produits vérifiés, avec une fiche complète. Les premiers arrivent bientôt."}</p><Link className="btn btn-primary" href="/contact?sujet=Id%C3%A9e%20de%20produit">Proposer un produit ou un besoin</Link></>
                : <><h2 style={{ fontSize: "1.4rem" }}>Aucun résultat</h2><p>Aucun produit ne correspond à ces critères. Retirez un filtre ou vérifiez l&apos;orthographe.</p>{hasFilters ? <Link className="btn btn-primary" href={basePath}>Réinitialiser les filtres</Link> : null}</>}
            </div>
          )}
          {pages > 1 ? <nav className="pager" aria-label="Pagination"><ul>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => <li key={n}>{n === cur ? <span aria-current="page">{n}</span> : <Link href={url(effective, n)}>{n}<span className="sr-only"> : page {n}</span></Link>}</li>)}
          </ul></nav> : null}
        </section>
      </div>
    </div></div>
  );
}
