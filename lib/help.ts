import { supabasePublic } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type HelpArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  status: "draft" | "published" | "archived";
  sort: number;
  created_at: string;
  updated_at: string;
};

export async function getPublishedHelpArticles(): Promise<HelpArticle[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabasePublic()
    .from("help_articles")
    .select("id,slug,title,summary,content,category,status,sort,created_at,updated_at")
    .eq("status", "published")
    .order("sort")
    .order("title");
  return error ? [] : (data ?? []) as HelpArticle[];
}

export async function getPublishedHelpArticle(slug: string): Promise<HelpArticle | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabasePublic()
    .from("help_articles")
    .select("id,slug,title,summary,content,category,status,sort,created_at,updated_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return error ? null : (data as HelpArticle | null);
}
