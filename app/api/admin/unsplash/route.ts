import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
/** Recherche de photos sous licence Unsplash (administrateur uniquement). Les photographes sont crédités et le téléchargement est déclaré comme l'exige l'API. */
export async function GET(req: Request) {
  await requireAdmin();
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return NextResponse.json({ error: "UNSPLASH_ACCESS_KEY n'est pas configurée." }, { status: 503 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80);
  if (!q) return NextResponse.json({ results: [] });
  const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape&content_filter=high`, { headers: { authorization: `Client-ID ${key}`, "accept-version": "v1" } });
  if (!r.ok) return NextResponse.json({ error: "Recherche Unsplash indisponible." }, { status: 502 });
  const json = (await r.json()) as { results: { id: string; alt_description: string | null; urls: { raw: string; small: string }; links: { html: string; download_location: string }; user: { name: string; links: { html: string } } }[] };
  return NextResponse.json({ results: json.results.map((p) => ({ id: p.id, alt: p.alt_description ?? "", thumb: p.urls.small, url: `${p.urls.raw}&w=1600&q=80&fit=max&auto=format`, credit: `Photo : ${p.user.name} / Unsplash`, page: p.links.html, download: p.links.download_location })) });
}
export async function POST(req: Request) {
  await requireAdmin();
  const key = process.env.UNSPLASH_ACCESS_KEY; const { download } = (await req.json().catch(() => ({}))) as { download?: string };
  if (!key || !download?.startsWith("https://api.unsplash.com/photos/")) return NextResponse.json({ ok: false }, { status: 400 });
  await fetch(download, { headers: { authorization: `Client-ID ${key}` } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
