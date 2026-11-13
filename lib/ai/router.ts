import { supabaseAdmin } from "@/lib/supabase/server";
import { resolvePublicHost } from "@/lib/safe-fetch";
import { decryptSecret } from "./crypto";
import { candidates, classifyFailure, scrub, specificFirst, type KeyRow } from "./policy";
import { prepareAiMessages } from "./data-gateway";

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type RunResult =
  | { ok: true; text: string; keyLabel: string; attempts: number; provider: string; model: string; accountId?: string | null; estimatedCostUsd?: number | null }
  | { ok: false; error: string; attempts: number };

export type CallResult = {
  status: number | null;
  text?: string;
  detail?: string;
  retryAfter?: number | null;
  requestId?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export async function callChat(
  key: Pick<KeyRow, "provider" | "base_url" | "model">,
  apiKey: string,
  messages: Msg[],
  opts: { maxTokens?: number; json?: boolean; timeoutMs?: number } = {},
): Promise<CallResult> {
  const url = new URL(key.base_url.replace(/\/$/, "") + "/chat/completions");
  if (url.protocol !== "https:") return { status: null, detail: "Adresse non sécurisée refusée" };
  if (key.provider === "custom") {
    try { await resolvePublicHost(url.hostname); } catch { return { status: null, detail: "Adresse interne refusée" }; }
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: key.model,
        messages,
        max_tokens: opts.maxTokens ?? 800,
        temperature: 0.3,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const retryAfter = Number(res.headers.get("retry-after")) || null;
    const requestId = res.headers.get("x-request-id") || res.headers.get("request-id");
    const raw = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { /* provider output is untrusted */ }
    if (!res.ok) {
      const errorObj = parsed.error;
      const detail = errorObj && typeof errorObj === "object"
        ? String((errorObj as Record<string, unknown>).message ?? (errorObj as Record<string, unknown>).code ?? "Provider error")
        : "Provider request failed";
      return { status: res.status, retryAfter, requestId, detail: scrub(detail).slice(0, 240) };
    }
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const first = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
    const message = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
    const text = String(message.content ?? "").trim();
    const usage = parsed.usage && typeof parsed.usage === "object" ? parsed.usage as Record<string, unknown> : {};
    return text
      ? {
          status: 200,
          text,
          requestId,
          usage: {
            prompt_tokens: Number(usage.prompt_tokens) || undefined,
            completion_tokens: Number(usage.completion_tokens) || undefined,
            total_tokens: Number(usage.total_tokens) || undefined,
          },
        }
      : { status: 502, requestId, detail: "Réponse vide" };
  } catch (e) {
    return { status: null, detail: e instanceof Error ? e.name : "Erreur réseau" };
  }
}

function modeAllowsAgent(mode: string, agent: string): boolean {
  if (mode === "FULL" || mode === "DEGRADED") return true;
  if (mode === "SAFE") return ["support", "recherche", "catalogue"].includes(agent);
  return false;
}

type ModelRow = {
  id: string;
  input_usd_per_1m: number | null;
  output_usd_per_1m: number | null;
};

function projectedCost(messages: Msg[], maxTokens: number, model: ModelRow | null): number | null {
  if (!model) return null;
  const estimatedInputTokens = Math.max(1, Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4));
  const input = (estimatedInputTokens / 1_000_000) * Number(model.input_usd_per_1m ?? 0);
  const output = (Math.max(1, maxTokens) / 1_000_000) * Number(model.output_usd_per_1m ?? 0);
  return Number((input + output).toFixed(8));
}

async function estimateCostUsd(
  db: ReturnType<typeof supabaseAdmin>,
  provider: string,
  model: string,
  usage?: CallResult["usage"],
): Promise<number | null> {
  const input = Number(usage?.prompt_tokens) || 0;
  const output = Number(usage?.completion_tokens) || 0;
  if (!input && !output) return null;
  const { data } = await db.from("ai_models").select("input_usd_per_1m, output_usd_per_1m").eq("provider_slug", provider).eq("model_key", model).maybeSingle();
  if (!data) return null;
  return Number(((input / 1_000_000) * Number(data.input_usd_per_1m ?? 0) + (output / 1_000_000) * Number(data.output_usd_per_1m ?? 0)).toFixed(8));
}

async function budgetAllows(
  db: ReturnType<typeof supabaseAdmin>,
  todayStart: string,
  agent: string,
  provider: string,
  accountId: string | null,
  projectedUsd: number | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (projectedUsd == null) return { ok: true };
  const scopes = [
    { type: "global", id: "assavendo" },
    { type: "provider", id: provider },
    ...(accountId ? [{ type: "account", id: accountId }] : []),
    { type: "agent", id: agent },
  ];
  const { data: budgets } = await db.from("ai_budgets").select("scope_type,scope_id,daily_limit_usd,warning_percent,restrict_percent,block_percent,enabled").in("scope_type", scopes.map((s) => s.type));
  const relevant = (budgets ?? []).filter((b) => b.enabled && scopes.some((s) => s.type === b.scope_type && s.id === b.scope_id));
  if (!relevant.length) return { ok: true };

  const { data: runs } = await db.from("ai_runs").select("agent,provider_slug,account_id,estimated_cost_usd").gte("created_at", todayStart).not("estimated_cost_usd", "is", null).limit(5000);
  for (const budget of relevant) {
    const matches = (runs ?? []).filter((r) =>
      budget.scope_type === "global"
      || (budget.scope_type === "provider" && r.provider_slug === budget.scope_id)
      || (budget.scope_type === "account" && r.account_id === budget.scope_id)
      || (budget.scope_type === "agent" && r.agent === budget.scope_id)
    );
    const spent = matches.reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0);
    const limit = budget.daily_limit_usd == null ? null : Number(budget.daily_limit_usd);
    if (limit != null && spent + projectedUsd > limit) {
      return { ok: false, reason: `Budget ${budget.scope_type}:${budget.scope_id} atteint.` };
    }
    if (limit && spent / limit >= Number(budget.restrict_percent ?? 85) / 100) {
      return { ok: false, reason: `Budget ${budget.scope_type}:${budget.scope_id} en zone de restriction.` };
    }
  }
  return { ok: true };
}

export async function runAgent(
  agent: "support" | "recherche" | "catalogue",
  messages: Msg[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<RunResult> {
  const db = supabaseAdmin();
  const [{ data: settings }, { data: control }] = await Promise.all([
    db.from("ai_settings").select("enabled, daily_call_cap").eq("id", 1).single(),
    db.from("ai_control_state").select("mode").eq("id", 1).single(),
  ]);
  const mode = String(control?.mode ?? (settings?.enabled ? "FULL" : "NO_AI"));
  if (!settings?.enabled || !modeAllowsAgent(mode, agent)) return { ok: false, error: `Les IA sont indisponibles en mode ${mode}.`, attempts: 0 };

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from("ai_runs").select("*", { count: "exact", head: true }).gte("created_at", since.toISOString());
  if ((count ?? 0) >= Number(settings.daily_call_cap ?? 500)) return { ok: false, error: "Plafond d'appels du jour atteint.", attempts: 0 };

  const [{ data: rows }, { data: accounts }, { data: providers }] = await Promise.all([
    db.from("ai_keys").select("*").eq("enabled", true),
    db.from("ai_accounts").select("id,provider_slug,credential_type,credential_id,status,allowed_agents").eq("credential_type", "ai_key"),
    db.from("ai_providers").select("slug,enabled,status"),
  ]);
  const accountByCredential = new Map((accounts ?? []).filter((a) => a.credential_id).map((a) => [String(a.credential_id), a]));
  const providerBySlug = new Map((providers ?? []).map((p) => [String(p.slug), p]));
  const filteredKeys = ((rows ?? []) as KeyRow[]).filter((key) => {
    const provider = providerBySlug.get(key.provider);
    if (provider && (!provider.enabled || ["disabled", "maintenance", "unavailable"].includes(String(provider.status)))) return false;
    const account = accountByCredential.get(key.id);
    if (!account) return true;
    if (account.status !== "active") return false;
    return account.allowed_agents.length === 0 || account.allowed_agents.includes(agent);
  });
  const list = specificFirst(candidates(filteredKeys, agent), agent).slice(0, 6);
  if (!list.length) {
    await log(db, agent, null, null, false, 0, null, "Aucune ressource disponible", null, null, null, null, null, "DENY", false, mode, null);
    return { ok: false, error: "Aucune ressource IA disponible pour ce rôle.", attempts: 0 };
  }

  let attempts = 0;
  let last = "";
  const safeMessages = prepareAiMessages(messages);
  const maxTokens = opts.maxTokens ?? 800;

  for (const k of list) {
    attempts++;
    const t0 = Date.now();
    const account = accountByCredential.get(k.id);
    const { data: model } = await db.from("ai_models").select("id,input_usd_per_1m,output_usd_per_1m").eq("provider_slug", k.provider).eq("model_key", k.model).maybeSingle();
    const projected = projectedCost(safeMessages, maxTokens, model);
    const budget = await budgetAllows(db, since.toISOString(), agent, k.provider, account?.id ? String(account.id) : null, projected);
    if (!budget.ok) {
      last = budget.reason ?? "Budget atteint";
      await log(db, agent, k.id, k.label, false, attempts, 0, last, k.provider, k.model, account?.id ? String(account.id) : null, null, null, "RATE_LIMIT", attempts > 1, mode, model?.id ?? null);
      continue;
    }

    let apiKey: string;
    try {
      apiKey = decryptSecret(k.secret_enc);
    } catch {
      last = "Clé illisible (clé maîtresse modifiée ?)";
      await mark(db, k, { disable: true, error: last }, account?.id ? String(account.id) : null);
      continue;
    }

    const r = await callChat(k, apiKey, safeMessages, opts);
    if (r.status === 200 && r.text) {
      const cost = await estimateCostUsd(db, k.provider, k.model, r.usage);
      await mark(db, k, { ok: true }, account?.id ? String(account.id) : null);
      await log(db, agent, k.id, k.label, true, attempts, Date.now() - t0, null, k.provider, k.model, account?.id ? String(account.id) : null, r, cost, "ALLOW", attempts > 1, mode, model?.id ?? null);
      return { ok: true, text: r.text, keyLabel: k.label, attempts, provider: k.provider, model: k.model, accountId: account?.id ? String(account.id) : null, estimatedCostUsd: cost };
    }

    const failure = classifyFailure(r.status, r.retryAfter, scrub(r.detail ?? ""));
    last = scrub(`${k.label} : ${failure.message}`);
    await mark(db, k, { disable: failure.disable, cooldownSec: failure.cooldownSec, error: last }, account?.id ? String(account.id) : null);
    await log(db, agent, k.id, k.label, false, attempts, Date.now() - t0, last, k.provider, k.model, account?.id ? String(account.id) : null, r, null, "ALLOW", attempts > 1, mode, model?.id ?? null);
    if (!failure.retryNext) return { ok: false, error: last, attempts };
  }

  return { ok: false, error: `Toutes les ressources ont échoué. Dernière erreur : ${last}`, attempts };
}

type Db = ReturnType<typeof supabaseAdmin>;

async function mark(db: Db, k: KeyRow, o: { ok?: boolean; disable?: boolean; cooldownSec?: number; error?: string }, accountId: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  const used = (k.used_day === today ? k.used_today : 0) + 1;
  const now = new Date().toISOString();
  if (o.ok) {
    await db.from("ai_keys").update({ used_day: today, used_today: used, fail_count: 0, last_error: null, last_ok_at: now, cooldown_until: null }).eq("id", k.id);
    await db.from("ai_providers").update({ status: "healthy", health_score: 100, last_health_at: now, last_error: null, updated_at: now }).eq("slug", k.provider);
    if (accountId) await db.from("ai_accounts").update({ status: "active", last_success: now, updated_at: now }).eq("id", accountId);
    return;
  }
  await db.from("ai_keys").update({
    used_day: today, used_today: used, fail_count: k.fail_count + 1, last_error: o.error ?? null,
    ...(o.disable ? { enabled: false } : {}), ...(o.cooldownSec ? { cooldown_until: new Date(Date.now() + o.cooldownSec * 1000).toISOString() } : {}),
  }).eq("id", k.id);
  if (accountId) await db.from("ai_accounts").update({
    status: o.disable ? "disabled" : o.cooldownSec ? "rate_limited" : "unavailable",
    last_failure: now, ...(o.cooldownSec ? { last_429: now } : {}), updated_at: now,
  }).eq("id", accountId);
}

async function log(
  db: Db, agent: string, keyId: string | null, label: string | null, ok: boolean, attempts: number, ms: number | null,
  error: string | null, provider: string | null, model: string | null, accountId: string | null, response: CallResult | null,
  estimatedCostUsd: number | null, policyDecision: string, fallbackUsed: boolean, mode: string, modelId: string | null,
) {
  await db.from("ai_runs").insert({
    agent, key_id: keyId, key_label: label, ok, attempts, latency_ms: ms, error, provider_slug: provider, model_id: modelId,
    account_id: accountId, input_tokens: response?.usage?.prompt_tokens ?? null, output_tokens: response?.usage?.completion_tokens ?? null,
    estimated_cost_usd: estimatedCostUsd, policy_decision: policyDecision, fallback_used: fallbackUsed, request_id: response?.requestId ?? null, mode,
  });
}
