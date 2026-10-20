import test from "node:test";
import assert from "node:assert/strict";
import { parsePagespeed } from "../lib/tools/pagespeed.ts";
import { analyzeDkim, emailScore, analyzeSpf, analyzeDmarc, DKIM_SELECTORS } from "../lib/tools/email-auth.ts";

const fixture = {
  lighthouseResult: {
    finalDisplayedUrl: "https://exemple.fr/", categories: { performance: { score: 0.42 } },
    audits: {
      "largest-contentful-paint": { numericValue: 4800 }, "first-contentful-paint": { numericValue: 1700 },
      "total-blocking-time": { numericValue: 650 }, "cumulative-layout-shift": { numericValue: 0.05 },
      "uses-optimized-images": { title: "Encoder efficacement les images", description: "Des images optimisées se chargent plus vite. [En savoir plus](https://x).", details: { type: "opportunity", overallSavingsMs: 1800 } },
      "render-blocking-resources": { title: "Éliminer les ressources qui bloquent le rendu", description: "Des ressources bloquent le premier affichage.", details: { type: "opportunity", overallSavingsMs: 900 } },
      "unused-javascript": { title: "Réduire le JavaScript inutilisé", description: "Réduisez le JavaScript inutilisé.", details: { type: "opportunity", overallSavingsMs: 400 } },
      "dom-size": { title: "Éviter une taille excessive du DOM", score: 0.3, scoreDisplayMode: "numeric", displayValue: "2 400 éléments", details: { type: "table" } },
    },
  },
  loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 310, category: "AVERAGE" } } },
};
test("PageSpeed : note, indicateurs, notes qualitatives et 3 corrections triées", () => {
  const r = parsePagespeed(fixture);
  assert.equal(r.score, 42); assert.equal(r.grade, "D");
  const m = Object.fromEntries(r.metrics.map((x) => [x.id, x]));
  assert.equal(m.lcp.rating, "poor"); assert.equal(m.fcp.rating, "good"); assert.equal(m.tbt.rating, "poor"); assert.equal(m.cls.rating, "good");
  assert.equal(m.lcp.display, "4,8 s");
  assert.equal(r.opportunities.length, 3);
  assert.deepEqual(r.opportunities.map((o) => o.savingsMs), [1800, 900, 400]);
  assert.ok(!r.opportunities[0].detail.includes("](")); // liens Markdown retirés
  assert.equal(r.field?.inp?.value, 310);
});
test("PageSpeed : réponse inexploitable refusée", () => {
  assert.throws(() => parsePagespeed({})); assert.throws(() => parsePagespeed({ lighthouseResult: { categories: {} } }));
});
test("DKIM : clés détectées ou limite honnête", () => {
  assert.ok(DKIM_SELECTORS.length >= 10);
  const ok = analyzeDkim([{ selector: "google", record: "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA" }], 19);
  assert.equal(ok.issue.level, "ok"); assert.equal(ok.found.length, 1);
  const none = analyzeDkim([], 19); assert.equal(none.issue.level, "avertissement"); assert.match(none.issue.fix ?? "", /sélecteur/);
  const spf = analyzeSpf(["v=spf1 include:_spf.google.com -all"]); const dm = analyzeDmarc(["v=DMARC1; p=reject; rua=mailto:d@exemple.fr"]);
  assert.equal(emailScore(spf, dm, ok), 100); assert.equal(emailScore(spf, dm, none), 95);
});
