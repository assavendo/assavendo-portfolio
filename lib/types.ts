export type Domain = { id: string; slug: string; name: string; intro: string; sort: number };
export type Problem = {
  id: string; slug: string; domain_id: string | null; title: string; hook: string; who: string; symptom: string; cost: string;
  cause: string; what_we_do: string; deliverables: string[]; outcome: string; stack: string[]; audiences: string[];
  format: "tool" | "study"; tool_key: string | null; tool_intro: string; cover_url: string | null; cover_alt: string; cover_credit: string | null;
  status: "draft" | "published" | "archived"; featured: boolean; sort: number; published_at: string | null; seo_title: string | null; seo_description: string | null; publish_at?: string | null; updated_at: string;
  domains?: Pick<Domain, "name" | "slug"> | null;
};
export type ProductImage = { url: string; alt: string; credit?: string };
export type Product = {
  id: string; slug: string; title: string; summary: string; description: string; kind: "digital" | "service" | "physical";
  price_cents: number; currency: string; features: string[]; images: ProductImage[]; demo_url: string | null;
  status: "draft" | "published" | "archived"; allow_comments: boolean; allow_reviews: boolean; published_at: string | null; created_at: string;
  // catalogue (migration 20261104) : optionnels pour rester compatibles avec les lignes plus anciennes
  category_id?: string | null; brand_id?: string | null; compare_at_cents?: number | null; attributes?: Record<string, string | number | boolean>;
  tags?: string[]; sku?: string | null; gtin?: string | null; weight_g?: number | null; origin_country?: string | null;
  delivery_min_days?: number | null; delivery_max_days?: number | null; warranty_months?: number | null; return_days?: number; shipping_cents?: number;
  track_stock?: boolean; stock_qty?: number; low_stock_threshold?: number; seller_type?: "first_party" | "supplier" | "marketplace";
};
export type AttrDef = { key: string; label: string; type: "enum" | "number" | "boolean" | "text"; unit?: string; values?: string[]; filterable?: boolean };
export type Category = {
  id: string; parent_id: string | null; slug: string; name: string; kind: "digital" | "service" | "physical"; description: string;
  sellable: boolean; note: string; attributes: AttrDef[]; sort: number;
};
export type Brand = { id: string; slug: string; name: string };
export type Variant = { id: string; product_id: string; sku: string | null; label: string; options: Record<string, string>; price_cents: number | null; stock_qty: number; active: boolean; sort: number };
export const eur = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
