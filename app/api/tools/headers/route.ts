import { NextResponse } from "next/server";
import { analyzeHeaders } from "@/lib/tools/security-headers";
import { safeFetch } from "@/lib/safe-fetch";
import { failure, guard } from "@/lib/tool-route";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const target = await guard(req, "tool-headers");
  if (typeof target !== "string") return target;
  try {
    const r = await safeFetch(target, { method: "HEAD", timeoutMs: 7000 });
    const report = analyzeHeaders(r.headers, new URL(r.url).protocol === "https:");
    return NextResponse.json({ url: r.url, status: r.status, redirects: r.redirects, ...report });
  } catch (e) { return failure(e); }
}
