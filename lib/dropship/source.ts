import { createHash } from "node:crypto";

export type SupplierImage = { url: string; alt: string; kind: "source" };
export type SupplierProduct = {
  page_title: string;
  product_name: string;
  description: string;
  brand: string;
  sku: string;
  gtin: string;
  supplier_price: number | null;
  currency: string;
  availability: string;
  images: SupplierImage[];
  content_sha256: string;
};

const clean = (value: unknown, max: number): string => {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const decoded = String(value).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    if (code[0] !== "#") return named[code.toLowerCase()] ?? " ";
    const n = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  });
  return decoded.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
};

function attr(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return clean(m?.[1] ?? m?.[2] ?? m?.[3] ?? "", 4000);
}

function meta(html: string, keys: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop")).toLowerCase();
    if (keys.includes(key)) {
      const value = attr(tag, "content");
      if (value) return value;
    }
  }
  return "";
}

function productsIn(value: unknown, found: Record<string, unknown>[], depth = 0): void {
  if (depth > 8 || found.length >= 20 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const child of value.slice(0, 100)) productsIn(child, found, depth + 1); return; }
  const obj = value as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((x) => typeof x === "string" && x.toLowerCase().split(/[\/]/).at(-1) === "product")) found.push(obj);
  for (const child of Object.values(obj).slice(0, 100)) productsIn(child, found, depth + 1);
}

function valueText(v: unknown, max: number): string {
  if (typeof v === "string" || typeof v === "number") return clean(v, max);
  if (v && typeof v === "object") {
    const x = v as Record<string, unknown>;
    return clean(x.name ?? x.value ?? x["@value"] ?? "", max);
  }
  return "";
}

function imageUrls(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [v];
  return list.flatMap((x) => {
    if (typeof x === "string") return [x];
    if (x && typeof x === "object") {
      const obj = x as Record<string, unknown>;
      const u = obj.url ?? obj.contentUrl ?? obj.thumbnailUrl;
      return typeof u === "string" ? [u] : [];
    }
    return [];
  }).slice(0, 12);
}

function imageList(candidates: string[], base: URL): SupplierImage[] {
  const seen = new Set<string>(); const out: SupplierImage[] = [];
  for (const raw of candidates) {
    if (out.length >= 6 || typeof raw !== "string") continue;
    if (!raw.trim()) continue;
    try {
      const u = new URL(raw, base);
      if (u.protocol !== "https:" || u.username || u.password) continue;
      if ([...u.searchParams.keys()].some((name) => /(^|[-_])(token|signature|sig|secret|auth|session|password|credential|expires?|access[_-]?key)([-_]|$)|^key$/i.test(name))) continue;
      u.hash = "";
      if (seen.has(u.toString())) continue;
      seen.add(u.toString());
      out.push({ url: u.toString().slice(0, 2000), alt: "", kind: "source" });
    } catch { /* URL fournie par une page non fiable : ignorer. */ }
  }
  return out;
}

/** Extrait seulement des métadonnées et JSON-LD bornés; le HTML et les scripts ne sont jamais exécutés. */
export function extractSupplierProduct(html: string, pageUrl: string, requestedName: string): SupplierProduct {
  const page = new URL(pageUrl);
  const scripts = [...html.matchAll(/<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi)].slice(0, 20);
  const products: Record<string, unknown>[] = [];
  for (const match of scripts) {
    const raw = (match[2] ?? "").trim().slice(0, 40_000);
    try { productsIn(JSON.parse(raw), products); } catch { /* JSON-LD invalide : les métadonnées OpenGraph restent utilisables. */ }
  }
  const product = products[0] ?? {};
  const titleTag = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "", 300);
  const offerValue = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const offer = offerValue && typeof offerValue === "object" ? offerValue as Record<string, unknown> : {};
  const priceValue = offer.price ?? offer.lowPrice;
  const rawPrice = priceValue === undefined || priceValue === null || String(priceValue).trim() === "" ? Number.NaN : Number(priceValue);
  const price = Number.isFinite(rawPrice) && rawPrice >= 0 && rawPrice <= 10_000_000 ? rawPrice : null;
  const brand = valueText(product.brand, 120) || meta(html, ["product:brand"]);
  const rawImages = [
    ...imageUrls(product.image),
    meta(html, ["og:image", "og:image:url", "twitter:image"]),
  ];
  return {
    page_title: meta(html, ["og:title", "twitter:title"]) || titleTag,
    product_name: valueText(product.name, 180) || meta(html, ["og:title", "twitter:title"]) || titleTag || clean(requestedName, 180),
    description: valueText(product.description, 1600) || meta(html, ["og:description", "description", "twitter:description"]),
    brand,
    sku: valueText(product.sku, 100),
    gtin: valueText(product.gtin13 ?? product.gtin12 ?? product.gtin14 ?? product.gtin, 32),
    supplier_price: price,
    currency: valueText(offer.priceCurrency, 3).toUpperCase(),
    availability: valueText(offer.availability, 120),
    images: imageList(rawImages, page),
    content_sha256: createHash("sha256").update(html).digest("hex"),
  };
}

/** Nettoie les chaînes extraites avant de les montrer à un administrateur ou de les transmettre au modèle. */
export function safeSupplierText(value: unknown, max = 500): string {
  return clean(value, max);
}
