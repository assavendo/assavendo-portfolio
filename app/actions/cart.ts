"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_LINES, MAX_QTY, readCart, writeCart, type CartLine } from "@/lib/cart";
import { supabasePublic } from "@/lib/supabase/server";

const ids = z.object({ p: z.string().uuid(), v: z.string().uuid().optional().or(z.literal("")), q: z.coerce.number().int().min(1).max(MAX_QTY).default(1) });
const same = (a: CartLine, b: CartLine) => a.p === b.p && (a.v ?? "") === (b.v ?? "");

export async function addToCart(form: FormData) {
  const back = String(form.get("back") ?? "/panier");
  const safeBack = back.startsWith("/boutique/") && !back.includes("//") ? back : "/panier";
  const parsed = ids.safeParse({ p: form.get("p"), v: form.get("v") ?? "", q: form.get("q") ?? 1 });
  if (!parsed.success) redirect(`${safeBack}?panier=invalide`);
  const { p, v, q } = parsed.data;
  const db = supabasePublic();
  const { data: prod } = await db.from("products").select("id, kind, price_cents, status").eq("id", p).eq("status", "published").maybeSingle();
  if (!prod || (prod.price_cents > 0 && prod.price_cents < 50 && !v)) redirect(`${safeBack}?panier=indisponible`);
  const { data: vars } = await db.from("product_variants").select("id, price_cents").eq("product_id", p).eq("active", true);
  if (prod.kind === "physical" && vars?.length && !v) redirect(`${safeBack}?panier=declinaison`);
  if (v && !vars?.some((x) => x.id === v)) redirect(`${safeBack}?panier=indisponible`);
  const cart = await readCart();
  const line: CartLine = { p, ...(v ? { v } : {}), q: prod.kind === "physical" ? q : 1 };
  const i = cart.findIndex((l) => same(l, line));
  if (i >= 0) cart[i] = { ...cart[i], q: prod.kind === "physical" ? Math.min(MAX_QTY, cart[i].q + line.q) : 1 };
  else if (cart.length >= MAX_LINES) redirect(`${safeBack}?panier=plein`);
  else cart.push(line);
  await writeCart(cart);
  redirect(form.get("now") === "1" ? "/commande" : "/panier?ajoute=1");
}

export async function setCartQty(form: FormData) {
  const parsed = ids.safeParse({ p: form.get("p"), v: form.get("v") ?? "", q: form.get("q") ?? 1 });
  if (!parsed.success) return;
  const cart = await readCart(); const target: CartLine = { p: parsed.data.p, ...(parsed.data.v ? { v: parsed.data.v } : {}), q: parsed.data.q };
  await writeCart(cart.map((l) => (same(l, target) ? { ...l, q: target.q } : l)));
  revalidatePath("/panier");
}

export async function removeFromCart(form: FormData) {
  const parsed = ids.pick({ p: true, v: true }).safeParse({ p: form.get("p"), v: form.get("v") ?? "" });
  if (!parsed.success) return;
  const target: CartLine = { p: parsed.data.p, ...(parsed.data.v ? { v: parsed.data.v } : {}), q: 1 };
  await writeCart((await readCart()).filter((l) => !same(l, target)));
  revalidatePath("/panier");
}

export async function clearCart() { await writeCart([]); }
