import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp, robotsRulesAllow, parseTarget } from "../lib/safe-fetch.ts";
import { analyzeHeaders } from "../lib/tools/security-headers.ts";
import { analyzeSpf, analyzeDmarc } from "../lib/tools/email-auth.ts";
import { sampleSize, significance, normCdf } from "../lib/tools/abtest.ts";
import { roasModel } from "../lib/tools/finance.ts";
import { analyzeSeo } from "../lib/tools/seo.ts";

test("SSRF : adresses internes refusées", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
});
test("SSRF : cibles refusées", () => {
  for (const u of ["http://localhost", "http://127.0.0.1", "https://exemple.local", "ftp://exemple.fr", "https://user:pw@exemple.fr", "https://exemple.fr:8080", "http://metadata"]) assert.throws(() => parseTarget(u), u);
  assert.equal(parseTarget("exemple.fr").protocol, "https:");
});
test("robots.txt", () => {
  assert.equal(robotsRulesAllow("User-agent: *\nDisallow: /prive", "/prive/a"), false);
  assert.equal(robotsRulesAllow("User-agent: *\nDisallow: /prive", "/public"), true);
  assert.equal(robotsRulesAllow("User-agent: *\nDisallow: /\nAllow: /ok", "/ok/x"), true);
  assert.equal(robotsRulesAllow("User-agent: autre\nDisallow: /", "/"), true);
});
test("en-têtes de sécurité", () => {
  const bad = analyzeHeaders({}, false); assert.equal(bad.grade, "E");
  const good = analyzeHeaders({ "strict-transport-security": "max-age=63072000", "content-security-policy": "default-src 'self'; frame-ancestors 'none'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "permissions-policy": "camera=()" }, true);
  assert.equal(good.grade, "A");
});
test("SPF et DMARC", () => {
  assert.equal(analyzeSpf([]).issues[0].level, "erreur");
  assert.ok(analyzeSpf(["v=spf1 include:a.com -all"]).issues.some((i) => i.level === "ok"));
  assert.ok(analyzeSpf(["v=spf1 +all"]).issues.some((i) => i.level === "erreur"));
  assert.ok(analyzeSpf(["v=spf1 -all", "v=spf1 ~all"]).issues.some((i) => /Plusieurs/.test(i.text)));
  assert.ok(analyzeDmarc(["v=DMARC1; p=none"]).issues.some((i) => /p=none/.test(i.text)));
  assert.ok(analyzeDmarc(["v=DMARC1; p=reject; rua=mailto:a@b.fr"]).issues.every((i) => i.level === "ok"));
});
test("test A/B : taille d'échantillon connue", () => {
  const n = sampleSize(5, 20); assert.ok(n > 8000 && n < 9500, String(n)); // ≈ 8 150 par variante
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 0.001);
  const s = significance(1000, 50, 1000, 70); assert.ok(s.pValue > 0.05 && s.pValue < 0.1);
});
test("ROAS d'équilibre", () => {
  const r = roasModel({ price: 100, productCost: 40, shipping: 0, paymentFeePct: 0, paymentFeeFixed: 0, returnRatePct: 0, monthlyBudget: 1000 });
  assert.equal(r.unitMargin, 60); assert.ok(Math.abs((r.breakevenRoas ?? 0) - 1 / 0.6) < 1e-9);
});
test("SEO : détection des défauts", () => {
  const r = analyzeSeo("<html><head></head><body><h1>A</h1><h1>B</h1><img src=x></body></html>", "https://exemple.fr/");
  assert.ok(r.issues.some((i) => /title/.test(i.text))); assert.equal(r.images.missingAlt, 1); assert.equal(r.h1.length, 2); assert.ok(r.score < 50);
});
test("SEO : entités HTML décodées", () => {
  const r = analyzeSeo("<html lang=fr><head><title>Un titre assez long pour le test</title><meta name=description content=\"L&#39;été &amp; la mer\"></head><body><h1>x</h1></body></html>", "https://exemple.fr/");
  assert.equal(r.description, "L'été & la mer");
});
