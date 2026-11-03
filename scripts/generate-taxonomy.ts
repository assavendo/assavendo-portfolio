// Génère supabase/seed/002_categories.sql depuis content/taxonomy.ts. Idempotent : ne réécrit jamais une catégorie existante
// (le propriétaire peut avoir validé une famille « sellable » dans l'administration).
import { readFileSync, writeFileSync } from "node:fs";
import { families } from "../content/taxonomy.ts";

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const out: string[] = ["-- Fichier généré par scripts/generate-taxonomy.ts : ne pas modifier à la main.", "-- Idempotent : les catégories existantes ne sont jamais écrasées.", "begin;"];
const slugs = new Set<string>();
let n = 0;
families.forEach((f, i) => {
  if (slugs.has(f.slug)) throw new Error(`slug en double : ${f.slug}`); slugs.add(f.slug);
  out.push(`insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values (${q(f.slug)}, ${q(f.name)}, '${f.kind}', ${q(f.description)}, ${f.sellable === false ? "false" : "true"}, ${q(f.note ?? "")}, ${q(JSON.stringify(f.attributes ?? []))}::jsonb, ${i * 10}) on conflict (slug) do nothing;`);
  f.children.forEach((c, j) => {
    if (slugs.has(c.slug)) throw new Error(`slug en double : ${c.slug}`); slugs.add(c.slug); n++;
    out.push(`insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = ${q(f.slug)}), ${q(c.slug)}, ${q(c.name)}, '${f.kind}', ${f.sellable === false ? "false" : "true"}, ${q(JSON.stringify(c.attributes ?? []))}::jsonb, ${j * 10}) on conflict (slug) do nothing;`);
  });
});
out.push(`-- ${families.length} familles, ${n} sous-catégories`, "commit;");
const sql = out.join("\n") + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync("supabase/seed/002_categories.sql", "utf8") !== sql) { console.error("supabase/seed/002_categories.sql n'est pas à jour : exécutez « npm run seed:categories »."); process.exit(1); }
} else writeFileSync("supabase/seed/002_categories.sql", sql);
console.log(`ok : ${families.length} familles, ${n} sous-catégories`);
