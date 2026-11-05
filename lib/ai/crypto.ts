import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Chiffrement des clés API au repos : AES-256-GCM. La clé maîtresse (AI_MASTER_KEY, 32 octets en base64) n'existe que dans l'environnement du serveur. */
export function masterKey(raw = process.env.AI_MASTER_KEY): Buffer {
  if (!raw) throw new Error("AI_MASTER_KEY manquante : générez-la (voir la page Centre IA) puis redéployez.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("AI_MASTER_KEY invalide : 32 octets en base64 attendus.");
  return key;
}
export function encryptSecret(plain: string, key = masterKey()): string {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
export function decryptSecret(blob: string, key = masterKey()): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Format de clé chiffrée inconnu.");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64")); d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
export const generateMasterKey = () => randomBytes(32).toString("base64");
