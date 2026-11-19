"use server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { allow } from "@/lib/rate-limit";
import { sendEmail, esc } from "@/lib/email";
import { encryptSecret } from "@/lib/ai/crypto";
import { callChat, runAgent } from "@/lib/ai/router";
import { PRESETS, ROLES, scrub, type KeyRow } from "@/lib/ai/policy";
import { createDraftProduct, proposeProduct, research } from "@/lib/ai/agents";
import { parseProposal } from "@/lib/ai/guard";
import { isAllowedImageUrl } from "@/lib/images";

const back = (msg: string, kind: "ok" | "erreur" = "ok"): never => { revalidatePath("/admin/ia"); redirect(`/admin/ia?${kind}=${encodeURIComponent(msg)}`); };
const id = (f: FormData) => z.string().uuid().parse(f.get("id"));
const aiConversationAgent = z.enum(["recherche", "catalogue", "support"]);

async function createSupplierMappingsForDraft(
  db: ReturnType<typeof supabaseAdmin>,
  productId: string,
  supplierConnectionId: string | null,
  supplierVariants: Array<{ sku?: string; label?: string; options?: Record<string, string> }>,
  productSku?: string,
): Promise<{ created: number; error?: string }> {
  if (!supplierConnectionId) return { created: 0 };

  const { data: markets } = await db.from("markets")
    .select("code")
    .eq("sell_enabled", true)
    .eq("ship_enabled", true)
    .in("tax_status", ["approved", "legacy"])
    .in("shipping_status", ["approved", "legacy"])
    .in("compliance_status", ["approved", "legacy"])
    .in("pricing_status", ["approved", "legacy"])
    .in("payment_status", ["approved", "legacy"]);
  const countries = (markets ?? []).map((m) => String(m.code).toUpperCase()).filter(Boolean);
  if (!countries.length) return { created: 0, error: "Aucun marché autorisé n'est actuellement disponible; aucun routage fournisseur n'a été créé." };

  const { data: productVariants, error: variantsError } = await db.from("product_variants")
    .select("id,sort")
    .eq("product_id", productId)
    .order("sort");
  if (variantsError) return { created: 0, error: "Impossible de lire les variantes internes après création." };

  const internalVariants = productVariants ?? [];
  const sourceVariants = supplierVariants.length ? supplierVariants : (
    productSku?.trim() ? [{ sku: productSku.trim(), label: "Produit principal", options: {} }] : []
  );
  if (!sourceVariants.length) return { created: 0, error: "Le fournisseur a été sélectionné mais aucun SKU fournisseur exploitable n'a été extrait." };
  const expectedCount = internalVariants.length || 1;
  if (sourceVariants.length !== expectedCount) return { created: 0, error: "Le nombre de variantes fournisseur ne correspond pas au nombre de variantes Assavendo." };
  if (sourceVariants.some((variant) => !String(variant.sku ?? "").trim())) return { created: 0, error: "Au moins une variante source n'a pas de SKU fournisseur. Aucun mapping partiel n'a été enregistré." };
  let created = 0;
  for (let index = 0; index < sourceVariants.length; index += 1) {
    const supplierSku = String(sourceVariants[index]?.sku ?? "").trim();
    const variantId = internalVariants[index]?.id ?? null;

    const { data: existing, error: existingError } = await db.from("product_supplier_mappings")
      .select("id,product_id,variant_id")
      .eq("supplier_connection_id", supplierConnectionId)
      .eq("external_sku", supplierSku)
      .maybeSingle();
    if (existingError) return { created, error: "Impossible de vérifier les mappings fournisseur existants." };
    if (existing && (String(existing.product_id) !== productId || String(existing.variant_id ?? "") !== variantId)) {
      return { created, error: "Le SKU fournisseur " + supplierSku + " est déjà rattaché à un autre produit." };
    }

    const mappingRow = {
      supplier_connection_id: supplierConnectionId,
      product_id: productId,
      variant_id: variantId,
      external_sku: supplierSku,
      enabled: true,
      auto_reprice: true,
      reprice_mode: "cost_plus_margin",
      margin_bps: 3000,
      markup_cents: 0,
      min_retail_cents: 50,
      max_retail_cents: null,
      priority: 100,
      destination_countries: countries,
    };

    if (existing?.id) {
      const { error } = await db.from("product_supplier_mappings").update(mappingRow).eq("id", existing.id);
      if (error) return { created, error: "Le mapping fournisseur existant n'a pas pu être mis à jour." };
    } else {
      const { error } = await db.from("product_supplier_mappings").insert(mappingRow);
      if (error) return { created, error: "Le mapping fournisseur n'a pas pu être créé." };
      created += 1;
    }
  }
  return { created };
}
const optionalUuid = (value: FormDataEntryValue | null) => {
  if (!value) return null;
  const parsed = z.string().uuid().safeParse(String(value));
  return parsed.success ? parsed.data : null;
};

const conversationRedirect = (conversationId: string, message?: string, kind: "ok" | "erreur" = "ok"): never => {
  revalidatePath("/admin/ia");
  const params = new URLSearchParams({ conversation: conversationId });
  if (message) params.set(kind, message);
  redirect(`/admin/ia?${params.toString()}#ai-studio`);
};

function conversationTitle(text: string, fallback = "Nouvelle discussion"): string {
  const clean = text.replace(/\\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 64 ? `${clean.slice(0, 61)}…` : clean;
}

export async function sendAiConversationMessage(form: FormData) {
  const { user } = await requireAdmin();
  const agentSlug = aiConversationAgent.safeParse(form.get("agent_slug"));
  const message = z.string().trim().min(1).max(4000).safeParse(form.get("message"));
  const submission = z.string().uuid().safeParse(form.get("submission_id"));

  if (!agentSlug.success || !message.success || !submission.success) {
    return back("Message ou paramètres de conversation invalides.", "erreur");
  }

  const db = supabaseAdmin();
  const submissionId = submission.data;

  const { data: duplicate } = await db
    .from("ai_conversation_messages")
    .select("conversation_id, role, content")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (duplicate?.conversation_id) {
    return conversationRedirect(String(duplicate.conversation_id), "Cette demande a déjà été traitée : aucune deuxième requête IA n'a été envoyée.");
  }

  const { data: agentRow } = await db
    .from("ai_agents")
    .select("slug,system_prompt,enabled,autonomy")
    .eq("slug", agentSlug.data)
    .maybeSingle();

  if (!agentRow?.enabled) {
    return back(`Agent ${agentSlug.data} désactivé.`, "erreur");
  }

  let conversationId = optionalUuid(form.get("conversation_id"));

  if (conversationId) {
    const { data: existing } = await db
      .from("ai_conversations")
      .select("id,agent_slug,status")
      .eq("id", conversationId)
      .maybeSingle();

    if (!existing) conversationId = null;
    else if (existing.status === "archived") {
      return conversationRedirect(String(existing.id), "Cette discussion est archivée.", "erreur");
    } else if (existing.agent_slug !== agentSlug.data) {
      return conversationRedirect(String(existing.id), "Le type d'agent de cette discussion ne peut pas être changé en cours de route.", "erreur");
    }
  }

  if (!conversationId) {
    const { data: created, error: createError } = await db.from("ai_conversations").insert({
      agent_slug: agentSlug.data,
      title: conversationTitle(message.data),
      status: "active",
      last_message_preview: message.data.slice(0, 180),
      created_by: user.id,
    }).select("id").single();

    if (createError || !created) {
      return back("La discussion n'a pas pu être créée.", "erreur");
    }
    conversationId = String(created.id);
  }

  const { data: insertedUser, error: userMessageError } = await db.from("ai_conversation_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message.data,
    submission_id: submissionId,
    metadata: { actor: "admin", agent_slug: agentSlug.data },
  }).select("id").single();

  if (userMessageError?.code === "23505") {
    return conversationRedirect(conversationId, "Cette demande a déjà été prise en compte. Aucun second appel IA n'a été envoyé.");
  }
  if (userMessageError || !insertedUser) {
    return conversationRedirect(conversationId, "Votre message n'a pas pu être enregistré.", "erreur");
  }

  const { data: priorMessages } = await db
    .from("ai_conversation_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(24);

  const messages = [
    { role: "system" as const, content: agentRow.system_prompt },
    ...((priorMessages ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    }))),
  ];

  const t0 = Date.now();
  const result = await runAgent(
    agentSlug.data,
    messages,
    { maxTokens: 1400, json: agentSlug.data === "catalogue" },
  );
  const latency = Date.now() - t0;

  if (!result.ok) {
    await db.from("ai_conversation_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: result.error,
      latency_ms: latency,
      metadata: { error: true, attempts: result.attempts },
    });
    await db.from("ai_conversations").update({
      last_message_preview: `Erreur : ${result.error}`,
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId);
    return conversationRedirect(conversationId, result.error, "erreur");
  }

  await db.from("ai_conversation_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: result.text,
    provider_slug: result.provider,
    model_key: result.model,
    latency_ms: latency,
    estimated_cost_usd: result.estimatedCostUsd ?? null,
    metadata: {
      attempts: result.attempts,
      key_label: result.keyLabel,
      account_id: result.accountId ?? null,
    },
  });

  await db.from("ai_conversations").update({
    last_message_preview: result.text.replace(/\\s+/g, " ").slice(0, 180),
    updated_at: new Date().toISOString(),
  }).eq("id", conversationId);

  return conversationRedirect(conversationId, "Réponse générée.");
}

export async function renameAiConversation(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(form.get("id"));
  const title = z.string().trim().min(1).max(160).safeParse(form.get("title"));
  if (!id.success || !title.success) return back("Nom de discussion invalide.", "erreur");
  const db = supabaseAdmin();
  const { error } = await db.from("ai_conversations").update({
    title: title.data,
    updated_at: new Date().toISOString(),
  }).eq("id", id.data);
  if (error) return back(error.message, "erreur");
  return conversationRedirect(id.data, "Discussion renommée.");
}

export async function deleteAiConversation(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return back("Discussion invalide.", "erreur");
  const db = supabaseAdmin();
  await db.from("ai_audit_logs").insert({
    actor_type: "user",
    actor_id: user.id,
    user_id: user.id,
    service: "ai-control-plane",
    action: "delete_ai_conversation",
    resource_type: "ai_conversation",
    resource_id: id.data,
    policy_decision: "ALLOW",
    metadata: {},
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  const { error } = await db.from("ai_conversations").delete().eq("id", id.data);
  if (error) return back("La discussion n'a pas pu être supprimée.", "erreur");
  revalidatePath("/admin/ia");
  redirect("/admin/ia#ai-studio");
}

const submissionId = (f: FormData) => {
  const raw = f.get("submission_id");
  return raw ? z.string().uuid().parse(raw) : randomUUID();
};

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
  const db = supabaseAdmin();
  const { data: key, error } = await db.from("ai_keys").insert({
    provider: d.provider,
    label: d.label,
    base_url: base,
    model,
    secret_enc: enc,
    key_hint: d.secret.slice(-4),
    roles: roles.length ? roles : ["general"],
    priority: d.priority,
    daily_limit: limit,
  }).select("id").single();
  if (error || !key) return back("Clé non enregistrée.", "erreur");
  const { error: accountError } = await db.from("ai_accounts").insert({
    provider_slug: d.provider,
    name: d.label,
    environment: "production",
    credential_type: "ai_key",
    credential_id: key.id,
    status: "active",
    allowed_agents: roles.filter((role) => role !== "general"),
    quota: { daily_calls: limit },
    rate_limits: {},
    cost_policy: {},
  });
  if (accountError) {
    await db.from("ai_keys").delete().eq("id", key.id);
    return back("La clé a été refusée par le registre des comptes IA; rien n'a été conservé.", "erreur");
  }
  return back("Clé ajoutée, chiffrée et enregistrée comme compte IA. Testez-la avant activation.");
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
  const { user } = await requireAdmin();
  const cap = z.coerce.number().int().min(1).max(100000).safeParse(form.get("daily_call_cap")); if (!cap.success) return back("Plafond invalide.", "erreur");
  const db = supabaseAdmin();
  const enabled = form.get("enabled") === "on";
  const now = new Date().toISOString();
  const { error } = await db.from("ai_settings").update({ enabled, daily_call_cap: cap.data, updated_at: now }).eq("id", 1);
  if (error) return back("Réglages IA non enregistrés.", "erreur");
  const { data: state } = await db.from("ai_control_state").select("mode").eq("id", 1).maybeSingle();
  if (!enabled || state?.mode === "NO_AI") {
    await db.from("ai_control_state").update({ mode: enabled ? "FULL" : "NO_AI", updated_at: now }).eq("id", 1);
  }
  await db.from("ai_audit_logs").insert({ actor_type: "user", actor_id: user.id, user_id: user.id, service: "ai-control-plane", action: "save_ai_settings", resource_type: "ai_settings", resource_id: "1", policy_decision: "ALLOW", metadata: { enabled, daily_call_cap: cap.data } });
  return back("Réglages enregistrés.");
}

export async function saveAgent(form: FormData) {
  const { user } = await requireAdmin();
  const p = z.object({ slug: z.string().trim().min(2).max(80), autonomy: z.enum(["draft", "auto"]), system_prompt: z.string().trim().min(20).max(8000) }).safeParse(Object.fromEntries(form));
  if (!p.success) return back("Consigne trop courte ou réglage invalide.", "erreur");
  const allowAuto = p.data.slug === "support" || p.data.slug === "customer_support";
  const autonomy = allowAuto ? p.data.autonomy : "draft";
  const db = supabaseAdmin();
  const { data: latestVersion } = await db.from("ai_agent_versions").select("version").eq("agent_slug", p.data.slug).eq("environment", "production").order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = Number(latestVersion?.version ?? 0) + 1;
  const objective = z.string().trim().max(500).catch("").parse(form.get("objective"));
  const autonomyLevel = z.coerce.number().int().min(0).max(4).catch(1).parse(form.get("autonomy_level"));
  const changelog = z.string().trim().max(1000).catch("").parse(form.get("changelog"));
  const checksum = createHash("sha256").update(p.data.system_prompt, "utf8").digest("hex");

  const { error: versionError } = await db.from("ai_agent_versions").insert({
    agent_slug: p.data.slug,
    version: nextVersion,
    objective,
    system_prompt: p.data.system_prompt,
    environment: "production",
    checksum,
    changelog: changelog || "Mise à jour de gouvernance par administrateur.",
    active: true,
    created_by: user.id,
  });
  if (versionError) return back("Nouvelle version de prompt non enregistrée.", "erreur");

  await db.from("ai_agent_versions").update({ active: false }).eq("agent_slug", p.data.slug).eq("environment", "production").neq("version", nextVersion);

  const { error } = await db.from("ai_agents").update({
    enabled: form.get("enabled") === "on",
    autonomy,
    system_prompt: p.data.system_prompt,
    version: nextVersion,
    autonomy_level: autonomyLevel,
    objective,
    updated_at: new Date().toISOString()
  }).eq("slug", p.data.slug);
  if (error) return back("Agent non enregistré après versionnement; la nouvelle version reste conservée pour audit.", "erreur");

  await db.from("ai_audit_logs").insert({
    actor_type: "user",
    actor_id: user.id,
    user_id: user.id,
    service: "ai-control-plane",
    action: "version_agent_prompt",
    resource_type: "ai_agent",
    resource_id: p.data.slug,
    policy_decision: "ALLOW",
    metadata: { version: nextVersion, checksum, autonomy, autonomyLevel },
  });
  return back(`Agent enregistré, version ${nextVersion} activée.`);
}

export async function askResearch(form: FormData) {
  await requireAdmin();
  const q = z.string().trim().min(10).max(1500).safeParse(form.get("request"));
  if (!q.success) return back("Décrivez votre demande (10 caractères minimum).", "erreur");
  if (!(await allow("ai-ask", 15, 600))) return back("Trop de demandes. Patientez.", "erreur");
  const r = await research(q.data, submissionId(form));
  return back(r.note, r.ok ? "ok" : "erreur");
}
export async function askProduct(form: FormData) {
  await requireAdmin();
  const q = z.string().trim().min(10).max(1500).safeParse(form.get("request"));
  if (!q.success) return back("Décrivez le produit (10 caractères minimum).", "erreur");
  if (!(await allow("ai-ask", 15, 600))) return back("Trop de demandes. Patientez.", "erreur");
  const r = await proposeProduct(q.data, submissionId(form));
  return back(r.note, r.ok ? "ok" : "erreur");
}

/** Décision de l'administrateur sur une tâche en attente : c'est ici, et seulement ici, qu'un e-mail part ou qu'un produit est créé. */
export async function decideTask(form: FormData) {
  const { user } = await requireAdmin(); const db = supabaseAdmin(); const tid = id(form); const op = z.enum(["approve", "reject"]).parse(form.get("op"));
  const { data: t } = await db.from("ai_tasks").select("*").eq("id", tid).maybeSingle(); if (!t) return back("Tâche introuvable ou déjà traitée.", "erreur");
  const stamp = { decided_at: new Date().toISOString(), decided_by: user.id };
  const payload = (t.payload && typeof t.payload === "object" ? t.payload : {}) as Record<string, unknown>;
  const importId = typeof payload.import_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.import_id) ? payload.import_id : null;
  const resumable = t.status === "approved" && op === "approve" && t.kind === "product_proposal" && importId !== null;
  if (t.status !== "pending" && !resumable) return back("Tâche introuvable, déjà traitée ou non récupérable.", "erreur");
  if (op === "reject") {
    if (importId) await db.from("dropship_imports").update({ status: "rejected", decided_at: stamp.decided_at, decided_by: user.id, updated_at: stamp.decided_at }).eq("id", importId).eq("status", "needs_review");
    await db.from("ai_tasks").update({ status: "rejected", ...stamp }).eq("id", tid).eq("status", "pending");
    return back("Proposition refusée.");
  }
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
    if (importId) {
      const { data: source } = await db.from("dropship_imports").select("id,status,rights_confirmed,images,extracted,product_id").eq("id", importId).maybeSingle();
      if (!source || !source.rights_confirmed) return back("Import absent ou droits non confirmés; aucun produit n'a été créé.", "erreur");
      if (source.product_id) {
        if (source.status !== "approved" && source.status !== "needs_review") return back("L'import lié a changé d'état; vérifiez-le avant toute reprise.", "erreur");
        if (source.status === "needs_review") {
          const { error: reconcileError } = await db.from("dropship_imports").update({ status: "approved", decided_at: stamp.decided_at, decided_by: user.id, updated_at: stamp.decided_at }).eq("id", importId);
          if (reconcileError) return back("Le brouillon existe, mais le lien de reprise n'a pas pu être réparé.", "erreur");
        }
        const existingExtracted = (source.extracted && typeof source.extracted === "object" ? source.extracted : {}) as Record<string, unknown>;
        const existingVariants = (Array.isArray(existingExtracted.variants) ? existingExtracted.variants : []).filter((variant): variant is { sku?: string; label?: string; options?: Record<string, string> } => Boolean(variant && typeof variant === "object"));
        const existingConnectionId = typeof (payload.supplier_connection_id ?? existingExtracted.supplier_connection_id) === "string"
          ? String(payload.supplier_connection_id ?? existingExtracted.supplier_connection_id)
          : null;
        const existingMappingResult = await createSupplierMappingsForDraft(db, String(source.product_id), existingConnectionId && /^[0-9a-f-]{36}$/i.test(existingConnectionId) ? existingConnectionId : null, existingVariants, typeof existingExtracted.sku === "string" ? existingExtracted.sku : undefined);
        if (existingMappingResult.error) return back("Le brouillon existe mais son routage fournisseur n'est pas complet : " + existingMappingResult.error, "erreur");
        await db.from("ai_tasks").update({ status: "done", ...stamp, result: { product_id: source.product_id, import_id: importId } }).eq("id", tid).in("status", ["pending", "approved"]);
        return back("Le brouillon existant a été relié et la tâche finalisée; aucune copie n'a été créée.");
      }
      if (source.status !== "needs_review") return back("L'import n'est plus en attente de vérification; aucun produit n'a été créé.", "erreur");

      const priorResult = (t.result && typeof t.result === "object" ? t.result : {}) as Record<string, unknown>;
      const reservedId = typeof priorResult.product_id === "string" && /^[0-9a-f-]{36}$/i.test(priorResult.product_id) ? priorResult.product_id : null;
      const pid = t.status === "approved" ? reservedId : randomUUID();
      if (!pid) return back("La tâche réservée ne contient pas d'identifiant reprenable; intervention requise.", "erreur");
      if (t.status === "pending") {
        const { data: claimed, error: claimError } = await db.from("ai_tasks").update({ status: "approved", ...stamp, result: { product_id: pid, import_id: importId } }).eq("id", tid).eq("status", "pending").select("id").maybeSingle();
        if (claimError || !claimed) return back("Cette proposition a déjà été prise en charge.", "erreur");
      }

      const sourceImages = (Array.isArray(source.images) ? source.images : []) as { url?: string; alt?: string; credit?: string; kind?: string }[];
      const premium = sourceImages.find((image) => image.kind === "premium" && image.url && isAllowedImageUrl(image.url));
      const extracted = (source.extracted && typeof source.extracted === "object" ? source.extracted : {}) as Record<string, unknown>;
      const supplierConnectionId = typeof (payload.supplier_connection_id ?? extracted.supplier_connection_id) === "string"
        ? String(payload.supplier_connection_id ?? extracted.supplier_connection_id)
        : null;
      const variants = (Array.isArray(extracted.variants) ? extracted.variants : []).filter((variant): variant is { label?: string; sku?: string; options?: Record<string, string>; supplier_price?: number | null; availability?: string } => Boolean(variant && typeof variant === "object")) .slice(0, 40).map((variant) => ({
        label: typeof variant.label === "string" ? variant.label : "Variante",
        sku: typeof variant.sku === "string" ? variant.sku : "",
        options: variant.options && typeof variant.options === "object" ? variant.options : {},
        supplier_price: typeof variant.supplier_price === "number" ? variant.supplier_price : null,
        availability: typeof variant.availability === "string" ? variant.availability : "",
      }));
      const createdId = await createDraftProduct({ ...p.value, kind: "physical", price_eur: 0 }, { supplier: true, productId: pid, variants, images: premium ? [{ url: premium.url!, alt: premium.alt || `Photo du produit ${p.value.title}`, credit: premium.credit }] : [] });
      if (!createdId) return back("Produit non créé; l'identifiant réservé est conservé pour reprendre sans doublon.", "erreur");
      const mappingResult = await createSupplierMappingsForDraft(
        db,
        createdId,
        supplierConnectionId && /^[0-9a-f-]{36}$/i.test(supplierConnectionId) ? supplierConnectionId : null,
        variants.map((variant) => ({ sku: variant.sku, label: variant.label, options: variant.options })),
        typeof extracted.sku === "string" ? extracted.sku : undefined,
      );
      if (mappingResult.error) return back("Le brouillon a été créé mais le routage fournisseur n'est pas complet : " + mappingResult.error, "erreur");
      const { data: linked, error: linkError } = await db.from("dropship_imports").update({ status: "approved", product_id: createdId, decided_at: stamp.decided_at, decided_by: user.id, updated_at: stamp.decided_at, error: null }).eq("id", importId).eq("status", "needs_review").select("id").maybeSingle();
      if (linkError || !linked) return back("Le brouillon est conservé avec un identifiant réservé; relancez l'approbation pour terminer le lien.", "erreur");
      await db.from("ai_tasks").update({ status: "done", ...stamp, result: { product_id: createdId, import_id: importId } }).eq("id", tid).eq("status", "approved");
      revalidatePath("/admin/dropshipping"); revalidatePath("/admin/produits"); revalidatePath("/boutique"); revalidatePath("/");
      return back("Produit physique créé en brouillon; mapping " + (mappingResult.created ? "créé" : "aucun fournisseur sélectionné") + " et marge cible 30 %. Lancez une synchronisation pour calculer le prix client.");
    }
    const pid = await createDraftProduct(p.value); if (!pid) return back("Produit non créé.", "erreur");
    await db.from("ai_tasks").update({ status: "done", ...stamp, result: { product_id: pid } }).eq("id", tid);
    return back("Produit créé en brouillon. Complétez-le puis publiez-le depuis « Produits ».");
  }
  return back("Type de tâche non géré.", "erreur");
}
