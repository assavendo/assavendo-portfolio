// Accès au catalogue de la boutique. Lecture seule, publique (RLS) ; mis en cache court.
import { unstable_cache } from "next/cache";
import { families } from "@/content/taxonomy";
import { isSupabaseConfigured } from "./env";
import { supabasePublic } from "./supabase/server";
import { DataUnavailable, getPublishedProducts } from "./data";
import type { Brand, Category, Product, Variant } from "./types";

/** Catégories « de secours » issues de la taxonomie versionnée : utilisées tant que la migration catalogue n'est pas appliquée. */
function localCategories(): Category[] {
  const out: Category[] = [];
  families.forEach((f, i) => {
    out.push({ id: f.slug, parent_id: null, slug: f.slug, name: f.name, kind: f.kind, description: f.description, sellable: f.sellable !== false, note: f.note ?? "", attributes: f.attributes ?? [], sort: i * 10 });
    f.children.forEach((c, j) => out.push({ id: c.slug, parent_id: f.slug, slug: c.slug, name: c.name, kind: f.kind, description: "", sellable: f.sellable !== false, note: "", attributes: c.attributes ?? [], sort: j * 10 }));
  });
  return out;
}

export const getCategories = unstable_cache(async (): Promise<Category[]> => {
  if (!isSupabaseConfigured) return localCategories();
  const { data, error } = await supabasePublic().from("categories").select("*").order("sort");
  if (error) {
    // Table absente (migration pas encore appliquée) : on retombe sur la taxonomie versionnée plutôt que de casser la boutique.
    if (error.code === "42P01" || error.code === "PGRST205") return localCategories();
    throw new DataUnavailable("catégories", error);
  }
  return data?.length ? (data as Category[]) : localCategories();
}, ["categories"], { revalidate: 120, tags: ["categories"] });

export const getBrands = unstable_cache(async (): Promise<Brand[]> => {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabasePublic().from("brands").select("*").order("name");
  if (error) return [];
  return (data ?? []) as Brand[];
}, ["brands"], { revalidate: 120, tags: ["brands"] });

export const getVariants = unstable_cache(async (): Promise<Variant[]> => {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabasePublic().from("product_variants").select("*").eq("active", true).order("sort");
  if (error) return [];
  return (data ?? []) as Variant[];
}, ["variants"], { revalidate: 60, tags: ["products"] });

export type Catalog = { products: Product[]; categories: Category[]; brands: Brand[]; variants: Variant[] };
export async function getCatalog(): Promise<Catalog> {
  const [products, categories, brands, variants] = await Promise.all([getPublishedProducts(), getCategories(), getBrands(), getVariants()]);
  return { products, categories, brands, variants };
}

export const families_ = (cats: Category[]) => cats.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort);
export const childrenOf = (cats: Category[], id: string) => cats.filter((c) => c.parent_id === id).sort((a, b) => a.sort - b.sort);
export const categoryBySlug = (cats: Category[], slug: string) => cats.find((c) => c.slug === slug) ?? null;
export function breadcrumb(cats: Category[], c: Category | null | undefined): Category[] {
  const out: Category[] = []; let cur = c ?? null;
  while (cur) { out.unshift(cur); cur = cur.parent_id ? cats.find((x) => x.id === cur!.parent_id) ?? null : null; }
  return out;
}
/** Nombre de produits publiés par catégorie, sous-catégories comprises. */
export function countByCategory(cats: Category[], products: Product[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of products) {
    let c = cats.find((x) => x.id === p.category_id);
    while (c) { m.set(c.slug, (m.get(c.slug) ?? 0) + 1); c = c.parent_id ? cats.find((x) => x.id === c!.parent_id) : undefined; }
  }
  return m;
}

/** Prix « à partir de » d'un produit à variantes ; sinon le prix du produit. */
export function priceFrom(p: Product, variants: Variant[]): { cents: number; from: boolean } {
  const prices = variants.filter((v) => v.product_id === p.id && v.price_cents != null).map((v) => v.price_cents as number);
  if (!prices.length) return { cents: p.price_cents, from: false };
  const min = Math.min(p.price_cents, ...prices);
  return { cents: min, from: prices.some((x) => x !== p.price_cents) };
}
