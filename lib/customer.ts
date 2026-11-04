import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { isSupabaseConfigured } from "./env";

/** Client connecté (session Supabase par lien magique). Redirige vers la connexion sinon. */
export async function requireCustomer(next = "/compte") {
  if (!isSupabaseConfigured) redirect("/compte/connexion?erreur=config");
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !user.email) redirect(`/compte/connexion?next=${encodeURIComponent(next)}`);
  return { sb, user: { id: user.id, email: user.email.toLowerCase() } };
}
export async function currentCustomer() {
  if (!isSupabaseConfigured) return null;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return user?.email ? { sb, user: { id: user.id, email: user.email.toLowerCase() } } : null;
}
export const safeNext = (n: string | null | undefined) => (n && /^\/(compte|boutique|commande)(\/[\w\-./?=&%]*)?$/.test(n) && !n.includes("//") ? n : "/compte");
