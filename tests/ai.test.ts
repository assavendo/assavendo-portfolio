import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, generateMasterKey, masterKey } from "../lib/ai/crypto.ts";
import { candidates, classifyFailure, scrub, specificFirst, type KeyRow } from "../lib/ai/policy.ts";
import { validateToolInput } from "../lib/ai/tool-schema.ts";

const k = (o: Partial<KeyRow>): KeyRow => ({ id: "a", provider: "groq", label: "A", base_url: "https://x", model: "m", secret_enc: "", key_hint: "", roles: ["general"], priority: 100, enabled: true, cooldown_until: null, fail_count: 0, daily_limit: null, used_day: "2026-11-05", used_today: 0, ...o });
const now = new Date("2026-11-05T10:00:00Z");

test("chiffrement : aller-retour, IV aléatoire, falsification détectée", () => {
  const key = masterKey(generateMasterKey());
  const a = encryptSecret("gsk_secret_value_123456", key), b = encryptSecret("gsk_secret_value_123456", key);
  assert.notEqual(a, b); assert.ok(!a.includes("secret_value"));
  assert.equal(decryptSecret(a, key), "gsk_secret_value_123456");
  const parts = a.split("."); parts[3] = Buffer.from("zzzzzzzzzzzzzzzz").toString("base64");
  assert.throws(() => decryptSecret(parts.join("."), key));
  assert.throws(() => decryptSecret(a, masterKey(generateMasterKey())));
});
test("clé maîtresse absente ou de mauvaise taille refusée", () => {
  assert.throws(() => masterKey(""), /manquante/);
  assert.throws(() => masterKey(Buffer.from("court").toString("base64")), /invalide/);
});
test("classification des erreurs fournisseur", () => {
  assert.deepEqual([classifyFailure(429, 30).kind, classifyFailure(429, 30).cooldownSec, classifyFailure(429, 30).retryNext], ["rate_limit", 30, true]);
  assert.equal(classifyFailure(429, 99999).cooldownSec, 3600);
  assert.equal(classifyFailure(402).kind, "quota");
  assert.equal(classifyFailure(401).disable, true);
  assert.equal(classifyFailure(503).kind, "server");
  assert.equal(classifyFailure(null).kind, "network");
  const bad = classifyFailure(400, null, "invalid prompt"); assert.equal(bad.retryNext, false); assert.equal(bad.disable, false);
});
test("candidats : rôle, désactivées, pause, plafond du jour", () => {
  const list = [k({ id: "off", enabled: false }), k({ id: "pause", cooldown_until: "2026-11-05T10:05:00Z" }), k({ id: "fini", cooldown_until: "2026-11-05T09:00:00Z" }), k({ id: "plein", daily_limit: 5, used_today: 5 }), k({ id: "autre", roles: ["recherche"] }), k({ id: "ok", roles: ["support"] })];
  assert.deepEqual(candidates(list, "support", now).map((x) => x.id).sort(), ["fini", "ok"]);
  assert.deepEqual(candidates(list, "recherche", now).map((x) => x.id).sort(), ["autre", "fini"]);
});
test("compteur d'un jour passé ignoré ; priorité puis moindre usage", () => {
  const list = [k({ id: "p2", priority: 2 }), k({ id: "p1-use", priority: 1, used_today: 9 }), k({ id: "p1-libre", priority: 1, used_today: 1 }), k({ id: "hier", priority: 3, daily_limit: 5, used_day: "2026-11-04", used_today: 5 })];
  assert.deepEqual(candidates(list, "general", now).map((x) => x.id), ["p1-libre", "p1-use", "p2", "hier"]);
});
test("à priorité égale, la clé dédiée au rôle passe avant « general »", () => {
  const out = specificFirst([k({ id: "g" }), k({ id: "s", roles: ["support"] })], "support"); assert.equal(out[0].id, "s");
});
test("les journaux ne contiennent jamais de clé", () => {
  assert.ok(!scrub("Incorrect API key: gsk_abcdefghijklmnopqrstuv, Bearer abc.def-ghi").match(/gsk_abc|abc\.def/));
});

import { parseProposal, safeToAutoSend } from "../lib/ai/guard.ts";
test("fiche IA : JSON entouré de texte accepté, champs bornés, rien d'inventé d'office", () => {
  const ok = parseProposal('Voici :\n```json\n{"title":"Guide du jardinage","summary":"Un guide complet pour débuter","kind":"digital","price_eur":"9.9","features":["PDF"],"tags":[]}\n```');
  assert.equal(ok.ok, true); if (ok.ok) { assert.equal(ok.value.price_eur, 9.9); assert.equal(ok.value.description, ""); }
  assert.equal(parseProposal("pas de json").ok, false);
  assert.equal(parseProposal('{"title":"x","summary":"court"}').ok, false);
  assert.equal(parseProposal('{"title":"Produit valable","summary":"Résumé suffisamment long","kind":"arme"}').ok, false);
  assert.equal(parseProposal('{"title":"Produit valable","summary":"Résumé suffisamment long","price_eur":-5}').ok, false);
});
test("envoi automatique : refusé si lien externe, e-mail, argent ou longueur anormale", () => {
  const h = "assavendo-assavendo.vercel.app";
  assert.equal(safeToAutoSend("Bonjour, merci pour votre message : votre commande est en préparation, nous revenons vers vous.", h), true);
  assert.equal(safeToAutoSend("Bonjour, voyez https://evil.example/login pour votre dossier, merci de votre patience.", h), false);
  assert.equal(safeToAutoSend("Bonjour, voyez https://assavendo-assavendo.vercel.app/aide pour votre dossier, merci.", h), true);
  assert.equal(safeToAutoSend("Bonjour, écrivez à moi@exemple.fr pour toute question, merci beaucoup.", h), false);
  assert.equal(safeToAutoSend("Bonjour, nous vous accordons un remboursement complet, avec plaisir.", h), false);
  assert.equal(safeToAutoSend("Trop court", h), false);
  assert.equal(safeToAutoSend("a".repeat(1600), h), false);
});


test("policy engine : schéma d'outil et paramètres interdits", () => {
  const schema = {
    type: "object",
    properties: {
      order_id: { type: "string", maxLength: 40 },
      mode: { type: "string", enum: ["summary", "full"] },
    },
    required: ["order_id"],
    additionalProperties: false,
    maxProperties: 2,
  };
  assert.equal(validateToolInput(schema, { order_id: "ORD-1", mode: "summary" }), null);
  assert.match(validateToolInput(schema, { mode: "summary" }) ?? "", /requis/);
  assert.match(validateToolInput(schema, { order_id: "ORD-1", extra: true }) ?? "", /non autorisé/);
  assert.match(validateToolInput(schema, { order_id: "x".repeat(41) }) ?? "", /trop longue/);
  assert.match(validateToolInput(schema, { order_id: "ORD-1", mode: "other" }) ?? "", /interdite/);
});
