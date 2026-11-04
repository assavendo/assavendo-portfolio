import test from "node:test";
import assert from "node:assert/strict";
import { canRequestReturn, returnDeadline } from "../lib/returns.ts";

const base = { paid_at: "2026-11-01T00:00:00Z", delivered_at: null, delivery_max_days: 4, return_days: 14, kind: "physical", status: "paid" };
test("délai : livraison estimée + jours de retour", () => { assert.equal(returnDeadline(base)?.toISOString(), "2026-11-19T00:00:00.000Z"); });
test("délai : la date de livraison réelle prime", () => { assert.equal(returnDeadline({ ...base, delivered_at: "2026-11-03T00:00:00Z" })?.toISOString(), "2026-11-17T00:00:00.000Z"); });
test("retour possible dans le délai, refusé après", () => { assert.equal(canRequestReturn(base, new Date("2026-11-19T00:00:00Z")), true); assert.equal(canRequestReturn(base, new Date("2026-11-20T00:00:00Z")), false); });
test("numérique, non payé ou sans droit de retour : refusé", () => {
  const now = new Date("2026-11-05T00:00:00Z");
  assert.equal(canRequestReturn({ ...base, kind: "digital" }, now), false);
  assert.equal(canRequestReturn({ ...base, status: "pending" }, now), false);
  assert.equal(canRequestReturn({ ...base, return_days: 0 }, now), false);
  assert.equal(canRequestReturn({ ...base, paid_at: null }, now), false);
});
