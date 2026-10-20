import type { MetadataRoute } from "next";
import { getPublishedProblems, getPublishedProducts } from "@/lib/data";
import { siteUrl } from "@/lib/env";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [problems, products] = await Promise.all([getPublishedProblems(), getPublishedProducts()]);
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 }, { url: `${siteUrl}/problemes`, changeFrequency: "weekly", priority: .9 }, { url: `${siteUrl}/boutique`, changeFrequency: "weekly", priority: .7 }, { url: `${siteUrl}/offres`, priority: .7 }, { url: `${siteUrl}/methode`, priority: .6 }, { url: `${siteUrl}/contact`, priority: .6 },
    ...problems.map((p) => ({ url: `${siteUrl}/problemes/${p.slug}`, lastModified: p.updated_at === new Date(0).toISOString() ? undefined : p.updated_at, priority: .8 })),
    ...products.map((p) => ({ url: `${siteUrl}/boutique/${p.slug}`, priority: .6 })),
  ];
}
