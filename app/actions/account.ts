"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { siteUrl } from "@/lib/env";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireCustomer, safeNext } from "@/lib/customer";
import { canRequestReturn, RETURN_REASONS } from "@/lib/returns";
import { esc, notifyOwner, sendEmail } from "@/lib/email";
import { formValues } from "@/lib/form";
import type { FormState } from "./contact";

export async function sendLoginLink(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: false, message: "Demande refusée." };
  const parsed = z.object({ email: z.string().trim().email("Cette adresse e-mail semble invalide.").max(320) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Adresse invalide.", values: formValues(form) };
  if (!(await allow("login-link", 5, 900))) return { ok: false, message: "Trop de demandes. Réessayez dans quelques minutes.", values: formValues(form) };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { ok: false, message: "La vérification anti-robot a échoué. Réessayez.", values: formValues(form) };
  const next = safeNext(String(form.get("next") ?? ""));
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({ email: parsed.data.email.toLowerCase(), options: { emailRedirectTo: `${siteUrl}/compte/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true } });
  if (error) { console.error("[compte] lien de connexion", error.message); return { ok: false, message: "Le lien n'a pas pu être envoyé. Réessayez dans un instant.", values: formValues(form) }; }
  // Même réponse que l'adresse existe ou non : on ne révèle pas quels comptes existent.
  return { ok: true, message: "Si cette adresse est valide, un lien de connexion vient de vous être envoyé. Il est valable une heure." };
}

export async function signOutCustomer() {
  await (await supabaseServer()).auth.signOut();
  redirect("/");
}

export async function toggleFavorite(form: FormData) {
  const productId = z.string().uuid().parse(form.get("productId"));
  const back = String(form.get("back") ?? "");
  const dest = /^\/boutique\/[\w-]+$/.test(back) ? back : "/compte/favoris";
  const { sb, user } = await requireCustomer(dest);
  const { data: have } = await sb.from("favorites").select("product_id").eq("user_id", user.id).eq("product_id", productId).maybeSingle();
  if (have) await sb.from("favorites").delete().eq("user_id", user.id).eq("product_id", productId);
  else await sb.from("favorites").insert({ user_id: user.id, product_id: productId });
  revalidatePath("/compte/favoris");
  redirect(dest);
}

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default("Domicile"), full_name: z.string().trim().min(2, "Indiquez le nom du destinataire.").max(120),
  line1: z.string().trim().min(3, "Indiquez l'adresse.").max(160), line2: z.string().trim().max(160).optional(),
  postal_code: z.string().trim().min(2, "Indiquez le code postal.").max(12), city: z.string().trim().min(1, "Indiquez la ville.").max(100),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Pays : code à 2 lettres (FR, BE…)."), phone: z.string().trim().max(30).optional(),
});
export async function addAddress(_: FormState, form: FormData): Promise<FormState> {
  const { sb, user } = await requireCustomer("/compte/adresses");
  const parsed = addressSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.", values: formValues(form) };
  const { count } = await sb.from("addresses").select("*", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 5) return { ok: false, message: "Vous pouvez enregistrer 5 adresses au maximum : supprimez-en une d'abord.", values: formValues(form) };
  const d = parsed.data;
  const { error } = await sb.from("addresses").insert({ user_id: user.id, label: d.label, full_name: d.full_name, line1: d.line1, line2: d.line2 || null, postal_code: d.postal_code, city: d.city, country: d.country, phone: d.phone || null });
  if (error) return { ok: false, message: "Adresse non enregistrée : " + error.message, values: formValues(form) };
  revalidatePath("/compte/adresses");
  return { ok: true, message: "Adresse enregistrée." };
}
export async function deleteAddress(form: FormData) {
  const { sb, user } = await requireCustomer("/compte/adresses");
  await sb.from("addresses").delete().eq("id", z.string().uuid().parse(form.get("id"))).eq("user_id", user.id);
  revalidatePath("/compte/adresses");
}

/** Demande de retour : depuis le lien de suivi de la commande (compte non requis). La propriété est prouvée par le jeton secret. */
export async function requestReturn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/), item: z.string().uuid(), reason: z.enum(["changed_mind", "defective", "not_as_described", "damaged", "other"], { error: "Choisissez un motif." }),
    details: z.string().trim().max(2000).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.", values: formValues(form) };
  if (!(await allow("return-request", 6, 3600))) return { ok: false, message: "Trop de demandes. Réessayez plus tard.", values: formValues(form) };
  const db = supabaseAdmin(); const d = parsed.data;
  const { data: o } = await db.from("orders").select("id, order_number, status, paid_at, delivered_at, customer_email").eq("access_token", d.token).maybeSingle();
  if (!o) return { ok: false, message: "Commande introuvable.", values: formValues(form) };
  const { data: it } = await db.from("order_items").select("id, title, kind, product_id, order_id").eq("id", d.item).eq("order_id", o.id).maybeSingle();
  if (!it) return { ok: false, message: "Article introuvable.", values: formValues(form) };
  const { data: p } = await db.from("products").select("return_days, delivery_max_days").eq("id", it.product_id).maybeSingle();
  if (!canRequestReturn({ paid_at: o.paid_at, delivered_at: o.delivered_at, delivery_max_days: p?.delivery_max_days ?? null, return_days: p?.return_days ?? 14, kind: it.kind, status: o.status }))
    return { ok: false, message: "Le délai de retour de cet article est dépassé ou il n'est pas retournable. Écrivez-nous si vous pensez qu'il s'agit d'une erreur.", values: formValues(form) };
  const { error } = await db.from("return_requests").insert({ order_id: o.id, order_item_id: it.id, email: o.customer_email, reason: d.reason, details: d.details ?? "" });
  if (error) return { ok: false, message: error.code === "23505" ? "Une demande est déjà en cours pour cet article." : "Demande non enregistrée. Réessayez.", values: formValues(form) };
  await notifyOwner("Demande de retour", `<p>Commande ${esc(o.order_number ?? "")} — ${esc(it.title)} — motif : ${esc(RETURN_REASONS[d.reason])}</p><p>Voir /admin/retours</p>`);
  await sendEmail({ to: o.customer_email, subject: `Demande de retour reçue (${o.order_number})`, html: `<p>Nous avons bien reçu votre demande de retour pour <strong>${esc(it.title)}</strong>. Nous revenons vers vous rapidement avec la marche à suivre.</p><p>Assavendo</p>` });
  revalidatePath(`/commande/${d.token}`);
  return { ok: true, message: "Demande envoyée. Nous revenons vers vous rapidement avec la marche à suivre." };
}

/** Suppression du compte : données personnelles effacées ou anonymisées (les factures sont conservées de façon anonymisée selon l'obligation légale). */
export async function deleteAccount(form: FormData) {
  const { user } = await requireCustomer("/compte");
  if (form.get("confirm") !== "SUPPRIMER") redirect("/compte?erreur=confirmation");
  const db = supabaseAdmin();
  await db.rpc("erase_personal_data", { p_email: user.email });
  await db.auth.admin.deleteUser(user.id);   // favoris et adresses suivent par cascade
  await (await supabaseServer()).auth.signOut();
  redirect("/?compte=supprime");
}
