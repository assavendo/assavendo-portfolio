"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin, requireAdminBase } from "@/lib/admin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import { toolKeys } from "@/lib/tool-keys";
import { slugProblem, validatePublishable } from "@/lib/content-rules";
import { isAllowedImageUrl } from "@/lib/images";
import { allow } from "@/lib/rate-limit";
import { formValues } from "@/lib/form";
import { esc, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";

export type AdminState = { error?: string; ok?: string; values?: Record<string, string> };
const adminNext = (value: FormDataEntryValue | null) => {
  const v = String(value ?? "");
  return /^\/admin(?:\/[a-z0-9/_-]+)?$/.test(v) ? v : "/admin";
};

export async function verifyAdminMfa(form: FormData) {
  const { sb } = await requireAdminBase();
  const next = adminNext(form.get("next"));
  const fail = () => redirect("/admin/mfa?next=" + encodeURIComponent(next) + "&erreur=1");
  const parsed = z.string().regex(/^\d{6}$/, "Saisissez le code à 6 chiffres.").safeParse(String(form.get("code") ?? ""));
  if (!parsed.success) return fail();
  if (!(await allow("admin-mfa", 6, 600))) return redirect("/admin/mfa?next=" + encodeURIComponent(next) + "&erreur=limite");
  const { data: factors, error: factorsError } = await sb.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (factorsError || !factor) return fail();
  const { data: challenge, error: challengeError } = await sb.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError || !challenge) return fail();
  const { error } = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: parsed.data });
  if (error) return fail();
  redirect(next);
}

export async function unenrollAdminMfa(form: FormData) {
  const { sb } = await requireAdmin();
  if (String(form.get("confirm") ?? "") !== "DESACTIVER") redirect("/admin/securite?erreur=confirmation");
  const factorId = z.string().uuid().parse(form.get("factorId"));
  const { error } = await sb.auth.mfa.unenroll({ factorId });
  if (error) throw new Error("Impossible de désactiver le second facteur : " + error.message);
  revalidatePath("/admin"); revalidatePath("/admin/securite");
  redirect("/admin/securite?mfa=off");
}


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
  id: z.string().uuid().optional().or(z.literal("")), title: z.string().trim().min(2, "Le nom du produit est obligatoire.").max(180, "Le nom du produit est trop long (180 caractères maximum)."), slug: text(80).optional(),
  summary: z.string().trim().min(12, "Le résumé doit faire au moins 12 caractères.").max(500), description: text(8000),
  kind: z.enum(["digital", "service", "physical"]), price: z.coerce.number().min(0).max(100000), status: z.enum(["draft", "published", "archived"]),
  demo_url: z.string().url().optional().or(z.literal("")), deliverable_path: text(300).optional(), deliverable_name: text(200).optional(),
});
const optInt = (form: FormData, k: string, max = 1_000_000): number | null | "invalid" => {
  const raw = String(form.get(k) ?? "").trim(); if (!raw) return null;
  const n = Number(raw.replace(",", ".")); return Number.isInteger(n) && n >= 0 && n <= max ? n : "invalid";
};
const euros = (form: FormData, k: string): number | null | "invalid" => {
  const raw = String(form.get(k) ?? "").trim(); if (!raw) return null;
  const n = Number(raw.replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) : "invalid";
};

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
  const row: Record<string, unknown> = { title: d.title, slug: slugify(d.slug || d.title), summary: d.summary, description: d.description, kind: d.kind, price_cents: cents, features: lines(form.get("features")), images, demo_url: d.demo_url || null, status: d.status, allow_comments: form.get("allow_comments") === "on", allow_reviews: form.get("allow_reviews") === "on" };
  // Champs de catalogue : présents seulement si la migration catalogue est appliquée (le formulaire les affiche alors)
  if (form.has("category_id")) {
    const catId = String(form.get("category_id") ?? "") || null;
    let attrDefs: { key: string; type: string; values?: string[] }[] = [];
    if (catId) {
      const { data: cat } = await sb.from("categories").select("id, parent_id, sellable, note, attributes").eq("id", catId).maybeSingle();
      if (!cat) return fail("Catégorie introuvable.");
      if (d.status === "published" && !cat.sellable) return fail("Publication impossible : " + (cat.note || "cette famille n'est pas encore validée pour la vente."));
      attrDefs = [...(cat.attributes ?? [])];
      if (cat.parent_id) { const { data: par } = await sb.from("categories").select("attributes").eq("id", cat.parent_id).maybeSingle(); attrDefs = [...attrDefs, ...(par?.attributes ?? [])]; }
    }
    const attributes: Record<string, string | number | boolean> = {};
    for (const a of attrDefs) {
      const raw = String(form.get(`attr_${a.key}`) ?? "").trim(); if (!raw) continue;
      if (a.type === "enum" && !a.values?.includes(raw)) return fail(`Valeur invalide pour « ${a.key} ».`);
      if (a.type === "number") { const n = Number(raw.replace(",", ".")); if (!Number.isFinite(n)) return fail(`« ${a.key} » doit être un nombre.`); attributes[a.key] = n; }
      else if (a.type === "boolean") attributes[a.key] = raw === "true";
      else attributes[a.key] = raw.slice(0, 120);
    }
    const compare = euros(form, "compare_at");
    if (compare === "invalid") return fail("Ancien prix invalide.");
    if (compare !== null && compare <= cents) return fail("L'ancien prix barré doit être supérieur au prix actuel (aucune fausse remise).");
    let brand_id: string | null = null;
    const brandName = String(form.get("brand") ?? "").trim().slice(0, 120);
    if (brandName) {
      const bslug = slugify(brandName) || "marque";
      const { data: b } = await sb.from("brands").select("id").eq("slug", bslug).maybeSingle();
      if (b) brand_id = b.id;
      else {
        const { data: nb, error: be } = await sb.from("brands").insert({ slug: bslug, name: brandName }).select("id").single();
        if (be || !nb) return fail("Marque non enregistrée : " + (be?.message ?? "erreur"));
        brand_id = nb.id;
      }
    }
    Object.assign(row, { category_id: catId, brand_id, compare_at_cents: compare, attributes, tags: String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) });
    if (form.has("sku")) {
      const gtin = String(form.get("gtin") ?? "").trim();
      if (gtin && !/^[0-9]{8,14}$/.test(gtin)) return fail("Le code-barres doit contenir 8 à 14 chiffres.");
      const origin = String(form.get("origin_country") ?? "").trim().toUpperCase();
      if (origin && !/^[A-Z]{2}$/.test(origin)) return fail("Le pays d'origine s'indique par un code à 2 lettres (FR, DE…).");
      const n = { weight_g: optInt(form, "weight_g"), delivery_min_days: optInt(form, "delivery_min_days", 365), delivery_max_days: optInt(form, "delivery_max_days", 365), warranty_months: optInt(form, "warranty_months", 240), return_days: optInt(form, "return_days", 365), stock_qty: optInt(form, "stock_qty"), low_stock_threshold: optInt(form, "low_stock_threshold", 100_000) };
      for (const [k, val] of Object.entries(n)) if (val === "invalid") return fail(`Valeur invalide pour « ${k} » : entrez un nombre entier positif.`);
      const ship = euros(form, "shipping");
      if (ship === "invalid") return fail("Frais de livraison invalides.");
      const num = (x: number | null | "invalid") => (x === "invalid" ? null : x);
      const dmin = num(n.delivery_min_days), dmax = num(n.delivery_max_days);
      if (dmin !== null && dmax !== null && dmin > dmax) return fail("Le délai minimum ne peut pas dépasser le délai maximum.");
      if (d.status === "published" && d.kind === "physical" && (dmin === null || dmax === null)) return fail("Un produit physique publié doit indiquer son délai de livraison (minimum et maximum).");
      Object.assign(row, {
        sku: String(form.get("sku") ?? "").trim() || null, gtin: gtin || null, origin_country: origin || null, shipping_cents: ship ?? 0,
        track_stock: form.get("track_stock") === "on", weight_g: num(n.weight_g), delivery_min_days: dmin, delivery_max_days: dmax, warranty_months: num(n.warranty_months),
        return_days: num(n.return_days) ?? 14, stock_qty: num(n.stock_qty) ?? 0, low_stock_threshold: num(n.low_stock_threshold) ?? 3,
      });
    }
  }

  if (id) {
    const { data: cur } = await sb.from("products").select("published_at").eq("id", id).maybeSingle();
    const published_at = d.status === "published" ? cur?.published_at ?? new Date().toISOString() : cur?.published_at ?? null;
    const { error } = await sb.from("products").update({ ...row, published_at }).eq("id", id);
    if (error) return fail(error.code === "23505" ? "Cette adresse (slug) ou cette référence (SKU) existe déjà." : error.message);
  } else {
    const { data, error } = await sb.from("products").insert({ ...row, published_at: d.status === "published" ? new Date().toISOString() : null }).select("id").single();
    if (error || !data) return fail(error?.code === "23505" ? "Cette adresse (slug) existe déjà." : (error?.message ?? "Enregistrement impossible."));
    id = data.id;
  }
  if (d.deliverable_path) {
    const { error } = await sb.from("product_deliverables").upsert({ product_id: id!, storage_path: d.deliverable_path, file_name: d.deliverable_name || "fichier" });
    if (error) return fail("Produit enregistré, mais le fichier livrable n'a pas pu être rattaché : " + error.message);
  }
  revalidateTag("products"); revalidateTag("brands"); revalidatePath("/"); revalidatePath("/boutique"); revalidatePath("/numerique"); revalidatePath("/promotions"); revalidatePath("/admin/produits");
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
  const table = kind === "comment" ? "product_comments" : "product_reviews";
  const { error } = await sb.from(table).update({ status: decision }).eq("id", id);
  if (error) throw new Error("Modération impossible : " + error.message);
  revalidatePath("/admin/moderation");
}
export async function replyAsOwner(form: FormData) {
  const { sb } = await requireAdmin();
  const p = z.object({ parent: z.string().uuid(), product: z.string().uuid(), body: z.string().trim().min(2).max(1500) }).parse({ parent: form.get("parent"), product: form.get("product"), body: form.get("body") });
  const { data: parent, error: parentError } = await sb.from("product_comments").select("id, product_id, status, is_owner_reply, parent_id").eq("id", p.parent).maybeSingle();
  if (parentError || !parent || parent.status !== "approved" || parent.is_owner_reply || parent.parent_id || parent.product_id !== p.product) throw new Error("Commentaire parent invalide.");
  const { error } = await sb.from("product_comments").insert({ product_id: p.product, parent_id: p.parent, author_name: "Assavendo", body: p.body, is_owner_reply: true, status: "approved" });
  if (error) throw new Error("Réponse impossible : " + error.message);
  revalidatePath("/admin/moderation");
}
export async function setMessageStatus(form: FormData) {
  const { sb } = await requireAdmin();
  const status = z.enum(["new", "read", "archived"]).parse(form.get("status"));
  const { error } = await sb.from("contact_messages").update({ status }).eq("id", z.string().uuid().parse(form.get("id")));
  if (error) throw new Error("Mise à jour du message impossible : " + error.message);
  revalidatePath("/admin/messages");
}

// ---------------------------------------------------------------- commandes : rapprochement paiement / livraison
const orderId = (form: FormData) => z.string().uuid().parse(form.get("id"));

/** Désactive immédiatement le lien de téléchargement d'une commande. */
export async function revokeDownload(form: FormData) {
  const { sb } = await requireAdmin();
  const id = orderId(form);
  const { error } = await sb.from("orders").update({ download_token: null }).eq("id", id);
  if (error) throw new Error("Révocation impossible : " + error.message);
  const { error: ie } = await sb.from("order_items").update({ download_token: null }).eq("order_id", id);
  if (ie) throw new Error("Révocation impossible : " + ie.message);
  revalidatePath("/admin/commandes");
}
/** Émet un nouveau lien (30 jours, 5 téléchargements) pour une commande payée : l'ancien lien cesse de fonctionner. */
export async function renewDownload(form: FormData) {
  const { sb } = await requireAdmin();
  const id = orderId(form);
  const { data, error } = await sb.rpc("admin_renew_download", { p_order_id: id, p_ttl_days: 30 });
  if (error) throw new Error("Renouvellement impossible : " + error.message);
  if (Number(data ?? 0) <= 0) throw new Error("Aucun fichier numérique renouvelable pour cette commande ou commande à vérifier.");
  revalidatePath("/admin/commandes");
}
/** Marque une alerte comme traitée (après vérification dans Stripe). */
export async function resolveOrderReview(form: FormData) {
  const { sb } = await requireAdmin();
  const { error } = await sb.from("orders").update({ needs_review: false, review_note: null }).eq("id", orderId(form));
  if (error) throw new Error("Mise à jour impossible : " + error.message);
  revalidatePath("/admin/commandes");
}

/** Avancement d'une commande physique : préparation, expédition (avec suivi), livraison. Le client est prévenu à l'expédition. */
export async function updateFulfilment(form: FormData) {
  const { sb } = await requireAdmin();
  const parsed = z.object({
    id: z.string().uuid(), fulfilment: z.enum(["to_prepare", "preparing", "shipped", "delivered"]),
    tracking_number: z.string().trim().max(80).optional(), tracking_url: z.string().trim().url().startsWith("https://").optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("Suivi invalide : le lien de suivi doit commencer par https://.");
  const d = parsed.data;
  const { data: cur } = await sb.from("orders").select("fulfilment, status, customer_email, order_number, access_token, order_items(kind)").eq("id", d.id).maybeSingle();
  if (!cur || cur.status !== "paid") throw new Error("Seule une commande payée peut être expédiée.");
  const items = (cur.order_items ?? []) as { kind: string }[];
  if (!items.some((i) => i.kind === "physical")) throw new Error("Cette commande ne contient aucun article physique.");
  if (cur.fulfilment === "delivered" && d.fulfilment !== "delivered") throw new Error("Une commande livrée ne peut pas revenir à un état antérieur.");
  const { error } = await sb.from("orders").update({
    fulfilment: d.fulfilment,
    tracking_number: d.tracking_number || null,
    tracking_url: d.tracking_url || null,
    delivered_at: d.fulfilment === "delivered" ? new Date().toISOString() : null,
  }).eq("id", d.id);
  if (error) throw new Error("Mise à jour impossible : " + error.message);
  if (d.fulfilment === "shipped" && cur.fulfilment !== "shipped") {
    await sendEmail({ to: cur.customer_email, subject: `Votre commande ${cur.order_number} est expédiée`, html: `<p>Bonne nouvelle : votre commande <strong>${esc(cur.order_number ?? "")}</strong> est expédiée.</p>${d.tracking_url ? `<p>Suivre le colis : <a href="${esc(d.tracking_url)}">${esc(d.tracking_number || d.tracking_url)}</a></p>` : d.tracking_number ? `<p>Numéro de suivi : ${esc(d.tracking_number)}</p>` : ""}<p>Détail de la commande : <a href="${siteUrl}/commande/${cur.access_token}">${siteUrl}/commande/${cur.access_token}</a></p><p>Assavendo</p>` });
  }
  revalidatePath("/admin/commandes");
}

/** Traitement d'une demande de retour. « Colis reçu » peut remettre l'article en stock (journalisé). Le remboursement se fait dans Stripe. */
export async function processReturn(form: FormData) {
  const { sb } = await requireAdmin();
  const d = z.object({ id: z.string().uuid(), status: z.enum(["approved", "refused", "received", "refunded"]), admin_note: z.string().trim().max(2000).optional() }).parse(Object.fromEntries(form));
  const { data: r } = await sb.from("return_requests").select("id, status, email, order_item_id, order_items(title, qty, product_id, variant_id, kind), orders(order_number)").eq("id", d.id).maybeSingle();
  if (!r) throw new Error("Demande introuvable.");
  const db = supabaseAdmin();
  const restock = form.get("restock") === "on";
  const { error } = await db.rpc("admin_process_return", { p_id: d.id, p_status: d.status, p_admin_note: d.admin_note ?? "", p_restock: restock });
  if (error) throw new Error("Traitement du retour impossible : " + error.message);
  const it = r.order_items as unknown as { title: string; qty: number; product_id: string; variant_id: string | null; kind: string } | null;
  if (d.status !== r.status) {
    const label = { approved: "Votre demande de retour est acceptée.", refused: "Votre demande de retour a été refusée.", received: "Nous avons bien reçu votre colis.", refunded: "Votre remboursement a été effectué." }[d.status];
    await sendEmail({ to: r.email, subject: `Retour : ${it?.title ?? "votre article"}`, html: `<p>${esc(label)}</p>${d.admin_note ? `<p>${esc(d.admin_note)}</p>` : ""}<p>Assavendo</p>` });
  }
  revalidatePath("/admin/retours");
}
