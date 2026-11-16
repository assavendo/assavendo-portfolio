import { NextResponse } from "next/server";
import { processSupplierAutomation } from "@/lib/dropship/orders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!expected || auth !== "Bearer " + expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processSupplierAutomation();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Supplier automation failed." }, { status: 500 });
  }
}
