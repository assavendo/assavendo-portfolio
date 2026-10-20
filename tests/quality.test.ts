import test from "node:test";
import assert from "node:assert/strict";
import { problems } from "../content/problems.ts";
import { drafts } from "../content/drafts.ts";
import { domains } from "../content/domains.ts";
import { validatePublishable, slugProblem } from "../lib/content-rules.ts";
import { hasOperationalTool, isToolKey, toolKeys, toolLimits } from "../lib/tool-keys.ts";
import { isAllowedImageUrl } from "../lib/images.ts";
import { memoryHit } from "../lib/memory-limit.ts";
import { formValues } from "../lib/form.ts";
import { hashIp } from "../lib/privacy.ts";
import { resolveSiteUrl } from "../lib/env.ts";

test("toutes les fiches publiées sont complètes et valides", () => {
  for (const p of problems) assert.deepEqual(validatePublishable({ ...p, tool_key: p.tool_key ?? null, tool_intro: p.tool_intro ?? "" }), [], p.slug);
});
test("aucun slug numéroté, aucun doublon", () => {
  const all = [...problems, ...drafts].map((p) => p.slug);
  assert.equal(new Set(all).size, all.length);
  for (const s of all) assert.equal(slugProblem(s), null, s);
});
test("les brouillons n'ont jamais d'outil et référencent un domaine connu", () => {
  const known = new Set<string>(domains.map((d) => d.slug));
  for (const d of drafts) { assert.ok(known.has(d.domain), d.slug); assert.equal((d as { tool_key?: string }).tool_key, undefined, d.slug); }
});
test("badge d'outil : seulement si la clé correspond à un outil réel", () => {
  assert.equal(hasOperationalTool({ format: "tool", tool_key: "seo" }), true);
  assert.equal(hasOperationalTool({ format: "tool", tool_key: "p01-site-trop-lent" }), false);
  assert.equal(hasOperationalTool({ format: "study", tool_key: "seo" }), false);
  assert.equal(hasOperationalTool({ format: "tool", tool_key: null }), false);
  for (const k of toolKeys) { assert.ok(isToolKey(k)); assert.ok(toolLimits[k].length > 20, k); }
  for (const p of problems) assert.equal(p.format === "tool", isToolKey(p.tool_key), p.slug);
});
test("images : seuls les hôtes configurés dans next/image sont acceptés", () => {
  assert.equal(isAllowedImageUrl("https://images.unsplash.com/photo-1"), true);
  assert.equal(isAllowedImageUrl("https://abc.supabase.co/storage/v1/object/public/media/x.jpg"), true);
  for (const u of ["http://images.unsplash.com/x", "https://evil.example/x.jpg", "https://unsplash.com.evil.io/x", "javascript:alert(1)", "n'importe quoi"]) assert.equal(isAllowedImageUrl(u), false, u);
});
test("limiteur mémoire : plafond et fenêtre", () => {
  const t = 1_000_000;
  assert.equal(memoryHit("k", 2, 60, t), true); assert.equal(memoryHit("k", 2, 60, t + 1), true); assert.equal(memoryHit("k", 2, 60, t + 2), false);
  assert.equal(memoryHit("k", 2, 60, t + 61_000), true);
  assert.equal(memoryHit("autre", 1, 60, t), true);
});
test("formulaires : saisies renvoyées sans jeton ni champ piège", () => {
  const f = new FormData(); f.set("name", "Awa"); f.set("website", "bot"); f.set("cf-turnstile-response", "jeton"); f.set("message", "x".repeat(5000));
  const v = formValues(f);
  assert.equal(v.name, "Awa"); assert.equal("website" in v, false); assert.equal("cf-turnstile-response" in v, false); assert.equal(v.message.length, 4000);
});
test("empreinte d'IP : stable, non réversible, dépend du sel", () => {
  assert.equal(hashIp("1.2.3.4"), hashIp("1.2.3.4")); assert.notEqual(hashIp("1.2.3.4"), hashIp("1.2.3.5"));
  assert.match(hashIp("1.2.3.4"), /^[0-9a-f]{32}$/); assert.ok(!hashIp("1.2.3.4").includes("1.2.3.4"));
});
test("URL du site : obligatoire et publique en production", () => {
  assert.throws(() => resolveSiteUrl({ NODE_ENV: "production" }));
  assert.throws(() => resolveSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }));
  assert.throws(() => resolveSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://exemple.fr" }));
  assert.equal(resolveSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://exemple.fr/" }), "https://exemple.fr");
  assert.equal(resolveSiteUrl({ NODE_ENV: "development" }), "http://localhost:3000");
});
