"use server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import { toolKeys } from "@/lib/tool-keys";
import { slugProblem, validatePublishable } from "@/lib/content-rules";
import { isAllowedImageUrl } from "@/lib/images";
import { allow } from "@/lib/rate-limit";
import { formValues } from "@/lib/form";

export type AdminState = { error?: string; ok?: string; values?: Record<string, string> };

export async function signIn(_: unknown, form: FormData) {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Identifiants invalides." };
  if (!(await allow("admin-login", 8, 900))) return { error: "Trop de tentatives de connexion. Réessayez dans quelques minutes." };
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
  seo_title: text(70).optional(), seo_description: text(170).optional(), publish_at: z.string().optional(),
});

export async function saveProblem(_: unknown, form: FormData): Promise<AdminState> {
  const { sb } = await requireAdmin();
  const values = { ...formValues(form), audiences: form.getAll("audiences").map(String).join(",") };
  const fail = (error: string): AdminState => ({ error, values });
  const parsed = problemSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
  const d = parsed.data;
  if (d.format === "tool" && !(toolKeys as readonly string[]).includes(d.tool_key ?? "")) return fail("Choisissez un outil existant, ou passez le contenu en « Explication ».");
  if (d.cover_url && !isAllowedImageUrl(d.cover_url)) return fail("Cette image ne provient pas d'une source autorisée (Unsplash ou vos envois).");
  if (d.cover_url && !d.cover_alt) return fail("Ajoutez le texte alternatif de l'image de couverture.");
  const slug = slugify(d.slug || d.title);
  const slugErr = slugProblem(slug); if (slugErr) return fail(slugErr);
  const row = {
    title: d.title, slug, domain_id: d.domain_id || null, hook: d.hook, who: d.who, symptom: d.symptom, cost: d.cost, cause: d.cause, what_we_do: d.what_we_do, outcome: d.outcome,
    deliverables: lines(form.get("deliverables")), stack: csv(form.get("stack")), audiences: form.getAll("audiences").map(String).filter((a) => ["entreprise", "particulier"].includes(a)),
    format: d.format, tool_key: d.format === "tool" ? d.tool_key! : null, tool_intro: d.tool_intro, status: d.status, featured: d.featured === "on", sort: d.sort,
    cover_url: d.cover_url || null, cover_alt: d.cover_alt, cover_credit: d.cover_credit || null,
    seo_title: d.seo_title || null, seo_description: d.seo_description || null, publish_at: d.publish_at ? new Date(d.publish_at).toISOString() : null,
  };
  if (d.status === "published") {
    const errors = validatePublishable(row);
    if (errors.length) return fail("Publication impossible : " + errors.join(" "));
  }
  if (d.id) {
    // La date de première publication est conservée ; elle n'est posée que lors du premier passage en « Publié ».
    const { data: cur, error: curErr } = await sb.from("problems").select("published_at").eq("id", d.id).maybeSingle();
    if (curErr) return fail("Lecture impossible : " + curErr.message);
    const published_at = d.status === "published" ? cur?.published_at ?? new Date().toISOString() : cur?.published_at ?? null;
    const { error } = await sb.from("problems").update({ ...row, published_at }).eq("id", d.id);
    if (error) return fail(error.code === "23505" ? "Cette adresse (slug) existe déjà." : "Enregistrement impossible : " + error.message);
  } else {
    const { data, error } = await sb.from("problems").insert({ ...row, published_at: d.status === "published" ? new Date().toISOString() : null }).select("id").single();
    if (error || !data) return fail(error?.code === "23505" ? "Cette adresse (slug) existe déjà." : "Enregistrement impossible : " + (error?.message ?? "inconnu"));
    revalidateTag("problems"); revalidatePath("/problemes"); revalidatePath("/"); revalidatePath("/admin/problemes");
    redirect(`/admin/problemes?id=${data.id}&cree=1`);   // le formulaire repart de l'enregistrement créé : un second clic ne crée pas de doublon
  }
  revalidateTag("problems"); revalidatePath("/problemes"); revalidatePath("/"); revalidatePath("/admin/problemes");
  return { ok: d.status === "published" ? "Enregistré et publié." : "Enregistré." };
}

export async function deleteProblem(form: FormData) {
  const { sb } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const { error } = await sb.from("problems").delete().eq("id", id);
  if (error) throw new Error("Suppression impossible : " + error.message);
  revalidateTag("problems"); revalidatePath("/problemes"); revalidatePath("/admin/problemes"); redirect("/admin/problemes");
}

const productSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")), title: z.string().trim().min(2).max(180), slug: text(80).optional(),
  summary: z.string().trim().min(12, "Le résumé doit faire au moins 12 caractères.").max(500), description: text(8000),
  kind: z.enum(["digital", "service", "physical"]), price: z.coerce.number().min(0).max(100000), status: z.enum(["draft", "published", "archived"]),
  demo_url: z.string().url().optional().or(z.literal("")), deliverable_path: text(300).optional(), deliverable_name: text(200).optional(),
});
export async function saveProduct(_: unknown, form: FormData): Promise<AdminState> {
  const { sb } = await requireAdmin();
  const values = formValues(form);
  const fail = (error: string): AdminState => ({ error, values });
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
  const d = parsed.data; const cents = Math.round(d.price * 100);
  if (cents > 0 && cents < 50) return fail("Stripe exige un montant d'au moins 0,50 €.");
  const images = [...form.getAll("img_url")].map((u, i) => ({ url: String(u), alt: String(form.getAll("img_alt")[i] ?? ""), credit: String(form.getAll("img_credit")[i] ?? "") || undefined })).filter((i) => i.url);
  if (images.some((i) => !isAllowedImageUrl(i.url))) return fail("Une image ne provient pas d'une source autorisée (Unsplash ou vos envois) : elle ne s'afficherait pas.");
  if (d.status === "published" && images.length === 0) return fail("Ajoutez au moins une image avant de publier.");
  if (d.status === "published" && images.some((i) => !i.alt)) return fail("Chaque image publiée doit avoir un texte alternatif.");
  let id = d.id || undefined;
  // Un produit numérique ne peut pas être publié sans fichier livrable réellement enregistré.
  if (d.status === "published" && d.kind === "digital") {
    const hasNew = Boolean(d.deliverable_path);
    const { data: existing } = id ? await sb.from("product_deliverables").select("product_id").eq("product_id", id).maybeSingle() : { data: null };
    if (!hasNew && !existing) return fail("Un produit numérique publié doit avoir un fichier livrable : envoyez-le avant de publier.");
  }
  const row = { title: d.title, slug: slugify(d.slug || d.title), summary: d.summary, description: d.description, kind: d.kind, price_cents: cents, features: lines(form.get("features")), images, demo_url: d.demo_url || null, status: d.status, allow_comments: form.get("allow_comments") === "on", allow_reviews: form.get("allow_reviews") === "on" };
  if (id) {
    const { data: cur } = await sb.from("products").select("published_at").eq("id", id).maybeSingle();
    const published_at = d.status === "published" ? cur?.published_at ?? new Date().toISOString() : cur?.published_at ?? null;
    const { error } = await sb.from("products").update({ ...row, published_at }).eq("id", id);
    if (error) return fail(error.code === "23505" ? "Cette adresse (slug) existe déjà." : error.message);
  } else {
    const { data, error } = await sb.from("products").insert({ ...row, published_at: d.status === "published" ? new Date().toISOString() : null }).select("id").single();
    if (error || !data) return fail(error?.code === "23505" ? "Cette adresse (slug) existe déjà." : (error?.message ?? "Enregistrement impossible."));
    id = data.id;
  }
  if (d.deliverable_path) {
    const { error } = await sb.from("product_deliverables").upsert({ product_id: id!, storage_path: d.deliverable_path, file_name: d.deliverable_name || "fichier" });
    if (error) return fail("Produit enregistré, mais le fichier livrable n'a pas pu être rattaché : " + error.message);
  }
  revalidateTag("products"); revalidatePath("/boutique"); revalidatePath("/admin/produits");
  if (!d.id) redirect(`/admin/produits?id=${id}&cree=1`);
  return { ok: "Produit enregistré." };
}
export async function deleteProduct(form: FormData) {
  const { sb } = await requireAdmin();
  const { error } = await sb.from("products").delete().eq("id", z.string().uuid().parse(form.get("id")));
  if (error) throw new Error("Suppression impossible (une commande est peut-être liée) : archivez le produit à la place. " + error.message);
  revalidateTag("products"); revalidatePath("/boutique"); revalidatePath("/admin/produits"); redirect("/admin/produits");
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

// ---------------------------------------------------------------- commandes : rapprochement paiement / livraison
const orderId = (form: FormData) => z.string().uuid().parse(form.get("id"));

/** Désactive immédiatement le lien de téléchargement d'une commande. */
export async function revokeDownload(form: FormData) {
  const { sb } = await requireAdmin();
  const { error } = await sb.from("orders").update({ download_token: null }).eq("id", orderId(form));
  if (error) throw new Error("Révocation impossible : " + error.message);
  revalidatePath("/admin/commandes");
}
/** Émet un nouveau lien (30 jours, 5 téléchargements) pour une commande payée : l'ancien lien cesse de fonctionner. */
export async function renewDownload(form: FormData) {
  const { sb } = await requireAdmin();
  const token = randomBytes(32).toString("hex");
  const { error } = await sb.from("orders").update({ download_token: token, expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), download_max: 5 }).eq("id", orderId(form)).eq("status", "paid");
  if (error) throw new Error("Renouvellement impossible : " + error.message);
  revalidatePath("/admin/commandes");
}
/** Marque une alerte comme traitée (après vérification dans Stripe). */
export async function resolveOrderReview(form: FormData) {
  const { sb } = await requireAdmin();
  const { error } = await sb.from("orders").update({ needs_review: false }).eq("id", orderId(form));
  if (error) throw new Error("Mise à jour impossible : " + error.message);
  revalidatePath("/admin/commandes");
}
