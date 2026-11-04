import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { parseFilters } from "@/lib/search";
import { CatalogView } from "@/components/CatalogView";

export const metadata: Metadata = { title: "Promotions", description: "Les produits dont le prix a réellement baissé.", alternates: { canonical: "/promotions" } };
export const revalidate = 60;

export default async function Promotions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  return <CatalogView catalog={await getCatalog()} filters={parseFilters(sp)} basePath="/promotions" page={page} promoOnly title="Promotions" intro="Un prix barré n'apparaît que s'il correspond à un ancien prix réel du produit." />;
}
