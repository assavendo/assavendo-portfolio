import { NextResponse } from "next/server";
import { parseTarget } from "@/lib/safe-fetch";
import { parsePagespeed } from "@/lib/tools/pagespeed";
import { failure, guard } from "@/lib/tool-route";

export const runtime = "nodejs";
export const maxDuration = 60;

/** La mesure est réalisée par Google PageSpeed Insights : notre serveur ne se connecte jamais au site testé. L'adresse est tout de même validée (publique, http/https). */
export async function POST(req: Request) {
  const target = await guard(req, "tool-speed");
  if (typeof target !== "string") return target;
  try {
    const url = parseTarget(target);
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", url.toString()); api.searchParams.set("strategy", "mobile"); api.searchParams.set("category", "performance"); api.searchParams.set("locale", "fr");
    if (process.env.PAGESPEED_API_KEY) api.searchParams.set("key", process.env.PAGESPEED_API_KEY);
    const res = await fetch(api, { signal: AbortSignal.timeout(55_000), headers: { accept: "application/json" } });
    if (res.status === 429) return NextResponse.json({ error: "Le service de mesure est très sollicité en ce moment. Réessayez dans une minute." }, { status: 429 });
    if (res.status === 400) return NextResponse.json({ error: "Google n'a pas pu charger cette page (adresse inaccessible ou protégée). Vérifiez l'adresse et que le site est public." }, { status: 422 });
    if (!res.ok) return NextResponse.json({ error: "Le service de mesure est indisponible. Réessayez dans un instant." }, { status: 502 });
    return NextResponse.json({ url: url.toString(), ...parsePagespeed(await res.json()) });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return NextResponse.json({ error: "La mesure a pris trop de temps. Réessayez : certains sites mettent longtemps à répondre." }, { status: 504 });
    return failure(e);
  }
}
