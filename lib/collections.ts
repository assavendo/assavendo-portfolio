import { getPublishedProducts } from "@/lib/data";
import { supabasePublic } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Product } from "@/lib/types";

export type EditorialCollection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  sort: number;
};

export type EditorialCollectionWithProducts = EditorialCollection & {
  products: Product[];
};

export async function getPublishedCollections(): Promise<EditorialCollection[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabasePublic()
    .from("collections")
    .select("id,slug,title,description,status,sort")
    .eq("status", "published")
    .order("sort", { ascending: true })
    .order("title", { ascending: true });
  if (error) return [];
  return (data ?? []) as EditorialCollection[];
}

export async function getPublishedCollectionBySlug(slug: string): Promise<EditorialCollectionWithProducts | null> {
  if (!isSupabaseConfigured) return null;
  const { data: collection, error } = await supabasePublic()
    .from("collections")
    .select("id,slug,title,description,status,sort")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !collection) return null;

  const { data: items, error: itemsError } = await supabasePublic()
    .from("collection_items")
    .select("product_id,sort")
    .eq("collection_id", collection.id)
    .order("sort", { ascending: true });
  if (itemsError) return null;

  const products = await getPublishedProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  const ordered = (items ?? [])
    .map((item) => byId.get(item.product_id))
    .filter((p): p is Product => Boolean(p));

  return { ...(collection as EditorialCollection), products: ordered };
}
