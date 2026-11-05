import test from "node:test";
import assert from "node:assert/strict";
import { extractSupplierProduct, safeSupplierText } from "../lib/dropship/source.ts";
import { FetchRefused, safeFetch } from "../lib/safe-fetch.ts";

const url = "https://wholesale.example/items/lamp";

test("extrait une fiche JSON-LD et borne les champs sans exécuter le HTML", () => {
  const html = `<!doctype html><html><head><title>Lampe &amp; support</title>
    <meta property="og:image" content="/images/cover.webp">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Lampe de bureau","description":"Lampe &lt;strong&gt;noire&lt;/strong&gt; rechargeable","brand":{"@type":"Brand","name":"Atelier Test"},"sku":"AB-12","gtin13":"1234567890123","image":["https://cdn.wholesale.example/lamp.png","http://127.0.0.1/private.png"],"offers":{"@type":"Offer","price":"29.95","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>
    <script>globalThis.compromised = true</script></head><body><h1>ignored body</h1></body></html>`;
  const result = extractSupplierProduct(html, url, "Lampe demandée");
  assert.equal(result.product_name, "Lampe de bureau");
  assert.equal(result.description, "Lampe noire rechargeable");
  assert.equal(result.brand, "Atelier Test");
  assert.equal(result.sku, "AB-12");
  assert.equal(result.gtin, "1234567890123");
  assert.equal(result.supplier_price, 29.95);
  assert.equal(result.currency, "EUR");
  assert.deepEqual(result.images.map((i) => i.url), ["https://cdn.wholesale.example/lamp.png", "https://wholesale.example/images/cover.webp"]);
  assert.equal(result.content_sha256.length, 64);
  assert.equal("body" in result, false);
});

test("retombe sur les métadonnées et le nom demandé si JSON-LD absent", () => {
  const result = extractSupplierProduct('<meta name="description" content="&lt;b&gt;Article public&lt;/b&gt;"><meta property="og:title" content="Objet &amp; outil">', url, "Nom choisi");
  assert.equal(result.product_name, "Objet & outil");
  assert.equal(result.description, "Article public");
  assert.equal(result.supplier_price, null);
  assert.deepEqual(result.images, []);
});

test("ignore les URL d’image en HTTP et les URL avec identifiants", () => {
  const html = `<meta property="og:image" content="http://cdn.example/item.png"><script type="application/ld+json">{"@type":"Product","name":"Objet","image":["https://user:pass@cdn.example/a.png","https://cdn.example/b.png"]}</script>`;
  const result = extractSupplierProduct(html, url, "Objet");
  assert.deepEqual(result.images.map((i) => i.url), ["https://cdn.example/b.png"]);
});

test("écarte les URL d’image signées et HTTPS-only refuse HTTP avant connexion", async () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Objet","image":["https://cdn.example/private.png?X-Amz-Signature=secret","https://cdn.example/public.png?v=2"]}</script>`;
  assert.deepEqual(extractSupplierProduct(html, url, "Objet").images.map((i) => i.url), ["https://cdn.example/public.png?v=2"]);
  await assert.rejects(() => safeFetch("http://example.com/item", { httpsOnly: true }), (error) => error instanceof FetchRefused);
});

test("nettoie les entités et caractères de contrôle", () => {
  assert.equal(safeSupplierText(" <b>texte</b> &quot;ok&quot;\u0000 ", 40), 'texte "ok"');
  assert.equal(safeSupplierText("x".repeat(20), 5), "xxxxx");
});
