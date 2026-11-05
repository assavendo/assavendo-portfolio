import { supabaseAdmin } from "@/lib/supabase/server";
import { resolvePublicHost } from "@/lib/safe-fetch";
import { decryptSecret } from "./crypto";
import { candidates, classifyFailure, scrub, specificFirst, type KeyRow } from "./policy";

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type RunResult = { ok: true; text: string; keyLabel: string; attempts: number } | { ok: false; error: string; attempts: number };

/** Un appel « chat completions » (format OpenAI, utilisé par OpenRouter, Groq, DeepSeek, OpenAI et les services compatibles). */
export type CallResult = { status: number | null; text?: string; detail?: string; retryAfter?: number | null };
export async function callChat(key: Pick<KeyRow, "provider" | "base_url" | "model">, apiKey: string, messages: Msg[], opts: { maxTokens?: number; json?: boolean; timeoutMs?: number } = {}): Promise<CallResult> {
  const url = new URL(key.base_url.replace(/\/$/, "") + "/chat/completions");
  if (url.protocol !== "https:") return { status: null, detail: "Adresse non sécurisée refusée" };
  if (key.provider === "custom") { try { await resolvePublicHost(url.hostname); } catch { return { status: null, detail: "Adresse interne refusée" }; } }
  try {
    const res = await fetch(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: key.model, messages, max_tokens: opts.maxTokens ?? 800, temperature: 0.3, ...(opts.json ? { response_format: { type: "json_object" } } : {}) }),
    });
    const retryAfter = Number(res.headers.get("retry-after")) || null;
    const raw = await res.text();
    if (!res.ok) return { status: res.status, retryAfter, detail: raw.slice(0, 300) };
    const text = String(JSON.parse(raw)?.choices?.[0]?.message?.content ?? "").trim();
    return text ? { status: 200, text } : { status: 502, detail: "Réponse vide" };
  } catch (e) { return { status: null, detail: e instanceof Error ? e.name : "Erreur réseau" }; }
}

/**
 * Exécute une demande d'agent avec bascule automatique : essaie les clés autorisées pour ce rôle, dans l'ordre de priorité ;
 * une clé limitée, épuisée, refusée ou en panne est mise en pause (ou désactivée si elle est refusée) et la suivante prend le relais.
 */
export async function runAgent(agent: "support" | "recherche" | "catalogue", messages: Msg[], opts: { maxTokens?: number; json?: boolean } = {}): Promise<RunResult> {
  const db = supabaseAdmin();
  const { data: s } = await db.from("ai_settings").select("enabled, daily_call_cap").eq("id", 1).single();
  if (!s?.enabled) return { ok: false, error: "Les IA sont désactivées (interrupteur général).", attempts: 0 };
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from("ai_runs").select("*", { count: "exact", head: true }).gte("created_at", since.toISOString());
  if ((count ?? 0) >= s.daily_call_cap) return { ok: false, error: "Plafond d'appels du jour atteint.", attempts: 0 };

  const { data: rows } = await db.from("ai_keys").select("*").eq("enabled", true);
  const list = specificFirst(candidates((rows ?? []) as KeyRow[], agent), agent).slice(0, 6);
  if (!list.length) { await log(db, agent, null, null, false, 0, null, "Aucune clé disponible pour ce rôle"); return { ok: false, error: "Aucune clé disponible pour ce rôle (toutes en pause, épuisées ou désactivées).", attempts: 0 }; }

  let attempts = 0; let last = "";
  for (const k of list) {
    attempts++; const t0 = Date.now();
    let apiKey: string;
    try { apiKey = decryptSecret(k.secret_enc); } catch { last = "Clé illisible (clé maîtresse modifiée ?)"; await mark(db, k, { disable: true, error: last }); continue; }
    const r = await callChat(k, apiKey, messages, opts);
    if (r.status === 200 && r.text) { await mark(db, k, { ok: true }); await log(db, agent, k.id, k.label, true, attempts, Date.now() - t0, null); return { ok: true, text: r.text, keyLabel: k.label, attempts }; }
    const f = classifyFailure(r.status, r.retryAfter, scrub(r.detail ?? ""));
    last = scrub(`${k.label} : ${f.message}`);
    await mark(db, k, { disable: f.disable, cooldownSec: f.cooldownSec, error: last });
    await log(db, agent, k.id, k.label, false, attempts, Date.now() - t0, last);
    if (!f.retryNext) return { ok: false, error: last, attempts };
  }
  return { ok: false, error: `Toutes les clés ont échoué. Dernière erreur : ${last}`, attempts };
}

type Db = ReturnType<typeof supabaseAdmin>;
async function mark(db: Db, k: KeyRow, o: { ok?: boolean; disable?: boolean; cooldownSec?: number; error?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const used = (k.used_day === today ? k.used_today : 0) + 1;
  if (o.ok) { await db.from("ai_keys").update({ used_day: today, used_today: used, fail_count: 0, last_error: null, last_ok_at: new Date().toISOString(), cooldown_until: null }).eq("id", k.id); return; }
  await db.from("ai_keys").update({
    used_day: today, used_today: used, fail_count: k.fail_count + 1, last_error: o.error ?? null,
    ...(o.disable ? { enabled: false } : {}), ...(o.cooldownSec ? { cooldown_until: new Date(Date.now() + o.cooldownSec * 1000).toISOString() } : {}),
  }).eq("id", k.id);
}
async function log(db: Db, agent: string, keyId: string | null, label: string | null, ok: boolean, attempts: number, ms: number | null, error: string | null) {
  await db.from("ai_runs").insert({ agent, key_id: keyId, key_label: label, ok, attempts, latency_ms: ms, error });
}
