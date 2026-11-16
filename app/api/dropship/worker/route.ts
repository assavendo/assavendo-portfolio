import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processSupplierAutomation } from "@/lib/dropship/orders";

export const runtime = "nodejs";

function secureEquals(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function isAuthorized(req: Request): Promise<boolean> {
  const supplied = req.headers.get("x-supplier-worker-token")?.trim() ?? "";
  if (!supplied) return false;

  const { data } = await supabaseAdmin()
    .from("supplier_worker_secrets")
    .select("secret")
    .eq("id", 1)
    .eq("active", true)
    .maybeSingle();

  return Boolean(data?.secret && secureEquals(supplied, String(data.secret)));
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processSupplierAutomation();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Supplier automation failed." },
      { status: 500 },
    );
  }
}
