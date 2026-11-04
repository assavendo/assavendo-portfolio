import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { breadcrumb, categoryBySlug, getCatalog } from "@/lib/catalog";
import { parseFilters } from "@/lib/search";
import { CatalogView } from "@/components/CatalogView";
import { siteUrl } from "@/lib/env";

export const revalidate = 60;
type Ctx = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const c = categoryBySlug((await getCatalog()).categories, slug);
  if (!c) return {};
  return { title: c.name, description: c.description || `${c.name} : produits de la boutique Assavendo.`, alternates: { canonical: `/categorie/${c.slug}` } };
}

export default async function Categorie({ params, searchParams }: Ctx) {
  const { slug } = await params; const sp = await searchParams;
  const catalog = await getCatalog();
  const category = categoryBySlug(catalog.categories, slug);
  if (!category) notFound();
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ name: "Boutique", item: `${siteUrl}/boutique` }, ...breadcrumb(catalog.categories, category).map((c) => ({ name: c.name, item: `${siteUrl}/categorie/${c.slug}` }))].map((x, i) => ({ "@type": "ListItem", position: i + 1, ...x })) };
  return (<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    <CatalogView catalog={catalog} filters={parseFilters(sp)} basePath={`/categorie/${category.slug}`} category={category} page={page} title={category.name} intro={category.description} />
  </>);
}
