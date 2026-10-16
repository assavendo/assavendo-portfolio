import { NextResponse } from "next/server";
import { analyzeSeo } from "@/lib/tools/seo";
import { parseTarget, robotsAllows, safeFetch } from "@/lib/safe-fetch";
import { failure, guard } from "@/lib/tool-route";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const target = await guard(req, "tool-seo");
  if (typeof target !== "string") return target;
  try {
    const url = parseTarget(target);
    if (!(await robotsAllows(url))) return NextResponse.json({ error: "Le fichier robots.txt de ce site interdit l'analyse automatique de cette page." }, { status: 403 });
    const r = await safeFetch(url.toString(), { timeoutMs: 8000 });
    if (!/text\/html|application\/xhtml/i.test(r.headers["content-type"] ?? "")) return NextResponse.json({ error: "Cette adresse ne renvoie pas une page web." }, { status: 422 });
    return NextResponse.json({ url: r.url, status: r.status, truncated: r.truncated, ...analyzeSeo(r.body, r.url) });
  } catch (e) { return failure(e); }
}
