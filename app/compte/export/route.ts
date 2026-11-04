import { NextResponse } from "next/server";
import { currentCustomer } from "@/lib/customer";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
/** Export des données personnelles du client connecté (droit d'accès / portabilité), au format JSON. */
export async function GET() {
  const c = await currentCustomer();
  if (!c) return NextResponse.redirect(new URL("/compte/connexion?next=/compte", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  const db = supabaseAdmin();
  const [{ data: base }, { data: fav }, { data: addr }] = await Promise.all([
    db.rpc("export_personal_data", { p_email: c.user.email }), c.sb.from("favorites").select("product_id, created_at"), c.sb.from("addresses").select("label, full_name, line1, line2, postal_code, city, country, phone, created_at"),
  ]);
  return new NextResponse(JSON.stringify({ email: c.user.email, ...(base as object), favoris: fav ?? [], adresses: addr ?? [] }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="mes-donnees-assavendo.json"', "Cache-Control": "private, no-store" },
  });
}
