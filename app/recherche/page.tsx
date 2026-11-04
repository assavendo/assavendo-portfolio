import { redirect } from "next/navigation";
export default async function Recherche({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { q } = await searchParams;
  redirect(q ? `/boutique?q=${encodeURIComponent(q.slice(0, 120))}` : "/boutique");
}
