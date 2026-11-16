import assert from "node:assert/strict";
import test from "node:test";
import { cjAdapter } from "../lib/dropship/adapters/cj.ts";
import { encryptSupplierSecret, signSupplierWebhookBase64, verifySupplierWebhookBase64 } from "../lib/dropship/crypto.ts";
import type { AdapterConnection } from "../lib/dropship/adapters/types.ts";

process.env.SUPPLIER_CREDENTIAL_KEY = process.env.SUPPLIER_CREDENTIAL_KEY || "test-only-supplier-key";

function connection(credentials: Record<string, unknown>): AdapterConnection {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "CJ test",
    provider_key: "cj_dropshipping",
    integration_mode: "native_api",
    base_url: null,
    enabled: true,
    auto_order_enabled: true,
    webhook_enabled: true,
    sync_interval_seconds: 900,
    credentials_ciphertext: encryptSupplierSecret(JSON.stringify(credentials)),
    secret_ciphertext: null,
    webhook_secret_ciphertext: null,
    sandbox_enabled: true,
    config: {
      cj_logistic_name: "test-logistics",
      cj_from_country_code: "CN",
      cj_shop_logistics_type: 2,
      cj_platform: "Api",
      cj_pay_type: 2,
    },
  };
}

test("CJ webhook signatures use raw-body HMAC-SHA256 Base64", () => {
  const body = '{"messageId":"123111","messageType":"INSERT","params":"123","type":"PRODUCT"}';
  const signature = signSupplierWebhookBase64(body, "123");
  assert.equal(signature, "AHxoGFMoS/4mZfJ5vFes5//Pz2QibFQhh3GlrTtnWpk=");
  assert.equal(verifySupplierWebhookBase64(body, signature, "123"), true);
  assert.equal(verifySupplierWebhookBase64(body + " ", signature, "123"), false);
});

test("CJ inventory adapter resolves mapped SKUs and keeps source USD price", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);

    if (url.includes("/product/variant/query?")) {
      return new Response(JSON.stringify({
        code: 200,
        success: true,
        data: [{ vid: "VID-1", variantSku: "SKU-1", variantSellPrice: 12.34 }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (url.includes("/product/variant/queryByVid?")) {
      return new Response(JSON.stringify({
        code: 200,
        success: true,
        data: {
          vid: "VID-1",
          variantSku: "SKU-1",
          variantSellPrice: 12.34,
          inventories: [{ countryCode: "CN", totalInventory: 7 }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    throw new Error("Unexpected CJ URL: " + url);
  };

  try {
    const records = await cjAdapter.fetchInventory(connection({
      accessToken: "access-token",
      accessTokenExpiryDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      openId: "open-id",
    }), ["SKU-1"]);

    assert.equal(calls.length, 2);
    assert.equal(records.length, 1);
    assert.equal(records[0].external_sku, "SKU-1");
    assert.equal(records[0].external_product_id, "VID-1");
    assert.equal(records[0].supplier_qty, 7);
    assert.equal(records[0].supplier_price_cents, 1234);
    assert.equal(records[0].supplier_currency, "USD");
    assert.equal(records[0].available, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CJ order creation reconciles an ambiguous failure by orderNumber", async () => {
  const originalFetch = globalThis.fetch;
  let createCalls = 0;
  let listCalls = 0;
  let capturedCreateBody: Record<string, unknown> | null = null;
  let listUrl = "";

  globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (url.includes("/shopping/order/createOrderV2")) {
      createCalls += 1;
      capturedCreateBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      throw new Error("fetch failed");
    }

    if (url.includes("/shopping/order/list?")) {
      listCalls += 1;
      listUrl = url;
      return new Response(JSON.stringify({
        code: 200,
        success: true,
        data: {
          list: [{
            orderId: "CJ-ORDER-123",
            orderNum: "AV-000123",
            orderStatus: "UNSHIPPED",
            trackNumber: "",
          }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    throw new Error("Unexpected CJ URL: " + url);
  };

  try {
    const result = await cjAdapter.submitOrder(
      connection({
        accessToken: "access-token",
        accessTokenExpiryDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        openId: "open-id",
      }),
      {
        order: {
          id: "order-1",
          order_number: "AV-000123",
          created_at: new Date().toISOString(),
        },
        customer: { email: "customer@example.com" },
        shipping: {
          name: "Customer Test",
          line1: "1 Test Street",
          city: "Paris",
          postal_code: "75001",
          country: "France",
          countryCode: "FR",
        },
        items: [{
          sku: "SKU-1",
          external_product_id: "VID-1",
          quantity: 2,
          store_line_item_id: "line-1",
        }],
      },
      "order-1:cj",
    );

    assert.equal(createCalls, 1);
    assert.equal(listCalls, 1);
    assert.equal(result.external_order_id, "CJ-ORDER-123");
    assert.equal(result.external_status, "UNSHIPPED");
    const search = new URL(listUrl).searchParams;
    assert.equal(Number.isInteger(Number(search.get("createDateFrom"))), true);
    assert.equal(Number.isInteger(Number(search.get("createDateTo"))), true);
    assert.equal((capturedCreateBody as any)?.orderNumber, "AV-000123");
    assert.equal((capturedCreateBody as any)?.payType, 2);
    assert.equal((capturedCreateBody as any)?.isSandbox, 1);
    assert.equal((capturedCreateBody as any)?.products?.[0]?.vid, "VID-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
