import { headers } from "next/headers";
import { supabaseAdmin } from "./supabase/server";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "inconnu").trim();
}

/** true = la requête est autorisée. En cas de panne de la base, on refuse (fail closed). */
export async function allow(action: string, max: number, windowSeconds: number, subject?: string): Promise<boolean> {
  if (!process.env.SUPABASE_SECRET_KEY && process.env.NODE_ENV !== "production") return true;
  try {
    const key = `${action}:${subject ?? (await clientIp())}`;
    const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) return false;
    return data === true;
  } catch { return false; }
}
