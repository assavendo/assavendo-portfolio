import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "./rate-limit";
import { FetchRefused } from "./safe-fetch";

export const targetSchema = z.object({ target: z.string().trim().min(3).max(300) });

export async function guard(req: Request, action: string) {
  if (!(await allow(action, 12, 60))) return NextResponse.json({ error: "Trop de tests en peu de temps. Réessayez dans une minute." }, { status: 429 });
  const parsed = targetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Indiquez une adresse valide." }, { status: 400 });
  return parsed.data.target;
}

export function failure(e: unknown) {
  if (e instanceof FetchRefused) return NextResponse.json({ error: e.message }, { status: 400 });
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return NextResponse.json({ error: "Ce nom de domaine est introuvable." }, { status: 404 });
  if (code === "CERT_HAS_EXPIRED" || code?.startsWith("ERR_TLS") || code?.includes("CERT")) return NextResponse.json({ error: "Le certificat HTTPS de ce site est invalide ou expiré : c'est déjà un problème à corriger.", code }, { status: 502 });
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ECONNRESET") return NextResponse.json({ error: "Le site n'a pas répondu à temps." }, { status: 504 });
  return NextResponse.json({ error: "Le test n'a pas pu aboutir." }, { status: 502 });
}
