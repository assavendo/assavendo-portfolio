export type SeoIssue = { level: "critique" | "important" | "conseil"; text: string; fix: string };
export type SeoReport = {
  score: number; title: string | null; description: string | null; canonical: string | null; lang: string | null; robots: string | null;
  h1: string[]; headings: { h2: number; h3: number }; images: { total: number; missingAlt: number }; links: { internal: number; external: number };
  openGraph: boolean; jsonLd: boolean; viewport: boolean; wordCount: number; issues: SeoIssue[];
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " "));
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((v) => v !== undefined) ?? null;

export function analyzeSeo(html: string, pageUrl: string): SeoReport {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 20000);
  const body = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const metaByName = (n: string) => { const m = metas.find((t) => attr(t, "name")?.toLowerCase() === n); return m ? attr(m, "content") : null; };
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawDescription = metaByName("description");
  const description = rawDescription ? decode(rawDescription) : null;
  const robots = metaByName("robots");
  const canonicalTag = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => attr(t, "rel")?.toLowerCase() === "canonical");
  const canonical = canonicalTag ? attr(canonicalTag, "href") : null;
  const lang = html.match(/<html\b[^>]*>/i) ? attr(html.match(/<html\b[^>]*>/i)![0], "lang") : null;
  const h1 = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1])).filter(Boolean);
  const h2 = (body.match(/<h2\b/gi) ?? []).length; const h3 = (body.match(/<h3\b/gi) ?? []).length;
  const imgs = [...body.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = imgs.filter((t) => { const a = attr(t, "alt"); return a === null; }).length;
  let host = ""; try { host = new URL(pageUrl).hostname; } catch { /* ignoré */ }
  let internal = 0; let external = 0;
  for (const m of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href"); if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    try { new URL(href, pageUrl).hostname === host ? internal++ : external++; } catch { /* ignoré */ }
  }
  const text = strip(body); const wordCount = text ? text.split(/\s+/).length : 0;
  const openGraph = metas.some((t) => attr(t, "property")?.startsWith("og:"));
  const jsonLd = /<script[^>]+application\/ld\+json/i.test(html);
  const viewport = metas.some((t) => attr(t, "name")?.toLowerCase() === "viewport");

  const issues: SeoIssue[] = [];
  const add = (level: SeoIssue["level"], text: string, fix: string) => issues.push({ level, text, fix });
  const t = title ? decode(title) : null;
  if (!t) add("critique", "Aucune balise title.", "Ajouter un titre unique de 30 à 60 caractères qui contient la requête principale.");
  else if (t.length < 20 || t.length > 65) add("important", `Le titre fait ${t.length} caractères.`, "Viser 30 à 60 caractères pour qu'il s'affiche en entier dans les résultats.");
  if (!description) add("critique", "Aucune meta description.", "Rédiger 120 à 160 caractères qui donnent envie de cliquer et résument la page.");
  else if (description.length < 70 || description.length > 170) add("conseil", `La description fait ${description.length} caractères.`, "Viser 120 à 160 caractères.");
  if (/noindex/i.test(robots ?? "")) add("critique", "La page est en noindex : Google ne l'affichera pas.", "Retirer noindex si la page doit être trouvée.");
  if (h1.length === 0) add("critique", "Aucun titre principal (h1).", "Ajouter un seul h1 qui décrit le sujet de la page.");
  else if (h1.length > 1) add("important", `${h1.length} titres h1 sur la page.`, "Garder un seul h1 et structurer le reste avec h2 et h3.");
  if (!canonical) add("important", "Aucune adresse canonique déclarée.", "Ajouter <link rel=\"canonical\"> pour éviter les contenus en double.");
  if (!lang) add("important", "La langue de la page n'est pas déclarée.", "Ajouter lang=\"fr\" sur la balise html.");
  if (!viewport) add("critique", "Balise viewport absente : l'affichage mobile sera dégradé.", "Ajouter <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.");
  if (missingAlt) add("important", `${missingAlt} image(s) sans texte alternatif.`, "Décrire chaque image utile avec un attribut alt ; alt=\"\" pour les images décoratives.");
  if (wordCount < 250) add("important", `Seulement ${wordCount} mots de contenu visible.`, "Développer le contenu : une page utile répond complètement à la question du visiteur.");
  if (internal < 3) add("conseil", "Très peu de liens internes.", "Relier la page aux contenus voisins pour guider visiteurs et robots.");
  if (!openGraph) add("conseil", "Pas de balises de partage (Open Graph).", "Ajouter og:title, og:description et og:image pour des aperçus soignés sur les réseaux.");
  if (!jsonLd) add("conseil", "Aucune donnée structurée JSON-LD.", "Ajouter le balisage adapté (Organization, LocalBusiness, Product, FAQ).");

  const penalty = issues.reduce((s, i) => s + (i.level === "critique" ? 16 : i.level === "important" ? 8 : 3), 0);
  return { score: Math.max(0, 100 - penalty), title: t, description, canonical, lang, robots, h1, headings: { h2, h3 }, images: { total: imgs.length, missingAlt }, links: { internal, external }, openGraph, jsonLd, viewport, wordCount, issues };
}
