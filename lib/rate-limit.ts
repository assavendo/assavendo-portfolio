import { headers } from "next/headers";
import { supabaseAdmin } from "./supabase/server";
import { memoryHit } from "./memory-limit.ts";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "inconnu").trim();
}

/**
 * true = la requête est autorisée. Deux compteurs : l'identité du visiteur (si fournie) ET l'adresse IP, car un cookie se régénère.
 * Si la base est indisponible, on bascule sur un compteur mémoire plus strict plutôt que de tout refuser (contact et outils restent utilisables).
 */
export async function allow(action: string, max: number, windowSeconds: number, subject?: string): Promise<boolean> {
  if (!process.env.SUPABASE_SECRET_KEY && process.env.NODE_ENV !== "production") return true;
  const ip = await clientIp();
  const keys = subject ? [`${action}:${subject}`, `${action}:ip:${ip}`] : [`${action}:${ip}`];
  for (const key of keys) {
    let ok: boolean;
    try {
      const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
      ok = error ? memoryHit(key, Math.max(1, Math.floor(max / 2)), windowSeconds) : data === true;
    } catch { ok = memoryHit(key, Math.max(1, Math.floor(max / 2)), windowSeconds); }
    if (!ok) return false;
  }
  return true;
}
