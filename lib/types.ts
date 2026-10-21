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
};
export const eur = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
