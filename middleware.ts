import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rafraîchit la session Supabase et protège /admin. L'autorisation fine (is_admin) est revérifiée côté serveur à chaque action. */
export async function middleware(req: NextRequest) {
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
export const config = { matcher: ["/admin/:path*"] };
