import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";
export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };
export default async function Login({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const sp = await searchParams;
  return <div className="section"><div className="wrap"><h1 style={{ fontSize: "2rem" }}>Administration</h1>
    {sp.erreur === "droits" ? <p className="alert alert-err" role="alert" style={{ maxWidth: 480 }}>Ce compte n'a pas les droits d'administration.</p> : null}
    {sp.erreur === "config" ? <p className="alert alert-err" role="alert" style={{ maxWidth: 560 }}>Supabase n'est pas encore configuré : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans l'environnement, puis redéployez.</p> : <LoginForm />}</div></div>;
}
