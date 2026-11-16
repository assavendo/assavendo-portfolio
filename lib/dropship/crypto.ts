import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

function keyBytes(): Buffer {
  const raw = process.env.SUPPLIER_CREDENTIAL_KEY;
  if (!raw) throw new Error("SUPPLIER_CREDENTIAL_KEY is not configured.");
  return createHash("sha256").update(raw).digest();
}

export function encryptSupplierSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSupplierSecret(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  const [version, ivRaw, tagRaw, dataRaw] = ciphertext.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw) throw new Error("Unsupported supplier secret format.");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function signSupplierWebhook(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifySupplierWebhook(body: string, signature: string, secret: string): boolean {
  const normalized = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = Buffer.from(signSupplierWebhook(body, secret), "utf8");
  const received = Buffer.from(normalized, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
