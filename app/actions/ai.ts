"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { allow } from "@/lib/rate-limit";
import { sendEmail, esc } from "@/lib/email";
import { encryptSecret } from "@/lib/ai/crypto";
import { callChat } from "@/lib/ai/router";
import { PRESETS, ROLES, scrub, type KeyRow } from "@/lib/ai/policy";
import { createDraftProduct, proposeProduct, research } from "@/lib/ai/agents";
import { parseProposal } from "@/lib/ai/guard";

const back = (msg: string, kind: "ok" | "erreur" = "ok"): never => { revalidatePath("/admin/ia"); redirect(`/admin/ia?${kind}=${encodeURIComponent(msg)}`); };
const id = (f: FormData) => z.string().uuid().parse(f.get("id"));

export async function addKey(form: FormData) {
  await requireAdmin();
  const p = z.object({
    provider: z.enum(["openrouter", "groq", "deepseek", "openai", "custom"]), label: z.string().trim().min(1).max(80),
    base_url: z.string().trim().max(300).optional(), model: z.string().trim().max(120).optional(),
    secret: z.string().trim().min(10, "Clé trop courte.").max(400), priority: z.coerce.number().int().min(1).max(10000).default(100),
    daily_limit: z.string().trim().optional(),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return back(p.error.issues[0]?.message ?? "Formulaire invalide.", "erreur");
  const d = p.data; const preset = PRESETS[d.provider];
  const base = (d.provider === "custom" ? d.base_url : preset.baseUrl) ?? ""; const model = d.model || preset.model;
  if (!/^https:\/\/[^\s]+$/.test(base)) return back("L'adresse du service doit commencer par https://.", "erreur");
  if (!model) return back("Indiquez le modèle à utiliser.", "erreur");
  const roles = form.getAll("roles").map(String).filter((r) => (ROLES as readonly string[]).includes(r)); const limit = d.daily_limit ? Number(d.daily_limit) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return back("Limite journalière invalide.", "erreur");
  let enc: string; try { enc = encryptSecret(d.secret); } catch (e) { return back(e instanceof Error ? e.message : "Chiffrement impossible.", "erreur"); }
  const { error } = await supabaseAdmin().from("ai_keys").insert({ provider: d.provider, label: d.label, base_url: base, model, secret_enc: enc, key_hint: d.secret.slice(-4), roles: roles.length ? roles : ["general"], priority: d.priority, daily_limit: limit });
  if (error) return back("Clé non enregistrée.", "erreur");
  return back("Clé ajoutée et chiffrée. Testez-la avec le bouton « Tester ».");
}

export async function keyAction(form: FormData) {
  await requireAdmin(); const db = supabaseAdmin(); const kid = id(form); const op = z.enum(["toggle", "delete", "reset", "test"]).parse(form.get("op"));
  if (op === "delete") { await db.from("ai_keys").delete().eq("id", kid); return back("Clé supprimée."); }
  const { data: k } = await db.from("ai_keys").select("*").eq("id", kid).single(); if (!k) return back("Clé introuvable.", "erreur");
  if (op === "toggle") { await db.from("ai_keys").update({ enabled: !k.enabled, cooldown_until: null, fail_count: 0 }).eq("id", kid); return back(k.enabled ? "Clé désactivée." : "Clé activée."); }
  if (op === "reset") { await db.from("ai_keys").update({ cooldown_until: null, fail_count: 0, last_error: null }).eq("id", kid); return back("Pause levée."); }
  if (!(await allow("ai-test", 20, 600))) return back("Trop de tests. Patientez quelques minutes.", "erreur");
  const { decryptSecret } = await import("@/lib/ai/crypto");
  let plain: string; try { plain = decryptSecret((k as KeyRow).secret_enc); } catch { return back("Clé illisible : la clé maîtresse a changé ? Supprimez et ré-ajoutez cette clé.", "erreur"); }
  const r = await callChat(k as KeyRow, plain, [{ role: "user", content: "Réponds uniquement : OK" }], { maxTokens: 5, timeoutMs: 20000 });
  if (r.status === 200) { await db.from("ai_keys").update({ last_ok_at: new Date().toISOString(), last_error: null, fail_count: 0 }).eq("id", kid); return back(`« ${k.label} » fonctionne.`); }
  const msg = scrub(`${r.status ?? "réseau"} ${r.detail ?? ""}`).slice(0, 200);
  await db.from("ai_keys").update({ last_error: msg }).eq("id", kid);
  return back(`« ${k.label} » a échoué : ${msg}`, "erreur");
}

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const cap = z.coerce.number().int().min(1).max(100000).safeParse(form.get("daily_call_cap")); if (!cap.success) return back("Plafond invalide.", "erreur");
  await supabaseAdmin().from("ai_settings").update({ enabled: form.get("enabled") === "on", daily_call_cap: cap.data, updated_at: new Date().toISOString() }).eq("id", 1);
  return back("Réglages enregistrés.");
}

export async function saveAgent(form: FormData) {
  await requireAdmin();
  const p = z.object({ slug: z.enum(["support", "recherche", "catalogue"]), autonomy: z.enum(["draft", "auto"]), system_prompt: z.string().trim().min(20).max(8000) }).safeParse(Object.fromEntries(form));
  if (!p.success) return back("Consigne trop courte ou réglage invalide.", "erreur");
  // Le mode « auto » n'existe que pour le support : la recherche et le catalogue ne publient jamais seuls.
  const autonomy = p.data.slug === "support" ? p.data.autonomy : "draft";
  await supabaseAdmin().from("ai_agents").update({ enabled: form.get("enabled") === "on", autonomy, system_prompt: p.data.system_prompt, updated_at: new Date().toISOString() }).eq("slug", p.data.slug);
  return back("Agent enregistré.");
}

export async function askResearch(form: FormData) {
  await requireAdmin(); const q = z.string().trim().min(10).max(1500).safeParse(form.get("request")); if (!q.success) return back("Décrivez votre demande (10 caractères minimum).", "erreur");
  if (!(await allow("ai-ask", 15, 600))) return back("Trop de demandes. Patientez.", "erreur");
  const r = await research(q.data); return back(r.note, r.ok ? "ok" : "erreur");
}
export async function askProduct(form: FormData) {
  await requireAdmin(); const q = z.string().trim().min(10).max(1500).safeParse(form.get("request")); if (!q.success) return back("Décrivez le produit (10 caractères minimum).", "erreur");
  if (!(await allow("ai-ask", 15, 600))) return back("Trop de demandes. Patientez.", "erreur");
  const r = await proposeProduct(q.data); return back(r.note, r.ok ? "ok" : "erreur");
}

/** Décision de l'administrateur sur une tâche en attente : c'est ici, et seulement ici, qu'un e-mail part ou qu'un produit est créé. */
export async function decideTask(form: FormData) {
  const { user } = await requireAdmin(); const db = supabaseAdmin(); const tid = id(form); const op = z.enum(["approve", "reject"]).parse(form.get("op"));
  const { data: t } = await db.from("ai_tasks").select("*").eq("id", tid).eq("status", "pending").maybeSingle(); if (!t) return back("Tâche introuvable ou déjà traitée.", "erreur");
  const stamp = { decided_at: new Date().toISOString(), decided_by: user.id };
  if (op === "reject") { await db.from("ai_tasks").update({ status: "rejected", ...stamp }).eq("id", tid); return back("Proposition refusée."); }
  if (t.kind === "reply_draft") {
    const body = z.string().trim().min(5).max(3000).safeParse(form.get("body")); if (!body.success) return back("Réponse vide ou trop longue.", "erreur");
    const p = t.payload as { to: string; subject: string };
    const sent = await sendEmail({ to: p.to, subject: p.subject, html: `<p style="white-space:pre-wrap">${esc(body.data)}</p><p>Assavendo</p>` });
    if (!sent) return back("L'e-mail n'a pas pu partir (service d'envoi non configuré ?). Le brouillon est conservé.", "erreur");
    await db.from("ai_tasks").update({ status: "done", ...stamp, result: { sent: true } }).eq("id", tid);
    if (t.source_id) await db.from("contact_messages").update({ status: "read" }).eq("id", t.source_id);
    return back("Réponse envoyée.");
  }
  if (t.kind === "product_proposal") {
    const p = parseProposal(JSON.stringify(t.payload)); if (!p.ok) return back(p.error, "erreur");
    const pid = await createDraftProduct(p.value); if (!pid) return back("Produit non créé.", "erreur");
    await db.from("ai_tasks").update({ status: "done", ...stamp, result: { product_id: pid } }).eq("id", tid);
    return back("Produit créé en brouillon. Complétez-le puis publiez-le depuis « Produits ».");
  }
  return back("Type de tâche non géré.", "erreur");
}
