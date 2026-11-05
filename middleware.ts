import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rafraîchit la session Supabase et protège /admin. L'autorisation fine (is_admin) est revérifiée côté serveur à chaque action. */
export async function middleware(req: NextRequest) {
  // Filet de sécurité : si Supabase renvoie le visiteur sur l'accueil (adresse de retour non autorisée), on transmet le code à la page de connexion.
  if (req.nextUrl.pathname === "/") {
    const q = req.nextUrl.searchParams;
    if (q.get("code") || q.get("token_hash")) { const to = new URL("/compte/callback", req.url); q.forEach((v, k) => { if (k === "code" || k === "token_hash") to.searchParams.set(k, v); }); return NextResponse.redirect(to); }
    if (q.get("error_code") || q.get("error")) return NextResponse.redirect(new URL("/compte/connexion?erreur=lien", req.url));
    return NextResponse.next();
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: (list) => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); } },
  });
  const { data } = await supabase.auth.getClaims();
  const path = req.nextUrl.pathname;
  if (path.startsWith("/admin") && path !== "/admin/login" && !data?.claims) return NextResponse.redirect(new URL("/admin/login", req.url));
  res.headers.set("Cache-Control", path.startsWith("/admin") ? "private, no-store" : res.headers.get("Cache-Control") ?? "");
  return res;
}
export const config = { matcher: ["/admin/:path*", { source: "/", has: [{ type: "query", key: "code" }] }, { source: "/", has: [{ type: "query", key: "token_hash" }] }, { source: "/", has: [{ type: "query", key: "error_code" }] }, { source: "/", has: [{ type: "query", key: "error" }] }] };
