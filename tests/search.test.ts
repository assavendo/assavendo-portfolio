import test from "node:test";
import assert from "node:assert/strict";
import { applyFilters, buildDocs, facet, filtersToParams, norm, parseFilters, isAvailable, descendantSlugs } from "../lib/search.ts";
import type { Category, Product } from "../lib/types.ts";

const cats: Category[] = [
  { id: "c1", parent_id: null, slug: "electronique", name: "Électronique et informatique", kind: "physical", description: "", sellable: true, note: "", attributes: [], sort: 0 },
  { id: "c2", parent_id: "c1", slug: "smartphones", name: "Smartphones", kind: "physical", description: "", sellable: true, note: "", attributes: [], sort: 0 },
  { id: "c3", parent_id: null, slug: "livres-numeriques", name: "Livres numériques", kind: "digital", description: "", sellable: true, note: "", attributes: [], sort: 1 },
];
const base = { description: "", currency: "eur", features: [], images: [], demo_url: null, status: "published" as const, allow_comments: true, allow_reviews: true, created_at: "2026-01-01T00:00:00Z" };
const P = (o: Partial<Product> & { id: string; title: string }): Product => ({ ...base, slug: o.id, summary: "Un produit de démonstration.", kind: "physical", price_cents: 10000, published_at: "2026-02-01T00:00:00Z", ...o }) as Product;
const products = [
  P({ id: "a", title: "Téléphone Alpha", category_id: "c2", price_cents: 29900, attributes: { ram_go: "8" }, track_stock: true, stock_qty: 2, published_at: "2026-03-01T00:00:00Z" }),
  P({ id: "b", title: "Smartphone Bêta", category_id: "c2", price_cents: 49900, attributes: { ram_go: "12" }, track_stock: true, stock_qty: 0 }),
  P({ id: "c", title: "Guide du référencement", kind: "digital", category_id: "c3", price_cents: 1900, tags: ["seo"] }),
];
const docs = buildDocs(products, cats, []);
const run = (sp: Record<string, string>, v = new Map()) => applyFilters(docs, parseFilters(sp), cats, [], v).items.map((p) => p.id);

test("normalisation : accents, casse, apostrophes", () => { assert.equal(norm("  L’Été  À Paris "), "l ete a paris"); });
test("recherche insensible aux accents et à la casse", () => { assert.deepEqual(run({ q: "TELEPHONE" }), ["a", "b"]); });
test("synonymes : « mobile » trouve smartphone", () => { assert.ok(run({ q: "mobile" }).includes("b")); });
test("faute de frappe simple tolérée, mot court non", () => { assert.deepEqual(run({ q: "telephne" }), ["a"]); assert.deepEqual(run({ q: "zzq" }), []); });
test("tous les mots doivent correspondre (ET)", () => { assert.deepEqual(run({ q: "guide alpha" }), []); assert.deepEqual(run({ q: "guide seo" }), ["c"]); });
test("préfixe", () => { assert.deepEqual(run({ q: "refer" }), ["c"]); });
test("catégorie parente inclut ses enfants", () => { assert.deepEqual(run({ cat: "electronique" }).sort(), ["a", "b"]); assert.deepEqual([...descendantSlugs(cats, ["electronique"])].sort(), ["electronique", "smartphones"]); });
test("filtre de type et de prix (en euros)", () => { assert.deepEqual(run({ type: "digital" }), ["c"]); assert.deepEqual(run({ min: "250", max: "300" }), ["a"]); });
test("filtre d'attribut", () => { assert.deepEqual(run({ a_ram_go: "12" }), ["b"]); assert.deepEqual(run({ a_ram_go: "8,12" }).sort(), ["a", "b"]); });
test("en stock : exclut le stock à zéro, garde le numérique", () => { assert.deepEqual(run({ stock: "1" }).sort(), ["a", "c"]); });
test("disponibilité avec variantes", () => { assert.equal(isAvailable(products[1], [{ stock_qty: 4, active: true }]), true); assert.equal(isAvailable(products[1], [{ stock_qty: 4, active: false }]), false); });
test("tris", () => { assert.deepEqual(run({ tri: "prix-asc" }), ["c", "a", "b"]); assert.deepEqual(run({ tri: "prix-desc" }), ["b", "a", "c"]); assert.equal(run({ tri: "nouveautes" })[0], "a"); });
test("paramètres invalides ignorés (pas d'injection de tri/type)", () => { const f = parseFilters({ tri: "drop", type: "x", min: "-3", max: "abc" }); assert.equal(f.sort, "pertinence"); assert.equal(f.kind, ""); assert.equal(f.min, null); assert.equal(f.max, null); });
test("aller-retour URL", () => { const f = parseFilters({ q: "alpha", cat: "smartphones", min: "10", a_ram_go: "8", tri: "prix-asc", stock: "1" }); assert.deepEqual(parseFilters(Object.fromEntries(filtersToParams(f))), f); });
test("facettes comptées", () => { assert.deepEqual(facet(products, "ram_go").map((x) => [x.value, x.count]), [["8", 1], ["12", 1]]); });
