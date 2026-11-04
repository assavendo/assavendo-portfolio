// Panier : stocké dans un cookie httpOnly (identifiants et quantités SEULEMENT). Les prix, le stock et la livraison sont
// toujours recalculés côté serveur et en base au moment de la commande : le cookie ne peut rien imposer.
import { cookies } from "next/headers";
import { z } from "zod";
import { supabasePublic } from "./supabase/server";
import type { Product, Variant } from "./types";

export type CartLine = { p: string; v?: string; q: number };
const NAME = "av_cart", COUNT = "av_cart_n";
export const MAX_LINES = 20, MAX_QTY = 10;
const lineSchema = z.object({ p: z.string().uuid(), v: z.string().uuid().optional(), q: z.number().int().min(1).max(MAX_QTY) });

export async function readCart(): Promise<CartLine[]> {
  const raw = (await cookies()).get(NAME)?.value; if (!raw) return [];
  try { const parsed = z.array(lineSchema).max(MAX_LINES).safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : []; } catch { return []; }
}
/** À appeler uniquement depuis une action serveur ou un gestionnaire de route. */
export async function writeCart(lines: CartLine[]): Promise<void> {
  const store = await cookies();
  const base = { sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };
  if (!lines.length) { store.delete(NAME); store.set(COUNT, "0", { ...base, maxAge: 0 }); return; }
  store.set(NAME, JSON.stringify(lines), { ...base, httpOnly: true });
  store.set(COUNT, String(lines.reduce((s, l) => s + l.q, 0)), base);   // lisible par le menu : aucune donnée sensible
}

export type CartItem = {
  line: CartLine; product: Product; variant: Variant | null; unit: number; total: number; maxQty: number; issue: string | null;
};
export type CartDetail = { items: CartItem[]; subtotal: number; shipping: number; total: number; hasPhysical: boolean; hasPaidDigital: boolean; blocked: boolean };

/** Affichage du panier (le même calcul est refait par la base à la commande). */
export async function loadCart(lines: CartLine[]): Promise<CartDetail> {
  const empty: CartDetail = { items: [], subtotal: 0, shipping: 0, total: 0, hasPhysical: false, hasPaidDigital: false, blocked: false };
  if (!lines.length) return empty;
  const db = supabasePublic();
  const [{ data: prods }, { data: vars }, { data: cats }] = await Promise.all([
    db.from("products").select("*").in("id", [...new Set(lines.map((l) => l.p))]).eq("status", "published"),
    db.from("product_variants").select("*").in("product_id", [...new Set(lines.map((l) => l.p))]).eq("active", true),
    db.from("categories").select("id, sellable"),
  ]);
  const P = new Map(((prods ?? []) as Product[]).map((p) => [p.id, p]));
  const V = (vars ?? []) as Variant[];
  const nonSellable = new Set((cats ?? []).filter((c) => !c.sellable).map((c) => c.id));
  const items: CartItem[] = []; const shipped = new Set<string>();
  let subtotal = 0, shipping = 0, hasPhysical = false, hasPaidDigital = false, blocked = false;
  for (const line of lines) {
    const product = P.get(line.p); if (!product) { blocked = true; continue; }
    const variants = V.filter((x) => x.product_id === product.id);
    const variant = line.v ? variants.find((x) => x.id === line.v) ?? null : null;
    let issue: string | null = null;
    if (line.v && !variant) issue = "Cette déclinaison n'est plus disponible.";
    else if (!line.v && product.kind === "physical" && variants.length) issue = "Choisissez une déclinaison.";
    else if (product.category_id && nonSellable.has(product.category_id)) issue = "Ce produit n'est pas disponible à la vente.";
    const stock = product.kind !== "physical" || !product.track_stock ? Infinity : variant ? variant.stock_qty : product.stock_qty ?? 0;
    if (!issue && stock < line.q) issue = stock <= 0 ? "Épuisé." : `Il n'en reste que ${stock}.`;
    const unit = variant?.price_cents ?? product.price_cents;
    if (issue) blocked = true;
    items.push({ line, product, variant, unit, total: unit * line.q, maxQty: product.kind === "physical" ? Math.min(MAX_QTY, Number.isFinite(stock) ? Math.max(stock, 1) : MAX_QTY) : 1, issue });
    subtotal += unit * line.q;
    if (product.kind === "physical") { hasPhysical = true; if (!shipped.has(product.id)) { shipped.add(product.id); shipping += product.shipping_cents ?? 0; } }
    else if (product.kind === "digital" && unit > 0) hasPaidDigital = true;
  }
  if (items.length !== lines.length) blocked = true;
  const total = subtotal + shipping;
  if (total > 0 && total < 50) blocked = true;
  return { items, subtotal, shipping, total, hasPhysical, hasPaidDigital, blocked };
}
