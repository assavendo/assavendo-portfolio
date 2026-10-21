import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/rate-limit";
import { DKIM_SELECTORS, analyzeDkim, analyzeDmarc, analyzeSpf, emailScore } from "@/lib/tools/email-auth";

export const runtime = "nodejs";
const schema = z.object({ target: z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/, "Saisissez un nom de domaine, par exemple exemple.fr") });

async function txt(name: string): Promise<string[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error("dns");
  const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
  return (json.Answer ?? []).filter((a) => a.type === 16).map((a) => a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
}

export async function POST(req: Request) {
  if (!(await allow("tool-email", 15, 60))) return NextResponse.json({ error: "Trop de tests en peu de temps. Réessayez dans une minute." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Domaine invalide." }, { status: 400 });
  try {
    const d = parsed.data.target;
    const [root, dmarc, dkimRaw] = await Promise.all([
      txt(d), txt(`_dmarc.${d}`),
      Promise.all(DKIM_SELECTORS.map(async (selector) => ({ selector, records: await txt(`${selector}._domainkey.${d}`).catch(() => [] as string[]) }))),
    ]);
    const spf = analyzeSpf(root); const dm = analyzeDmarc(dmarc);
    const dkim = analyzeDkim(dkimRaw.flatMap((r) => r.records.map((record) => ({ selector: r.selector, record: record.slice(0, 120) }))), DKIM_SELECTORS.length);
    return NextResponse.json({ domain: d, spf, dmarc: dm, dkim, score: emailScore(spf, dm, dkim) });
  } catch { return NextResponse.json({ error: "La résolution DNS a échoué. Réessayez dans un instant." }, { status: 502 }); }
}
