import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/customer";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const url = req.nextUrl; const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code"); const hash = url.searchParams.get("token_hash");
  const sb = await supabaseServer();
  const { error } = code ? await sb.auth.exchangeCodeForSession(code)
    : hash ? await sb.auth.verifyOtp({ token_hash: hash, type: "email" }) : { error: new Error("lien invalide") };
  const to = new URL(error ? "/compte/connexion?erreur=lien" : next, url.origin);
  const res = NextResponse.redirect(to);
  res.headers.set("Cache-Control", "no-store"); res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
