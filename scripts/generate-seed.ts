// Génère supabase/seed/001_contenu.sql :
//  - les domaines ;
//  - les problèmes rédigés (publiés) ;
//  - les autres fiches du cahier des charges importées en BROUILLON, à réécrire depuis l'administration.
import { readFileSync, writeFileSync } from "node:fs";
import { domains } from "../content/domains.ts";
import { problems } from "../content/problems.ts";

const q = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);
const arr = (a: string[]) => `array[${a.map(q).join(",")}]::text[]`;
const slugify = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const out: string[] = ["-- Fichier généré par scripts/generate-seed.ts : ne pas modifier à la main.", "begin;"];

for (const d of domains) out.push(`insert into public.domains (slug, name, intro, sort) values (${q(d.slug)}, ${q(d.name)}, ${q(d.intro)}, ${d.sort}) on conflict (slug) do update set name = excluded.name, intro = excluded.intro, sort = excluded.sort;`);

const dom = (slug: string) => `(select id from public.domains where slug = ${q(slug)})`;
const rewritten = new Set<string>();
// Numéros des fiches d'origine déjà réécrites ci-dessus (ne servent qu'à éviter les doublons à l'import).
const coveredOriginals = new Set(["01", "02", "11", "21", "22", "28", "30", "32", "37", "44", "52", "56", "62", "100"]);
for (const p of problems) {
  rewritten.add(p.slug);
  out.push(`insert into public.problems (slug, domain_id, title, hook, who, symptom, cost, cause, what_we_do, deliverables, outcome, stack, audiences, format, tool_key, tool_intro, status, featured, sort, published_at)
values (${q(p.slug)}, ${dom(p.domain)}, ${q(p.title)}, ${q(p.hook)}, ${q(p.who)}, ${q(p.symptom)}, ${q(p.cost)}, ${q(p.cause)}, ${q(p.what_we_do)}, ${arr(p.deliverables)}, ${q(p.outcome)}, ${arr(p.stack)}, ${arr(p.audiences)}, '${p.format}', ${q(p.tool_key)}, ${q(p.tool_intro ?? "")}, 'published', ${p.featured ? "true" : "false"}, ${p.sort}, now())
on conflict (slug) do nothing;`);
}

// Import des fiches restantes du dépôt d'origine, en brouillon.
try {
  const src = readFileSync(process.argv[2] ?? "../assavendo-portfolio/client/src/data/portfolio-examples.ts", "utf8");
  const codeToDomain: Record<string, string> = { A: "sites-performance-referencement", B: "e-commerce-paiements", C: "securite-conformite-fiabilite", D: "marketing-acquisition", E: "contenu-video-design", F: "automatisation-ia", G: "donnees-finance-gestion", H: "formation-produits-numeriques", I: "services-rh-metiers", J: "multilingue-accessibilite" };
  const body = src.slice(src.indexOf("export const portfolioExamples"));
  const objs = body.split(/\n  \{\n/).slice(1);
  const field = (o: string, k: string) => o.match(new RegExp(`\\n    ${k}: "((?:[^"\\\\]|\\\\.)*)"`))?.[1]?.replace(/\\"/g, '"').replace(/\\'/g, "'");
  let n = 0;
  for (const o of objs) {
    const title = field(o, "title"); const code = field(o, "categoryCode"); const kind = field(o, "kind");
    if (!title || !code) continue;
    if (coveredOriginals.has(field(o, "number") ?? "")) continue;
    const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
    const slug = slugify(title);
    if ([...rewritten].some((r) => r === slug)) continue;
    const isTool = kind === "CRÉER";
    // Brouillon : sans outil rattaché tant qu'il n'est pas réellement construit.
    out.push(`insert into public.problems (slug, domain_id, title, who, symptom, cause, what_we_do, stack, audiences, format, status, sort)
values (${q(slug)}, ${dom(codeToDomain[code])}, ${q(title)}, ${q(cap(field(o, "audience")))}, ${q(cap(field(o, "problem")))}, ${q(cap(field(o, "cause")))}, ${q(cap(field(o, "solution")))}, ${arr((field(o, "stack") ?? "").replace(/\.$/, "").split(/,\s*/).filter(Boolean))}, ${arr(/entreprise/.test(o.match(/audiences: \[([^\]]*)\]/)?.[1] ?? "") ? ["entreprise"] : ["particulier"])}, 'study', 'draft', ${1000 + n++})
on conflict (slug) do nothing;`);
    void isTool;
  }
  out.push(`-- ${n} fiches importées en brouillon`);
} catch (e) { out.push(`-- import des brouillons ignoré : ${(e as Error).message}`); }

out.push("commit;");
writeFileSync("supabase/seed/001_contenu.sql", out.join("\n") + "\n");
console.log("ok", out.length, "instructions");
