import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !(await allow("download", 20, 600))) return new NextResponse("Lien invalide.", { status: 404 });
  const db = supabaseAdmin();
  const { data: o } = await db.from("orders").select("id, product_id, download_count, status").eq("download_token", token).maybeSingle();
  if (!o || o.status !== "paid" || o.download_count >= 5) return new NextResponse("Lien expiré ou invalide.", { status: 410 });
  const { data: d } = await db.from("product_deliverables").select("storage_path, file_name").eq("product_id", o.product_id).maybeSingle();
  if (!d) return new NextResponse("Aucun fichier associé à cet achat.", { status: 404 });
  const { data: signed } = await db.storage.from("deliverables").createSignedUrl(d.storage_path, 60, { download: d.file_name });
  if (!signed) return new NextResponse("Fichier indisponible.", { status: 500 });
  await db.from("orders").update({ download_count: o.download_count + 1 }).eq("id", o.id);
  return NextResponse.redirect(signed.signedUrl, 302);
}
