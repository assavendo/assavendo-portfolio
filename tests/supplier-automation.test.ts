import assert from "node:assert/strict";
import testModule from "node:test";
import { renderTemplate } from "../lib/dropship/template.ts";
import { encryptSupplierSecret, decryptSupplierSecret, signSupplierWebhook, verifySupplierWebhook } from "../lib/dropship/crypto.ts";

process.env.SUPPLIER_CREDENTIAL_KEY = process.env.SUPPLIER_CREDENTIAL_KEY || "test-only-supplier-key";

testModule("supplier templates preserve structured placeholders", () => {
  const result = renderTemplate({
    reference: "{{order.order_number}}",
    quantity: "{{items}}",
    nested: { country: "{{shipping.address.country}}" },
  }, {
    order: { order_number: "AV-000123" },
    items: [{ sku: "SKU-1", quantity: 2 }],
    shipping: { address: { country: "FR" } },
  });
  assert.deepEqual(result, {
    reference: "AV-000123",
    quantity: [{ sku: "SKU-1", quantity: 2 }],
    nested: { country: "FR" },
  });
});

testModule("supplier credentials encrypt/decrypt and webhook signatures verify", () => {
  const secret = "supplier-api-secret-123";
  const encrypted = encryptSupplierSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSupplierSecret(encrypted), secret);

  const body = JSON.stringify({ id: "evt_123", type: "inventory.updated" });
  const signature = signSupplierWebhook(body, "webhook-secret");
  assert.equal(verifySupplierWebhook(body, signature, "webhook-secret"), true);
  assert.equal(verifySupplierWebhook(body + "x", signature, "webhook-secret"), false);
});
