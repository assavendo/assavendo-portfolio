// Recherche et filtres de la boutique : fonctions PURES (aucun accès réseau), testées dans tests/search.test.ts.
// Insensible aux accents et à la casse, synonymes, tolérance aux fautes de frappe simples, facettes, tri, URL partageable.
import type { Brand, Category, Product } from "./types.ts";

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Synonymes courants (clé normalisée → termes équivalents). Volontairement court et vérifiable. */
export const SYNONYMS: Record<string, string[]> = {
  telephone: ["smartphone", "mobile", "portable"], smartphone: ["telephone", "mobile"], mobile: ["smartphone", "telephone"],
  ordinateur: ["pc", "laptop", "portable"], laptop: ["ordinateur", "portable"], pc: ["ordinateur"],
  casque: ["ecouteurs", "audio"], ecouteurs: ["casque", "audio"], tv: ["television", "ecran"], television: ["tv"],
  ebook: ["livre", "epub", "pdf"], livre: ["ebook"], logiciel: ["application", "licence"], appli: ["application"],
  chaussure: ["chaussures", "basket", "baskets"], baskets: ["chaussures"], formation: ["cours", "tutoriel"], cours: ["formation"],
};

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Un mot de la requête correspond-il à un mot du texte ? 0 = non, 3 = exact, 2 = préfixe, 1 = faute de frappe / synonyme. */
function wordScore(q: string, w: string): number {
  if (q === w) return 3;
  if (q.length >= 2 && w.startsWith(q)) return 2;
  if (q.length >= 4 && w.length >= 4 && lev(q, w, q.length >= 8 ? 2 : 1) <= (q.length >= 8 ? 2 : 1)) return 1;
  return 0;
}

export type SearchDoc = { product: Product; fields: { weight: number; words: string[] }[] };

export function buildDocs(products: Product[], categories: Category[], brands: Brand[]): SearchDoc[] {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const br = new Map(brands.map((b) => [b.id, b]));
  return products.map((p) => {
    const c = p.category_id ? cat.get(p.category_id) : undefined;
    const parent = c?.parent_id ? cat.get(c.parent_id) : undefined;
    return {
      product: p,
      fields: [
        { weight: 6, words: norm(p.title).split(" ") },
        { weight: 4, words: norm([br.get(p.brand_id ?? "")?.name ?? "", ...(p.tags ?? [])].join(" ")).split(" ").filter(Boolean) },
        { weight: 3, words: norm([c?.name ?? "", parent?.name ?? ""].join(" ")).split(" ").filter(Boolean) },
        { weight: 1, words: norm(`${p.summary} ${p.sku ?? ""}`).split(" ").filter(Boolean) },
      ],
    };
  });
}

/** Score d'un document pour une requête : tous les mots doivent correspondre (ET), directement ou par synonyme. 0 = exclu. */
export function scoreDoc(doc: SearchDoc, query: string): number {
  const terms = norm(query).split(" ").filter(Boolean);
  if (!terms.length) return 1;
  let total = 0;
  for (const t of terms) {
    let best = 0;
    for (const alt of [t, ...(SYNONYMS[t] ?? []).map((s) => ({ s, k: 0.6 })).map((x) => x.s)]) {
      const isSyn = alt !== t;
      for (const f of doc.fields) for (const w of f.words) {
        const s = wordScore(alt, w);
        if (s) best = Math.max(best, s * f.weight * (isSyn ? 0.6 : 1));
      }
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}

export type SortKey = "pertinence" | "nouveautes" | "prix-asc" | "prix-desc";
export type Filters = {
  q: string; categories: string[]; kind: "" | "physical" | "digital" | "service"; min: number | null; max: number | null;
  inStock: boolean; brands: string[]; attrs: Record<string, string[]>; sort: SortKey;
};
export const emptyFilters = (): Filters => ({ q: "", categories: [], kind: "", min: null, max: null, inStock: false, brands: [], attrs: {}, sort: "pertinence" });

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const many = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean); };
  const num = (k: string) => { const n = Number(one(k).replace(",", ".")); return one(k) !== "" && Number.isFinite(n) && n >= 0 ? n : null; };
  const attrs: Record<string, string[]> = {};
  for (const k of Object.keys(sp)) if (k.startsWith("a_")) { const v = many(k); if (v.length) attrs[k.slice(2)] = v; }
  const kind = one("type");
  const sort = one("tri");
  return {
    q: one("q").slice(0, 120), categories: many("cat"), kind: (["physical", "digital", "service"] as const).find((k) => k === kind) ?? "",
    min: num("min"), max: num("max"), inStock: one("stock") === "1", brands: many("marque"), attrs,
    sort: (["pertinence", "nouveautes", "prix-asc", "prix-desc"] as const).find((s) => s === sort) ?? "pertinence",
  };
}

export function filtersToParams(f: Filters): URLSearchParams {
  const u = new URLSearchParams();
  if (f.q) u.set("q", f.q);
  if (f.categories.length) u.set("cat", f.categories.join(","));
  if (f.kind) u.set("type", f.kind);
  if (f.min != null) u.set("min", String(f.min));
  if (f.max != null) u.set("max", String(f.max));
  if (f.inStock) u.set("stock", "1");
  if (f.brands.length) u.set("marque", f.brands.join(","));
  for (const [k, v] of Object.entries(f.attrs)) if (v.length) u.set(`a_${k}`, v.join(","));
  if (f.sort !== "pertinence") u.set("tri", f.sort);
  return u;
}

/** Un produit est disponible s'il ne suit pas de stock, ou s'il en reste (variantes comprises). Jamais de stock inventé. */
export function isAvailable(p: Product, variants: { stock_qty: number; active: boolean }[] = []): boolean {
  if (p.kind !== "physical" || !p.track_stock) return true;
  const v = variants.filter((x) => x.active);
  return v.length ? v.some((x) => x.stock_qty > 0) : (p.stock_qty ?? 0) > 0;
}

export function descendantSlugs(categories: Category[], slugs: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of slugs) {
    const c = categories.find((x) => x.slug === s); if (!c) continue;
    out.add(c.slug); for (const k of categories) if (k.parent_id === c.id) out.add(k.slug);
  }
  return out;
}

export type Result = { items: Product[]; total: number };

export function applyFilters(docs: SearchDoc[], f: Filters, categories: Category[], brands: Brand[], variantsByProduct: Map<string, { stock_qty: number; active: boolean }[]> = new Map()): Result {
  const catIds = f.categories.length ? new Set(categories.filter((c) => descendantSlugs(categories, f.categories).has(c.slug)).map((c) => c.id)) : null;
  const brandIds = f.brands.length ? new Set(brands.filter((b) => f.brands.includes(b.slug)).map((b) => b.id)) : null;
  const scored: { p: Product; s: number }[] = [];
  for (const d of docs) {
    const p = d.product;
    if (catIds && !(p.category_id && catIds.has(p.category_id))) continue;
    if (brandIds && !(p.brand_id && brandIds.has(p.brand_id))) continue;
    if (f.kind && p.kind !== f.kind) continue;
    if (f.min != null && p.price_cents < Math.round(f.min * 100)) continue;
    if (f.max != null && p.price_cents > Math.round(f.max * 100)) continue;
    if (f.inStock && !isAvailable(p, variantsByProduct.get(p.id))) continue;
    let ok = true;
    for (const [k, vals] of Object.entries(f.attrs)) { const v = p.attributes?.[k]; if (v === undefined || !vals.includes(String(v))) { ok = false; break; } }
    if (!ok) continue;
    const s = scoreDoc(d, f.q); if (!s) continue;
    scored.push({ p, s });
  }
  const t = (p: Product) => new Date(p.published_at ?? p.created_at).getTime();
  scored.sort((a, b) =>
    f.sort === "prix-asc" ? a.p.price_cents - b.p.price_cents
    : f.sort === "prix-desc" ? b.p.price_cents - a.p.price_cents
    : f.sort === "nouveautes" || !f.q ? t(b.p) - t(a.p)
    : b.s - a.s || t(b.p) - t(a.p));
  return { items: scored.map((x) => x.p), total: scored.length };
}

export type Facet = { value: string; label: string; count: number };
/** Facettes dynamiques d'un attribut sur un ensemble de produits (déjà filtrés par catégorie/requête). */
export function facet(products: Product[], key: string, label?: (v: string) => string): Facet[] {
  const m = new Map<string, number>();
  for (const p of products) { const v = p.attributes?.[key]; if (v !== undefined && v !== "") m.set(String(v), (m.get(String(v)) ?? 0) + 1); }
  return [...m.entries()].map(([value, count]) => ({ value, label: label ? label(value) : value, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr", { numeric: true }));
}
