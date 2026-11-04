import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { parseFilters } from "@/lib/search";
import { CatalogView } from "@/components/CatalogView";

export const metadata: Metadata = { title: "Tous les produits", description: "Le catalogue complet de la boutique Assavendo : filtres, tri et recherche.", alternates: { canonical: "/boutique" } };
export const revalidate = 60;

export default async function Boutique({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const catalog = await getCatalog();
  const filters = parseFilters(sp);
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  // Une catégorie passée en paramètre (?cat=) est redirigée vers sa page dédiée pour garder des adresses propres
  return <CatalogView catalog={catalog} filters={filters} basePath="/boutique" page={page} title={filters.q ? "Résultats de recherche" : "Tous les produits"} intro={filters.q ? undefined : "Parcourez le catalogue, filtrez par catégorie, type, prix et disponibilité."} />;
}
