import { NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/rate-limit";
import { hashIp } from "@/lib/privacy";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
const text = (msg: string, status: number) => new NextResponse(msg, { status, headers: noStore });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token) || !(await allow("download", 20, 600))) return text("Lien invalide.", 404);
  const db = supabaseAdmin();
  // Contrôle des conditions ET incrément du compteur en une seule opération atomique (téléchargements simultanés inclus).
  const { data, error } = await db.rpc("claim_download", { p_token: token, p_ip_hash: hashIp(await clientIp()), p_user_agent: req.headers.get("user-agent") });
  if (error) { console.error("[download] claim", error.message); return text("Service momentanément indisponible. Réessayez dans un instant.", 503); }
  const row = (Array.isArray(data) ? data[0] : data) as { storage_path: string; file_name: string; order_id: string } | null;
  if (!row) return text("Lien expiré, épuisé ou invalide. Écrivez-nous pour obtenir un nouveau lien.", 410);
  const { data: signed, error: sErr } = await db.storage.from("deliverables").createSignedUrl(row.storage_path, 60, { download: row.file_name });
  if (sErr || !signed) {
    console.error("[download] lien signé", sErr?.message);
    await db.rpc("release_download", { p_order_id: row.order_id });   // le téléchargement n'a pas eu lieu : on le rend au client
    return text("Fichier momentanément indisponible. Votre téléchargement n'a pas été décompté.", 503);
  }
  const res = NextResponse.redirect(signed.signedUrl, 302);
  Object.entries(noStore).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}
