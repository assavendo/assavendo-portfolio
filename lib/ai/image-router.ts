import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptSecret } from "./crypto";
import { candidates, classifyFailure, scrub, specificFirst, type KeyRow } from "./policy";
import { manusCreateTask, manusListMessages, manusTaskDetail } from "./manus";

export type GeneratedImage = {
  ok: true;
  bytes: Buffer;
  contentType: "image/webp" | "image/png" | "image/jpeg";
  provider: string;
  model: string;
  keyId: string | null;
  keyLabel: string;
  attempts: number;
  requestId?: string | null;
};

type Input = { sourceUrl: string; prompt: string };
type ProviderResult =
  | {
      ok: true;
      status: number;
      bytes: Buffer;
      contentType: GeneratedImage["contentType"];
      requestId?: string | null;
    }
  | {
      ok: false;
      status: number | null;
      detail?: string;
    };

const MAX_BYTES = 8 * 1024 * 1024;

function contentType(value: string | null): GeneratedImage["contentType"] | null {
  const type = String(value ?? "").split(";")[0].trim().toLowerCase();
  return type === "image/webp" || type === "image/png" || type === "image/jpeg" ? type : null;
}

function validImage(bytes: Buffer, type: GeneratedImage["contentType"]) {
  if (!bytes.length || bytes.length > MAX_BYTES) return false;
  if (type === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (type === "image/png") return bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  return bytes.subarray(0, 3).toString("hex") === "ffd8ff";
}

async function openAi(key: KeyRow, secret: string, input: Input): Promise<ProviderResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(110000),
      headers: { authorization: "Bearer " + secret, "content-type": "application/json" },
      body: JSON.stringify({
        model: key.model || "gpt-image-1.5",
        images: [{ image_url: input.sourceUrl }],
        prompt: input.prompt,
        quality: "medium",
        size: "1024x1024",
        output_format: "webp",
        output_compression: 85,
      }),
    });
    const raw = await res.text().catch(() => "");
    let parsed: { data?: { b64_json?: string }[]; error?: { message?: string } } = {};
    try { parsed = JSON.parse(raw); } catch {}
    if (!res.ok) return { ok: false, status: res.status, detail: scrub(parsed.error?.message ?? ("HTTP " + res.status)).slice(0, 220) };
    const b64 = parsed.data?.[0]?.b64_json;
    if (!b64) return { ok: false, status: 502, detail: "Réponse image vide" };
    const bytes = Buffer.from(b64, "base64");
    if (!validImage(bytes, "image/webp")) return { ok: false, status: 502, detail: "WebP OpenAI invalide" };
    return { ok: true, status: 200, bytes, contentType: "image/webp", requestId: res.headers.get("x-request-id") || res.headers.get("request-id") };
  } catch (error) {
    return { ok: false, status: null, detail: error instanceof Error ? error.name : "Erreur réseau" };
  }
}

async function openRouter(key: KeyRow, secret: string, input: Input): Promise<ProviderResult> {
  const base = key.base_url.replace(/\/$/, "");
  if (base !== "https://openrouter.ai/api/v1") return { ok: false, status: null, detail: "Origine OpenRouter refusée" };
  try {
    const res = await fetch(base + "/images", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(110000),
      headers: {
        authorization: "Bearer " + secret,
        "content-type": "application/json",
        "http-referer": "https://assavendo.vercel.app",
        "x-title": "Assavendo",
      },
      body: JSON.stringify({
        model: key.model,
        prompt: input.prompt,
        input_references: [input.sourceUrl],
        size: "1024x1024",
        n: 1,
      }),
    });
    const raw = await res.text().catch(() => "");
    let parsed: { data?: { b64_json?: string; media_type?: string }[]; error?: { message?: string }; id?: string } = {};
    try { parsed = JSON.parse(raw); } catch {}
    if (!res.ok) return { ok: false, status: res.status, detail: scrub(parsed.error?.message ?? ("HTTP " + res.status)).slice(0, 220) };
    const b64 = parsed.data?.[0]?.b64_json;
    if (!b64) return { ok: false, status: 502, detail: "Réponse image vide" };
    const type = contentType(parsed.data?.[0]?.media_type ?? "image/webp") ?? "image/webp";
    const bytes = Buffer.from(b64, "base64");
    if (!validImage(bytes, type)) return { ok: false, status: 502, detail: "Image OpenRouter invalide" };
    return { ok: true, status: 200, bytes, contentType: type, requestId: parsed.id ?? null };
  } catch (error) {
    return { ok: false, status: null, detail: error instanceof Error ? error.name : "Erreur réseau" };
  }
}

function imageFromMessages(messages: Record<string, unknown>[]) {
  for (const message of messages) {
    const assistant = message.assistant_message;
    if (!assistant || typeof assistant !== "object") continue;
    const attachments = (assistant as Record<string, unknown>).attachments;
    if (!Array.isArray(attachments)) continue;
    for (const attachment of attachments) {
      if (!attachment || typeof attachment !== "object") continue;
      const item = attachment as Record<string, unknown>;
      if (item.type === "image" && typeof item.url === "string" && /^https:\/\//i.test(item.url)) return item.url;
    }
  }
  return null;
}

async function manus(secret: string, profile: "standard" | "lite" | "max", input: Input): Promise<ProviderResult> {
  const task = await manusCreateTask(
    secret,
    [input.prompt, "", "Source de référence publique :", input.sourceUrl, "", "Produis une image finale e-commerce en pièce jointe image. Ne change pas l'identité physique du produit."].join("\n"),
    { agentProfile: profile, locale: "fr-FR" },
  );
  if (!task.ok || !task.data?.id) return { ok: false, status: task.status || 502, detail: scrub(task.error ?? "Manus n'a pas créé la tâche").slice(0, 220) };
  const deadline = Date.now() + 105000;
  while (Date.now() < deadline) {
    const messages = await manusListMessages(secret, task.data.id, 40);
    const url = messages.ok ? imageFromMessages(messages.data ?? []) : null;
    if (url) {
      try {
        const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
        const type = contentType(res.headers.get("content-type"));
        if (!res.ok || !type) return { ok: false, status: res.status || 502, detail: "Image Manus inaccessible" };
        const bytes = Buffer.from(await res.arrayBuffer());
        if (!validImage(bytes, type)) return { ok: false, status: 502, detail: "Image Manus invalide" };
        return { ok: true, status: 200, bytes, contentType: type, requestId: task.requestId ?? null };
      } catch (error) {
        return { ok: false, status: null, detail: error instanceof Error ? error.name : "Erreur réseau Manus" };
      }
    }
    const detail = await manusTaskDetail(secret, task.data.id);
    if (detail.ok && detail.data && ["error", "stopped", "deleted"].includes(detail.data.status)) {
      return { ok: false, status: 502, detail: "Manus tâche " + detail.data.status };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { ok: false, status: 504, detail: "Délai Manus dépassé" };
}

export async function generatePremiumImage(input: Input): Promise<GeneratedImage | { ok: false; error: string; attempts: number }> {
  const db = supabaseAdmin();
  const [{ data: keys }, { data: providers }, { data: manusKeys }] = await Promise.all([
    db.from("ai_keys").select("*").eq("enabled", true).in("provider", ["openai", "openrouter"]),
    db.from("ai_providers").select("slug,enabled,status").in("slug", ["openai", "openrouter", "manus"]),
    db.from("manus_keys").select("id,label,secret_enc,agent_profile,priority,enabled,cooldown_until,fail_count,last_error,last_ok_at,daily_limit,used_day,used_today").eq("enabled", true),
  ]);
  const providerBySlug = new Map((providers ?? []).map((row) => [String(row.slug), row]));
  const direct = specificFirst(candidates((keys ?? []) as KeyRow[], "catalogue"), "catalogue")
    .filter((key) => {
      const provider = providerBySlug.get(key.provider);
      return !!provider?.enabled && !["disabled", "maintenance", "unavailable", "rate_limited"].includes(String(provider.status));
    })
    .slice(0, 6);

  let attempts = 0;
  let lastError = "Aucun fournisseur image disponible.";

  for (const key of direct) {
    attempts++;
    let secret: string;
    try {
      secret = decryptSecret(key.secret_enc);
    } catch {
      lastError = "Credential " + key.label + " illisible.";
      await db.from("ai_keys").update({ enabled: false, last_error: lastError, fail_count: key.fail_count + 1 }).eq("id", key.id);
      continue;
    }
    const result = key.provider === "openai" ? await openAi(key, secret, input) : await openRouter(key, secret, input);
    if (result.ok && result.bytes && result.contentType) {
      const today = new Date().toISOString().slice(0, 10);
      await db.from("ai_keys").update({ used_day: today, used_today: (key.used_day === today ? key.used_today : 0) + 1, fail_count: 0, last_error: null, last_ok_at: new Date().toISOString(), cooldown_until: null }).eq("id", key.id);
      return { ok: true, status: 200, bytes: result.bytes, contentType: result.contentType, provider: key.provider, model: key.model, keyId: key.id, keyLabel: key.label, attempts, requestId: result.requestId ?? null };
    }
    const failure = classifyFailure(result.status, null, scrub(result.detail ?? ""));
    lastError = scrub(key.label + " : " + failure.message);
    const today = new Date().toISOString().slice(0, 10);
    await db.from("ai_keys").update({
      used_day: today,
      used_today: (key.used_day === today ? key.used_today : 0) + 1,
      fail_count: key.fail_count + 1,
      last_error: lastError,
      ...(failure.disable ? { enabled: false } : {}),
      ...(failure.cooldownSec ? { cooldown_until: new Date(Date.now() + failure.cooldownSec * 1000).toISOString() } : {}),
    }).eq("id", key.id);
    if (!failure.retryNext) break;
  }

  const today = new Date().toISOString().slice(0, 10);
  const manusCandidates = (manusKeys ?? [])
    .filter((key) => !key.cooldown_until || new Date(String(key.cooldown_until)) <= new Date())
    .filter((key) => key.daily_limit == null || (key.used_day === today ? Number(key.used_today) : 0) < Number(key.daily_limit))
    .sort((a, b) => Number(a.priority) - Number(b.priority))
    .slice(0, 3);
  const manusProvider = providerBySlug.get("manus");
  if (manusProvider?.enabled && !["disabled", "maintenance", "unavailable", "rate_limited"].includes(String(manusProvider.status))) {
    for (const key of manusCandidates) {
      attempts++;
      let secret: string;
      try {
        secret = decryptSecret(String(key.secret_enc));
      } catch {
        lastError = "Credential Manus " + key.label + " illisible.";
        await db.from("manus_keys").update({ enabled: false, last_error: lastError, fail_count: Number(key.fail_count) + 1 }).eq("id", key.id);
        continue;
      }
      const profile = key.agent_profile === "lite" || key.agent_profile === "max" ? key.agent_profile : "standard";
      const result = await manus(secret, profile, input);
      if (result.ok && result.bytes && result.contentType) {
        await db.from("manus_keys").update({
          used_day: today,
          used_today: (key.used_day === today ? Number(key.used_today) : 0) + 1,
          fail_count: 0,
          last_error: null,
          last_ok_at: new Date().toISOString(),
          cooldown_until: null,
        }).eq("id", key.id);
        return { ok: true, status: 200, bytes: result.bytes, contentType: result.contentType, provider: "manus", model: "manus-" + profile, keyId: String(key.id), keyLabel: String(key.label), attempts, requestId: result.requestId ?? null };
      }
      lastError = scrub("Manus " + key.label + " : " + (result.detail ?? "échec"));
      const failure = classifyFailure(result.status, null, result.detail ?? "");
      await db.from("manus_keys").update({
        used_day: today,
        used_today: (key.used_day === today ? Number(key.used_today) : 0) + 1,
        fail_count: Number(key.fail_count) + 1,
        last_error: lastError,
        ...(failure.cooldownSec ? { cooldown_until: new Date(Date.now() + failure.cooldownSec * 1000).toISOString() } : {}),
      }).eq("id", key.id);
    }
  }
  return { ok: false, error: lastError, attempts };
}