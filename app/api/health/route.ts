import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
/** Contrôle de disponibilité pour une sonde externe (UptimeRobot, Better Stack…) : 200 si la base répond, 503 sinon. Ne renvoie aucun détail interne. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ status: "ok", database: "non configurée" }, { headers });
  try {
    const { error } = await supabaseAdmin().from("domains").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok" }, { headers });
  } catch (e) {
    console.error("[health]", e instanceof Error ? e.message : e);
    return NextResponse.json({ status: "degraded" }, { status: 503, headers });
  }
}
