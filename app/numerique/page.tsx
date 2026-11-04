import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { parseFilters } from "@/lib/search";
import { CatalogView } from "@/components/CatalogView";

export const metadata: Metadata = { title: "Numérique", description: "Téléchargements : livres numériques, modèles, logiciels, formations. Livraison par lien sécurisé.", alternates: { canonical: "/numerique" } };
export const revalidate = 60;

export default async function Numerique({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const catalog = await getCatalog();
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  return <CatalogView catalog={{ ...catalog, products: catalog.products.filter((p) => p.kind === "digital") }} filters={{ ...parseFilters(sp), kind: "" }} basePath="/numerique" page={page} title="Numérique" intro="Livres numériques, modèles, logiciels, formations : disponibles dès la confirmation du paiement, par lien de téléchargement sécurisé à durée limitée." />;
}
