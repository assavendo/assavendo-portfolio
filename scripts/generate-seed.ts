// Génère supabase/seed/001_contenu.sql de façon SÛRE :
//  - les domaines (mis à jour) ;
//  - les fiches rédigées de content/problems.ts : publiées, JAMAIS écrasées si elles existent déjà (les retouches faites dans l'administration sont conservées) ;
//  - les fiches de content/drafts.ts : toujours en BROUILLON, sans outil.
// Le script REFUSE de générer le fichier si une règle de lib/content-rules.ts est violée. Aucune dépendance externe au dépôt.
import { readFileSync, writeFileSync } from "node:fs";
import { domains } from "../content/domains.ts";
import { problems } from "../content/problems.ts";
import { drafts } from "../content/drafts.ts";
import { slugProblem, validatePublishable } from "../lib/content-rules.ts";

const q = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);
const arr = (a: string[]) => `array[${a.map(q).join(",")}]::text[]`;
const domainSlugs = new Set<string>(domains.map((d) => d.slug));
const dom = (slug: string) => `(select id from public.domains where slug = ${q(slug)})`;

const errors: string[] = [];
const seen = new Set<string>();
for (const p of problems) {
  if (seen.has(p.slug)) errors.push(`${p.slug} : slug en double`); seen.add(p.slug);
  if (!domainSlugs.has(p.domain)) errors.push(`${p.slug} : domaine inconnu « ${p.domain} »`);
  for (const e of validatePublishable({ ...p, tool_key: p.tool_key ?? null, tool_intro: p.tool_intro ?? "" })) errors.push(`${p.slug} : ${e}`);
}
for (const d of drafts) {
  if (seen.has(d.slug)) errors.push(`${d.slug} : slug en double`); seen.add(d.slug);
  const s = slugProblem(d.slug); if (s) errors.push(`${d.slug} : ${s}`);
  if (!domainSlugs.has(d.domain)) errors.push(`${d.slug} : domaine inconnu « ${d.domain} »`);
  if (d.title.trim().length < 4) errors.push(`${d.slug} : titre trop court`);
}
if (errors.length) {
  console.error(`Seed refusé (${errors.length} erreur${errors.length > 1 ? "s" : ""}) :\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

const out: string[] = [
  "-- Fichier généré par scripts/generate-seed.ts : ne pas modifier à la main.",
  "-- Idempotent : rejouable sans risque. Les fiches existantes ne sont jamais écrasées ni republiées.",
  "begin;",
];
for (const d of domains) out.push(`insert into public.domains (slug, name, intro, sort) values (${q(d.slug)}, ${q(d.name)}, ${q(d.intro)}, ${d.sort}) on conflict (slug) do update set name = excluded.name, intro = excluded.intro, sort = excluded.sort;`);

for (const p of problems) {
  out.push(`insert into public.problems (slug, domain_id, title, hook, who, symptom, cost, cause, what_we_do, deliverables, outcome, stack, audiences, format, tool_key, tool_intro, status, featured, sort, published_at)
values (${q(p.slug)}, ${dom(p.domain)}, ${q(p.title)}, ${q(p.hook)}, ${q(p.who)}, ${q(p.symptom)}, ${q(p.cost)}, ${q(p.cause)}, ${q(p.what_we_do)}, ${arr(p.deliverables)}, ${q(p.outcome)}, ${arr(p.stack)}, ${arr(p.audiences)}, '${p.format}', ${q(p.tool_key ?? null)}, ${q(p.tool_intro ?? "")}, 'published', ${p.featured ? "true" : "false"}, ${p.sort}, now())
on conflict (slug) do nothing;`);
}
for (const d of drafts) {
  out.push(`insert into public.problems (slug, domain_id, title, who, symptom, cause, what_we_do, stack, audiences, format, tool_key, status, featured, sort)
values (${q(d.slug)}, ${dom(d.domain)}, ${q(d.title)}, ${q(d.who)}, ${q(d.symptom)}, ${q(d.cause)}, ${q(d.what_we_do)}, ${arr(d.stack)}, ${arr(d.audiences)}, 'study', null, 'draft', false, ${d.sort})
on conflict (slug) do nothing;`);
}
out.push(`-- ${problems.length} fiches rédigées publiées, ${drafts.length} brouillons`, "commit;");
const sql = out.join("\n") + "\n";
if (process.argv.includes("--check")) {
  // Mode CI : le fichier versionné doit être exactement celui que produit le contenu actuel.
  if (readFileSync("supabase/seed/001_contenu.sql", "utf8") !== sql) { console.error("supabase/seed/001_contenu.sql n'est pas à jour : exécutez « npm run seed:problems » et versionnez le résultat."); process.exit(1); }
} else writeFileSync("supabase/seed/001_contenu.sql", sql);
console.log(`ok : ${problems.length} publiées, ${drafts.length} brouillons, ${domains.length} domaines`);
