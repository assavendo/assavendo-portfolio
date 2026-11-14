import test from "node:test";
import assert from "node:assert/strict";
import { hashSupportToken } from "../lib/support.ts";

test("hashSupportToken est déterministe et ne révèle pas le jeton", () => {
  const token = "a".repeat(64);
  const hash = hashSupportToken(token);
  assert.equal(hash, hashSupportToken(token));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
});
