import { supabaseAdmin } from "@/lib/supabase/server";
import { isAllowedImageUrl } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response("Not found", { status: 404 });
  const imageIndex = Number(index);
  if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex > 7) return new Response("Not found", { status: 404 });

  const { data: product, error } = await supabaseAdmin().from("products").select("images").eq("id", id).eq("status", "published").maybeSingle();
  if (error || !product) return new Response("Not found", { status: 404 });
  const images = Array.isArray(product.images) ? product.images as Array<{ url?: string }> : [];
  const sourceUrl = images[imageIndex]?.url;
  if (!sourceUrl || !isAllowedImageUrl(sourceUrl)) return new Response("Not found", { status: 404 });

  try {
    const upstream = await fetch(sourceUrl, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
    });
    if (!upstream.ok) return new Response("Image unavailable", { status: 404 });
    const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) return new Response("Unsupported image", { status: 415 });
    const contentLength = Number(upstream.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) return new Response("Image too large", { status: 413 });
    const bytes = await upstream.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return new Response("Image too large", { status: 413 });
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 404 });
  }
}
