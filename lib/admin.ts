import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { isSupabaseConfigured } from "./env";

/** Vérifie la session ET l'appartenance à la table admins (revérifié à chaque action, pas seulement dans le middleware). */
export async function requireAdmin() {
  if (!isSupabaseConfigured) redirect("/admin/login?erreur=config");
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data } = await sb.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) redirect("/admin/login?erreur=droits");
  return { sb, user };
}
