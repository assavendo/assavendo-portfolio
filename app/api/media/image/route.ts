import { isAllowedImageUrl } from "@/lib/images";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw || !isAllowedImageUrl(raw)) return NextResponse.json({ error: "Image non autorisée." }, { status: 400 });

  let current = raw;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    if (!isAllowedImageUrl(current)) return NextResponse.json({ error: "Redirection d'image non autorisée." }, { status: 400 });
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*;q=0.8,*/*;q=0.5" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || attempt === MAX_REDIRECTS) return NextResponse.json({ error: "Trop de redirections." }, { status: 502 });
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok) return NextResponse.json({ error: "Image distante indisponible." }, { status: 502 });
    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) return NextResponse.json({ error: "La ressource distante n'est pas une image." }, { status: 415 });
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return NextResponse.json({ error: "Image trop volumineuse." }, { status: 413 });

    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return NextResponse.json({ error: "Image trop volumineuse." }, { status: 413 });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return NextResponse.json({ error: "Image non disponible." }, { status: 502 });
}
