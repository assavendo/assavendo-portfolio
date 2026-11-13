"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/ai/crypto";
import { callChat } from "@/lib/ai/router";
import { manusHealthCheck } from "@/lib/ai/manus";
import { scrub, type KeyRow } from "@/lib/ai/policy";

const redirectBack = (message: string, kind: "ok" | "erreur" = "ok"): never => {
  revalidatePath("/admin/ia");
  throw new Error(`${kind}:${message}`);
};

async function audit(input: {
  action: string;
  actorId: string;
  actorType?: "user" | "agent" | "system" | "workflow" | "provider";
  resourceType?: string;
  resourceId?: string;
  policyDecision?: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_STEP_UP_AUTH" | "RATE_LIMIT" | "SAFE_MODE_ONLY";
  result?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = supabaseAdmin();
  await db.from("ai_audit_logs").insert({
    actor_type: input.actorType ?? "user",
    actor_id: input.actorId,
    user_id: input.actorId,
    service: "ai-control-plane",
    action: input.action,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    policy_decision: input.policyDecision ?? "ALLOW",
    result: input.result ?? null,
    error: input.error ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function setAiMode(form: FormData) {
  const { user } = await requireAdmin();
  const mode = z.enum(["FULL", "DEGRADED", "SAFE", "NO_AI", "MAINTENANCE"]).parse(form.get("mode"));
  const reason = z.string().trim().max(1000).parse(form.get("reason") ?? "");
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await db.from("ai_control_state").update({ mode, reason, updated_by: user.id, updated_at: now }).eq("id", 1);
  if (error) return redirectBack("Impossible de changer le mode IA.", "erreur");
  if (mode === "NO_AI") {
    const { error: settingError } = await db.from("ai_settings").update({ enabled: false, updated_at: now }).eq("id", 1);
    if (settingError) return redirectBack("Mode NO_AI appliqué, mais l'interrupteur général n'a pas pu être synchronisé.", "erreur");
  } else if (mode === "FULL") {
    const { error: settingError } = await db.from("ai_settings").update({ enabled: true, updated_at: now }).eq("id", 1);
    if (settingError) return redirectBack("Mode FULL appliqué, mais l'interrupteur général n'a pas pu être synchronisé.", "erreur");
  }
  await audit({ action: "change_ai_mode", actorId: user.id, resourceType: "ai_control_state", resourceId: "1", metadata: { mode, reason } });
  redirectBack(`Mode IA : ${mode}.`);
}

export async function toggleAiProvider(form: FormData) {
  const { user } = await requireAdmin();
  const slug = z.string().trim().min(1).max(80).parse(form.get("slug"));
  const enabled = z.enum(["true", "false"]).parse(form.get("enabled")) === "true";
  const db = supabaseAdmin();
  const status = enabled ? "healthy" : "disabled";
  const { error } = await db.from("ai_providers").update({ enabled, status, updated_at: new Date().toISOString() }).eq("slug", slug);
  if (error) return redirectBack("Provider introuvable ou non modifiable.", "erreur");
  await audit({ action: enabled ? "enable_provider" : "disable_provider", actorId: user.id, resourceType: "ai_provider", resourceId: slug, policyDecision: enabled ? "ALLOW" : "REQUIRE_STEP_UP_AUTH" });
  redirectBack(enabled ? `Provider ${slug} activé.` : `Provider ${slug} désactivé.`);
}

export async function toggleAiAccount(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const enabled = z.enum(["true", "false"]).parse(form.get("enabled")) === "true";
  const db = supabaseAdmin();
  const { error } = await db.from("ai_accounts").update({ status: enabled ? "active" : "disabled", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return redirectBack("Compte IA introuvable ou non modifiable.", "erreur");
  await audit({ action: enabled ? "enable_account" : "disable_account", actorId: user.id, resourceType: "ai_account", resourceId: id, policyDecision: enabled ? "ALLOW" : "REQUIRE_STEP_UP_AUTH" });
  redirectBack(enabled ? "Compte IA activé." : "Compte IA désactivé.");
}

export async function testAiAccount(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const db = supabaseAdmin();
  const { data: account } = await db.from("ai_accounts").select("id,provider_slug,credential_type,credential_id").eq("id", id).maybeSingle();
  if (!account) return redirectBack("Compte IA introuvable.", "erreur");
  if (!account.credential_id) return redirectBack("Ce compte n'a pas de credential référencé.", "erreur");

  let ok = false;
  let detail = "";
  if (account.credential_type === "ai_key") {
    const { data: key } = await db.from("ai_keys").select("*").eq("id", account.credential_id).maybeSingle();
    if (!key) return redirectBack("Credential IA introuvable.", "erreur");
    try {
      const secret = decryptSecret((key as KeyRow).secret_enc);
      const result = await callChat(key as KeyRow, secret, [{ role: "user", content: "Réponds uniquement : OK" }], { maxTokens: 5, timeoutMs: 15000 });
      ok = result.status === 200;
      detail = scrub(result.detail ?? (ok ? "OK" : `HTTP ${result.status ?? 0}`)).slice(0, 240);
      await db.from("ai_accounts").update({ status: ok ? "active" : "unavailable", last_success: ok ? new Date().toISOString() : null, last_failure: ok ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    } catch {
      detail = "Credential illisible ou clé maîtresse invalide.";
      await db.from("ai_accounts").update({ status: "unavailable", last_failure: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    }
  } else if (account.credential_type === "manus_key") {
    const { data: key } = await db.from("manus_keys").select("secret_enc").eq("id", account.credential_id).maybeSingle();
    if (!key) return redirectBack("Credential Manus introuvable.", "erreur");
    try {
      const secret = decryptSecret(String(key.secret_enc));
      const result = await manusHealthCheck(secret);
      ok = result.ok;
      detail = result.error ?? (ok ? "Connexion Manus OK" : "Connexion Manus refusée");
      await db.from("ai_accounts").update({ status: ok ? "active" : "unavailable", last_success: ok ? new Date().toISOString() : null, last_failure: ok ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    } catch {
      detail = "Credential Manus illisible ou clé maîtresse invalide.";
      await db.from("ai_accounts").update({ status: "unavailable", last_failure: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    }
  } else {
    detail = "Type de credential non testable automatiquement.";
  }

  await audit({
    action: "test_account",
    actorId: user.id,
    resourceType: "ai_account",
    resourceId: id,
    result: ok ? "success" : "failure",
    error: ok ? undefined : detail,
    metadata: { provider: account.provider_slug },
  });
  redirectBack(ok ? `Compte testé : ${detail}` : `Test échoué : ${detail}`, ok ? "ok" : "erreur");
}

export async function saveAiModel(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const status = z.enum(["candidate", "approved", "disabled", "deprecated"]).parse(form.get("status"));
  const benchmark = form.get("benchmark_score") ? z.coerce.number().min(0).max(100).parse(form.get("benchmark_score")) : null;
  const db = supabaseAdmin();
  const { error } = await db.from("ai_models").update({ status, benchmark_score: benchmark, validated_at: status === "approved" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return redirectBack("Modèle non modifié.", "erreur");
  await audit({ action: "update_model_status", actorId: user.id, resourceType: "ai_model", resourceId: id, metadata: { status, benchmark_score: benchmark } });
  redirectBack("Modèle IA enregistré.");
}

export async function toggleAiTool(form: FormData) {
  const { user } = await requireAdmin();
  const slug = z.string().trim().min(1).max(100).parse(form.get("slug"));
  const enabled = z.enum(["true", "false"]).parse(form.get("enabled")) === "true";
  const db = supabaseAdmin();
  const { error } = await db.from("ai_tools").update({ enabled, updated_at: new Date().toISOString() }).eq("slug", slug);
  if (error) return redirectBack("Outil IA non modifié.", "erreur");
  await audit({ action: enabled ? "enable_tool" : "disable_tool", actorId: user.id, resourceType: "ai_tool", resourceId: slug });
  redirectBack(enabled ? `Outil ${slug} activé.` : `Outil ${slug} désactivé.`);
}

export async function decideAiApproval(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const decision = z.enum(["approved", "rejected", "canceled"]).parse(form.get("decision"));
  const reason = z.string().trim().max(1000).parse(form.get("reason") ?? "");
  const db = supabaseAdmin();
  const { data: approval } = await db.from("ai_approvals").select("id,status,task_id,agent_slug,risk_level").eq("id", id).maybeSingle();
  if (!approval || approval.status !== "pending") return redirectBack("Approbation introuvable ou déjà décidée.", "erreur");
  if (decision === "approved" && approval.risk_level === "critical" && !reason) return redirectBack("Une justification est obligatoire pour une approbation critique.", "erreur");
  const now = new Date().toISOString();
  const { error } = await db.from("ai_approvals").update({ status: decision, decided_by: user.id, decided_at: now, decision_reason: reason }).eq("id", id).eq("status", "pending");
  if (error) return redirectBack("La décision n'a pas pu être enregistrée.", "erreur");
  if (approval.task_id) {
    await db.from("ai_tasks").update({ status: decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "canceled", decided_by: user.id, decided_at: now }).eq("id", approval.task_id);
  }
  await audit({ action: "approval_" + decision, actorId: user.id, resourceType: "ai_approval", resourceId: id, policyDecision: approval.risk_level === "critical" ? "REQUIRE_APPROVAL" : "ALLOW", metadata: { task_id: approval.task_id, agent: approval.agent_slug, reason } });
  redirectBack(`Approbation ${decision === "approved" ? "acceptée" : decision === "rejected" ? "refusée" : "annulée"}.`);
}

export async function resolveAiIncident(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const status = z.enum(["acknowledged", "resolved"]).parse(form.get("status"));
  const db = supabaseAdmin();
  const { error } = await db.from("ai_incidents").update({ status, ...(status === "resolved" ? { resolved_at: new Date().toISOString(), resolved_by: user.id } : {}) }).eq("id", id).in("status", ["open", "acknowledged"]);
  if (error) return redirectBack("Incident non modifié.", "erreur");
  await audit({ action: "incident_" + status, actorId: user.id, resourceType: "ai_incident", resourceId: id });
  redirectBack(`Incident ${status === "resolved" ? "résolu" : "pris en compte"}.`);
}

export async function saveAiBudget(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().optional().parse(form.get("id"));
  const scopeType = z.enum(["global", "provider", "account", "agent", "workflow", "task", "team"]).parse(form.get("scope_type"));
  const scopeId = z.string().trim().min(1).max(120).parse(form.get("scope_id"));
  const daily = z.coerce.number().min(0).max(1_000_000).parse(form.get("daily_limit_usd"));
  const weekly = z.coerce.number().min(0).max(1_000_000).parse(form.get("weekly_limit_usd"));
  const monthly = z.coerce.number().min(0).max(1_000_000).parse(form.get("monthly_limit_usd"));
  const perTask = z.coerce.number().min(0).max(100_000).parse(form.get("per_task_limit_usd"));
  const db = supabaseAdmin();
  const payload = { scope_type: scopeType, scope_id: scopeId, daily_limit_usd: daily, weekly_limit_usd: weekly, monthly_limit_usd: monthly, per_task_limit_usd: perTask, updated_at: new Date().toISOString(), ...(id ? { id } : {}) };
  const { error } = id
    ? await db.from("ai_budgets").update(payload).eq("id", id)
    : await db.from("ai_budgets").upsert(payload, { onConflict: "scope_type,scope_id" });
  if (error) return redirectBack("Budget non enregistré.", "erreur");
  await audit({ action: "save_budget", actorId: user.id, resourceType: "ai_budget", resourceId: id ?? scopeType + ":" + scopeId, metadata: payload });
  redirectBack("Budget IA enregistré.");
}

export async function setAgentTool(form: FormData) {
  const { user } = await requireAdmin();
  const agentSlug = z.string().trim().min(1).max(100).parse(form.get("agent_slug"));
  const toolSlug = z.string().trim().min(1).max(100).parse(form.get("tool_slug"));
  const allowed = z.enum(["true", "false"]).parse(form.get("allowed")) === "true";
  const db = supabaseAdmin();
  const { error } = await db.from("ai_agent_tools").upsert({ agent_slug: agentSlug, tool_slug: toolSlug, allowed }, { onConflict: "agent_slug,tool_slug" });
  if (error) return redirectBack("Permission outil non modifiée.", "erreur");
  await audit({ action: allowed ? "allow_agent_tool" : "deny_agent_tool", actorId: user.id, resourceType: "ai_agent_tool", resourceId: agentSlug + ":" + toolSlug });
  redirectBack("Permission outil enregistrée.");
}
