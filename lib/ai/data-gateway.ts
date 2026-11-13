export type AiDataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,14}(?!\d)/g;
const CARD_RE = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;

export function redactAiText(value: string): string {
  return value
    .replace(EMAIL_RE, "[EMAIL REDACTED]")
    .replace(PHONE_RE, "[PHONE REDACTED]")
    .replace(CARD_RE, "[PAYMENT DATA REDACTED]")
    .slice(0, 12000);
}

export function prepareAiMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
  return messages.map((message) =>
    message.role === "user"
      ? { ...message, content: redactAiText(message.content) }
      : message
  );
}

export function canSendToProvider(
  classification: AiDataClassification,
  providerAllowsRestricted = false,
): boolean {
  if (classification === "HIGHLY_RESTRICTED") return false;
  if (classification === "RESTRICTED") return providerAllowsRestricted;
  return true;
}
