import assert from "node:assert/strict";
import test from "node:test";
import { signSupplierWebhookBase64, verifySupplierWebhookBase64 } from "../lib/dropship/crypto.ts";
import { getRatesToEur, toEurCents } from "../lib/dropship/fx.ts";
import { getSupplierProvider } from "../lib/dropship/providers.ts";
import { getSupplierAdapter } from "../lib/dropship/adapters/index.ts";

test("CJ webhook Base64 HMAC uses the exact raw body", () => {
  const body = '{"messageId":"evt-1","type":"ORDER","messageType":"UPDATE"}';
  const signature = signSupplierWebhookBase64(body, "123456789");
  assert.equal(verifySupplierWebhookBase64(body, signature, "123456789"), true);
  assert.equal(verifySupplierWebhookBase64(body + "x", signature, "123456789"), false);
  assert.notEqual(signSupplierWebhookBase64(body, "123456789"), signSupplierWebhookBase64(body, "1234567890"));
});

test("supplier FX conversion keeps EUR normalization deterministic", () => {
  const rates = { USD: { rate: 1.1, date: "2026-11-16", fetchedAt: Date.now() } };
  assert.equal(toEurCents(1100, "USD", rates), 1000);
  assert.equal(toEurCents(1000, "EUR", rates), 1000);
});

test("CJ provider profile is native and has a registered adapter", () => {
  const provider = getSupplierProvider("cj_dropshipping");
  assert.equal(provider.integrationMode, "native_api");
  assert.equal(provider.adapterKey, "cj");
  assert.equal(getSupplierAdapter("cj")?.key, "cj");
});
