import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const NAME = "av_vid";
/** Identifiant anonyme stocké en cookie httpOnly (plus difficile à falsifier qu'un identifiant en localStorage). */
export async function visitorId(create = false): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(NAME)?.value;
  if (existing && existing.length >= 16) return existing;
  if (!create) return null;
  const id = randomUUID();
  store.set(NAME, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return id;
}
