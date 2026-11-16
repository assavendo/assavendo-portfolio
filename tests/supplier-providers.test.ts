import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIER_PROVIDERS, getSupplierProvider } from "../lib/dropship/providers.ts";

test("supplier registry contains the requested major providers", () => {
  const keys = new Set(SUPPLIER_PROVIDERS.map((provider) => provider.key));
  for (const key of [
    "cj_dropshipping",
    "hypersku",
    "alibaba_dropshipping",
    "syncee",
    "spocket",
    "dsers",
    "aliexpress",
    "salehoo",
    "eprolo",
    "wiio",
    "1688_via_dsers",
    "custom_rest",
  ]) {
    assert.equal(keys.has(key), true, key);
  }
});

test("managed/feed/directory providers are never mislabeled as generic REST", () => {
  assert.equal(getSupplierProvider("syncee").integrationMode, "feed");
  assert.equal(getSupplierProvider("spocket").integrationMode, "managed_platform");
  assert.equal(getSupplierProvider("salehoo").integrationMode, "directory");
});

test("provider lookup falls back to the custom connector", () => {
  assert.equal(getSupplierProvider("does_not_exist").key, "custom_rest");
});
