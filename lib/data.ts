import { unstable_cache } from "next/cache";
import { domains as seedDomains } from "@/content/domains";
import { problems as seedProblems } from "@/content/problems";
import { isSupabaseConfigured } from "./env";
import { supabaseAdmin, supabasePublic } from "./supabase/server";
import type { Domain, Problem, Product } from "./types";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function fromSeed(): { domains: Domain[]; problems: Problem[] } {
  const domains: Domain[] = seedDomains.map((d) => ({ id: d.slug, slug: d.slug, name: d.name, intro: d.intro, sort: d.sort }));
  const problems: Problem[] = seedProblems.map((p) => ({
    id: p.slug, slug: p.slug, domain_id: p.domain, title: p.title, hook: p.hook, who: p.who, symptom: p.symptom, cost: p.cost, cause: p.cause,
    what_we_do: p.what_we_do, deliverables: p.deliverables, outcome: p.outcome, stack: p.stack, audiences: p.audiences, format: p.format,
    tool_key: p.tool_key ?? null, tool_intro: p.tool_intro ?? "", cover_url: null, cover_alt: "", cover_credit: null, status: "published",
    featured: !!p.featured, sort: p.sort, published_at: null, updated_at: new Date(0).toISOString(),
    domains: (({ name, slug }) => ({ name, slug }))(seedDomains.find((d) => d.slug === p.domain)!),
  }));
  return { domains, problems };
}

export const getDomains = unstable_cache(async (): Promise<Domain[]> => {
  if (!isSupabaseConfigured) return fromSeed().domains;
  const { data, error } = await supabasePublic().from("domains").select("*").order("sort");
  return !error && data?.length ? data as Domain[] : fromSeed().domains;
}, ["domains"], { revalidate: 120, tags: ["domains"] });

export const getPublishedProblems = unstable_cache(async (): Promise<Problem[]> => {
  if (!isSupabaseConfigured) return fromSeed().problems;
  const { data, error } = await supabasePublic().from("problems").select("*, domains(name, slug)").eq("status", "published").order("sort");
  return !error && data?.length ? data as unknown as Problem[] : fromSeed().problems;
}, ["problems"], { revalidate: 120, tags: ["problems"] });

export type Filters = { q?: string; domain?: string; format?: string; audience?: string };
export async function searchProblems(f: Filters): Promise<Problem[]> {
  const all = await getPublishedProblems();
  const q = f.q ? norm(f.q).split(/\s+/).filter(Boolean) : [];
  return all.filter((p) => {
    if (f.domain && p.domains?.slug !== f.domain) return false;
    if (f.format && p.format !== f.format) return false;
    if (f.audience && !p.audiences.includes(f.audience)) return false;
    if (!q.length) return true;
    const hay = norm([p.title, p.hook, p.symptom, p.cause, p.what_we_do, p.stack.join(" "), p.domains?.name ?? ""].join(" "));
    return q.every((t) => hay.includes(t));
  });
}
export async function getProblem(slug: string) { return (await getPublishedProblems()).find((p) => p.slug === slug) ?? null; }

export const getPublishedProducts = unstable_cache(async (): Promise<Product[]> => {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabasePublic().from("products").select("*").eq("status", "published").order("published_at", { ascending: false });
  return (data ?? []) as Product[];
}, ["products"], { revalidate: 60, tags: ["products"] });

export type ProductStats = { likes: number; shares: number; rating: number; reviews: number; comments: { id: string; parent_id: string | null; author_name: string; body: string; is_owner_reply: boolean; created_at: string }[]; reviewList: { id: string; author_name: string; rating: number; body: string; verified_purchase: boolean; created_at: string }[] };
export async function getProductStats(productId: string): Promise<ProductStats> {
  const empty: ProductStats = { likes: 0, shares: 0, rating: 0, reviews: 0, comments: [], reviewList: [] };
  if (!isSupabaseConfigured || !process.env.SUPABASE_SECRET_KEY) return empty;
  const db = supabaseAdmin();
  const [likes, shares, reviews, comments] = await Promise.all([
    db.from("product_likes").select("*", { count: "exact", head: true }).eq("product_id", productId),
    db.from("product_shares").select("*", { count: "exact", head: true }).eq("product_id", productId),
    db.from("product_reviews").select("id, author_name, rating, body, verified_purchase, created_at").eq("product_id", productId).eq("status", "approved").order("created_at", { ascending: false }).limit(50),
    db.from("product_comments").select("id, parent_id, author_name, body, is_owner_reply, created_at").eq("product_id", productId).eq("status", "approved").order("created_at", { ascending: true }).limit(200),
  ]);
  const list = reviews.data ?? [];
  return { likes: likes.count ?? 0, shares: shares.count ?? 0, rating: list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0, reviews: list.length, comments: comments.data ?? [], reviewList: list };
}
