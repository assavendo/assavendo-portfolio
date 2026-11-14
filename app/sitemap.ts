import type { MetadataRoute } from "next";
import { getPublishedProblems, getPublishedProducts } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { getCategories } from "@/lib/catalog";
import { getPublishedCollections } from "@/lib/collections";
import { getPublishedHelpArticles } from "@/lib/help";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [problems, products, categories, collections, helpArticles] = await Promise.all([
    getPublishedProblems(),
    getPublishedProducts(),
    getCategories(),
    getPublishedCollections(),
    getPublishedHelpArticles(),
  ]);
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/boutique`, changeFrequency: "weekly", priority: .9 },
    { url: `${siteUrl}/numerique`, changeFrequency: "weekly", priority: .7 },
    { url: `${siteUrl}/promotions`, changeFrequency: "daily", priority: .5 },
    { url: `${siteUrl}/collections`, changeFrequency: "weekly", priority: .6 },
    { url: `${siteUrl}/aide`, changeFrequency: "weekly", priority: .5 },
    { url: `${siteUrl}/services`, priority: .8 },
    { url: `${siteUrl}/problemes`, changeFrequency: "weekly", priority: .8 },
    { url: `${siteUrl}/offres`, priority: .7 },
    { url: `${siteUrl}/methode`, priority: .6 },
    { url: `${siteUrl}/contact`, priority: .6 },
    ...categories.filter((c) => !c.parent_id).map((c) => ({ url: `${siteUrl}/categorie/${c.slug}`, priority: .6 })),
    ...problems.map((p) => ({ url: `${siteUrl}/problemes/${p.slug}`, lastModified: p.updated_at === new Date(0).toISOString() ? undefined : p.updated_at, priority: .8 })),
    ...products.map((p) => ({ url: `${siteUrl}/boutique/${p.slug}`, priority: .6 })),
    ...collections.map((c) => ({ url: `${siteUrl}/collections/${c.slug}`, priority: .6 })),
    ...helpArticles.map((a) => ({ url: `${siteUrl}/aide/${a.slug}`, lastModified: a.updated_at, priority: .5 })),
  ];
}
