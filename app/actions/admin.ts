"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import { toolKeys } from "@/lib/tool-keys";

export async function signIn(_: unknown, form: FormData) {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Identifiants invalides." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword(parsed.data);
  if (error) return { error: "E-mail ou mot de passe incorrect." };
  redirect("/admin");
}
export async function signOut() { const sb = await supabaseServer(); await sb.auth.signOut(); redirect("/admin/login"); }

const lines = (s: FormDataEntryValue | null) => String(s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const csv = (s: FormDataEntryValue | null) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const text = (max: number) => z.string().trim().max(max);

const problemSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(4, "Le titre est trop court.").max(160),
  slug: text(80).optional(), domain_id: z.string().uuid().optional().or(z.literal("")),
  hook: text(300), who: text(300), symptom: text(2000), cost: text(2000), cause: text(2000), what_we_do: text(4000), outcome: text(2000), tool_intro: text(600),
  format: z.enum(["tool", "study"]), tool_key: text(40).optional(), status: z.enum(["draft", "published", "archived"]),
  cover_url: z.string().url().max(600).optional().or(z.literal("")), cover_alt: text(300), cover_credit: text(300).optional(), sort: z.coerce.number().int().min(0).max(100000), featured: z.string().optional(),
});

export async function saveProblem(_: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const { sb } = await requireAdmin();
  const parsed = problemSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const d = parsed.data;
  if (d.format === "tool" && !(toolKeys as readonly string[]).includes(d.tool_key ?? "")) return { error: "Choisissez un outil existant, ou passez le contenu en « Explication »." };
  if (d.status === "published" && (!d.hook || !d.what_we_do)) return { error: "Pour publier, renseignez au moins l'accroche et « Ce que fait Assavendo »." };
  const row = {
    title: d.title, slug: slugify(d.slug || d.title), domain_id: d.domain_id || null, hook: d.hook, who: d.who, symptom: d.symptom, cost: d.cost, cause: d.cause, what_we_do: d.what_we_do, outcome: d.outcome,
    deliverables: lines(form.get("deliverables")), stack: csv(form.get("stack")), audiences: form.getAll("audiences").map(String).filter((a) => ["entreprise", "particulier"].includes(a)),
    format: d.format, tool_key: d.format === "tool" ? d.tool_key : null, tool_intro: d.tool_intro, status: d.status, featured: d.featured === "on", sort: d.sort,
    cover_url: d.cover_url || null, cover_alt: d.cover_alt, cover_credit: d.cover_credit || null,
  };
  const published_at = d.status === "published" ? new Date().toISOString() : null;
  const q = d.id ? sb.from("problems").update({ ...row, ...(d.status === "published" ? {} : { published_at }) }).eq("id", d.id) : sb.from("problems").insert({ ...row, published_at });
  const { error } = await q;
  if (error) return { error: error.code === "23505" ? "Cette adresse (slug) existe déjà." : "Enregistrement impossible : " + error.message };
  revalidateTag("problems"); revalidatePath("/problemes"); revalidatePath("/");
  return { ok: d.status === "published" ? "Enregistré et publié." : "Enregistré." };
}

export async function deleteProblem(form: FormData) {
  const { sb } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  await sb.from("problems").delete().eq("id", id);
  revalidateTag("problems"); revalidatePath("/problemes"); redirect("/admin/problemes");
}

const productSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")), title: z.string().trim().min(2).max(180), slug: text(80).optional(),
  summary: z.string().trim().min(12, "Le résumé doit faire au moins 12 caractères.").max(500), description: text(8000),
  kind: z.enum(["digital", "service", "physical"]), price: z.coerce.number().min(0).max(100000), status: z.enum(["draft", "published", "archived"]),
  demo_url: z.string().url().optional().or(z.literal("")), deliverable_path: text(300).optional(), deliverable_name: text(200).optional(),
});
export async function saveProduct(_: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const { sb } = await requireAdmin();
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const d = parsed.data; const cents = Math.round(d.price * 100);
  if (cents > 0 && cents < 50) return { error: "Stripe exige un montant d'au moins 0,50 €." };
  const images = [...form.getAll("img_url")].map((u, i) => ({ url: String(u), alt: String(form.getAll("img_alt")[i] ?? ""), credit: String(form.getAll("img_credit")[i] ?? "") || undefined })).filter((i) => /^https:\/\//.test(i.url));
  if (d.status === "published" && images.length === 0) return { error: "Ajoutez au moins une image avant de publier." };
  if (d.status === "published" && images.some((i) => !i.alt)) return { error: "Chaque image publiée doit avoir un texte alternatif." };
  const row = { title: d.title, slug: slugify(d.slug || d.title), summary: d.summary, description: d.description, kind: d.kind, price_cents: cents, features: lines(form.get("features")), images, demo_url: d.demo_url || null, status: d.status, allow_comments: form.get("allow_comments") === "on", allow_reviews: form.get("allow_reviews") === "on" };
  const published_at = d.status === "published" ? new Date().toISOString() : null;
  let id = d.id || undefined;
  if (id) { const { error } = await sb.from("products").update(row).eq("id", id); if (error) return { error: error.message }; }
  else { const { data, error } = await sb.from("products").insert({ ...row, published_at }).select("id").single(); if (error) return { error: error.code === "23505" ? "Cette adresse (slug) existe déjà." : error.message }; id = data.id; }
  if (d.deliverable_path) await sb.from("product_deliverables").upsert({ product_id: id!, storage_path: d.deliverable_path, file_name: d.deliverable_name || "fichier" });
  revalidateTag("products"); revalidatePath("/boutique");
  return { ok: "Produit enregistré." };
}
export async function deleteProduct(form: FormData) {
  const { sb } = await requireAdmin(); await sb.from("products").delete().eq("id", z.string().uuid().parse(form.get("id")));
  revalidateTag("products"); revalidatePath("/boutique"); redirect("/admin/produits");
}

export async function moderate(form: FormData) {
  const { sb } = await requireAdmin();
  const kind = z.enum(["comment", "review"]).parse(form.get("kind")); const id = z.string().uuid().parse(form.get("id"));
  const decision = z.enum(["approved", "rejected"]).parse(form.get("decision"));
  await sb.from(kind === "comment" ? "product_comments" : "product_reviews").update({ status: decision }).eq("id", id);
  revalidatePath("/admin/moderation");
}
export async function replyAsOwner(form: FormData) {
  const { sb } = await requireAdmin();
  const p = z.object({ parent: z.string().uuid(), product: z.string().uuid(), body: z.string().trim().min(2).max(1500) }).parse({ parent: form.get("parent"), product: form.get("product"), body: form.get("body") });
  await sb.from("product_comments").insert({ product_id: p.product, parent_id: p.parent, author_name: "Assavendo", body: p.body, is_owner_reply: true, status: "approved" });
  revalidatePath("/admin/moderation");
}
export async function setMessageStatus(form: FormData) {
  const { sb } = await requireAdmin();
  await sb.from("contact_messages").update({ status: z.enum(["new", "read", "archived"]).parse(form.get("status")) }).eq("id", z.string().uuid().parse(form.get("id")));
  revalidatePath("/admin/messages");
}
