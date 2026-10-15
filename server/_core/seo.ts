import { desc, eq } from "drizzle-orm";
import { portfolioCategories, portfolioExamples } from "../../client/src/data/portfolio-examples";
import { getDb } from "../db";
import { products } from "../../drizzle/schema";

const SITE_NAME = "Assavendo";
const HERO_IMAGE = "/manus-storage/async-images/TFbA7al6ORF4nnmaavF8Gg/image-1.webp";

type SeoPage = {
  status: number;
  title: string;
  description: string;
  body: string;
  type?: "website" | "product";
  image?: string | null;
  noindex?: boolean;
  keywords?: string[];
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const clipped = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
const text = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>");

function publicOrigin() {
  const raw = process.env.PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

function htmlDocument(template: string, path: string, page: SeoPage) {
  const origin = publicOrigin();
  const canonical = origin ? new URL(path, origin).toString() : null;
  const imageUrl = origin && page.image
    ? (page.image.startsWith("https://") ? page.image : new URL(page.image, origin).toString())
    : null;
  const keywords = page.keywords?.length ? page.keywords.slice(0, 8).join(", ") : null;
  const removeOldTags = (head: string) => head
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+(?:name|property)=["'](?:description|robots|keywords|og:[^"']+|twitter:[^"']+)["'][^>]*\/?\s*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*\/?\s*>/gi, "");
  const headTags = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}" />` : "",
    page.noindex ? `<meta name="robots" content="noindex,follow" />` : `<meta name="robots" content="index,follow" />`,
    `<meta property="og:type" content="${page.type ?? "website"}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : "",
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : "",
    imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : "",
    `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : "",
  ].filter(Boolean).join("\n    ");

  let html = template.replace(/<head>([\s\S]*?)<\/head>/i, (_match, head: string) => `<head>${removeOldTags(head)}\n    ${headTags}\n  </head>`);
  html = html.replace(/<div\s+id=["']root["']\s*>[\s\S]*?<\/div>/i, `<div id="root">${page.body}</div>`);
  return { html, status: page.status };
}

function nav() {
  return `<header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="Assavendo, accueil"><span class="brand-mark"><span></span></span><span class="brand-word">assavendo<span class="brand-dot">.</span><small>STUDIO DIGITAL</small></span></a><nav class="main-nav"><a class="nav-link" href="/portfolio">Portfolio</a><a class="nav-link" href="/boutique">Boutique</a><a class="nav-cta" href="/#contact">Parlons de votre projet →</a></nav></div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="footer-bottom"><span>© ${new Date().getFullYear()} Assavendo</span><span>Création numérique & commerce</span></div></footer>`;
}

function homePage(): SeoPage {
  const items = portfolioExamples.slice(0, 3).map(example => `<article class="example-card"><div class="example-art art-${example.id % 8}"><span class="art-number">${example.number}</span><span class="art-word">${escapeHtml(example.title.slice(0, 1))}</span><span class="art-category">${escapeHtml(example.category)}</span></div><div class="example-card-body"><span class="eyebrow">${escapeHtml(example.category)}</span><h2><a href="/exemples/${escapeHtml(example.slug)}">${escapeHtml(example.title)}</a></h2><p>${escapeHtml(example.tagline)}</p><a class="text-link" href="/exemples/${escapeHtml(example.slug)}">Découvrir le concept →</a></div></article>`).join("");
  const body = `<div class="site-shell">${nav()}<main><section class="hero-section"><div class="hero-copy"><span class="eyebrow hero-eyebrow"><i class="eyebrow-line"></i> STUDIO DIGITAL INDÉPENDANT · FRANCE</span><h1>Des idées claires.<br><em>Des expériences</em><br>qui font avancer.</h1><p class="hero-lede">Assavendo transforme des idées numériques en expériences de marque, produits et commerce qui donnent envie d’agir.</p><div class="hero-actions"><a class="button button-primary" href="/portfolio">Explorer le portfolio →</a><a class="button button-outline" href="/#contact">Présenter un projet</a></div><div class="hero-proof"><span class="proof-mark">A</span><span>Un studio digital indépendant, concentré sur la clarté et l’impact utile.</span></div></div><div class="hero-visual"><img src="${HERO_IMAGE}" alt="Illustration architecturale originale bleu pétrole et ivoire" /><span class="hero-index"><span>01 / 04</span><small>VISION & EXÉCUTION</small></span></div></section><section class="proof-strip"><div><strong>100</strong><span>concepts à explorer</span></div><div><strong>10</strong><span>univers business</span></div><div><strong>01</strong><span>studio indépendant</span></div><a href="/portfolio">Voir les projets →</a></section><section class="section"><div class="section-heading"><div><span class="eyebrow">CE QUE NOUS CONSTRUISONS</span><h2>Le numérique, <em>bien pensé.</em></h2></div><p>Des expériences utiles qui relient une idée à son public, puis à une action concrète.</p></div><div class="service-list"><article class="service-row"><span class="service-index">01</span><span class="service-icon">01</span><div><h3>Identité & présence digitale</h3><p>Une marque lisible, une histoire cohérente et une vitrine qui inspire confiance.</p></div><span class="service-tags">Positionnement · Design · Contenu</span></article><article class="service-row"><span class="service-index">02</span><span class="service-icon">02</span><div><h3>Produits & expériences web</h3><p>Des prototypes interactifs, des plateformes utiles et des parcours intuitifs.</p></div><span class="service-tags">UX · Développement · Produit</span></article><article class="service-row"><span class="service-index">03</span><span class="service-icon">03</span><div><h3>Commerce & conversion</h3><p>Des fiches produit et des parcours d’achat conçus pour être clairs et rassurants.</p></div><span class="service-tags">E-commerce · Paiement · Optimisation</span></article></div></section><section class="section featured-section"><div class="section-heading"><div><span class="eyebrow">SÉLECTION DE CONCEPTS</span><h2>Cent façons de <em>commencer.</em></h2></div><a class="text-link" href="/portfolio">Voir les 100 concepts →</a></div><div class="example-grid">${items}</div><div class="collection-note"><strong class="collection-note-number">100</strong><p>Un catalogue de concepts fictifs imaginés pour explorer des pistes de produit, d’expérience et de commerce — des prototypes de portfolio, pas des clients ou résultats réels.</p><a class="button button-outline" href="/portfolio">Explorer les catégories →</a></div></section><section class="shop-callout"><div class="shop-callout-inner"><div><span class="eyebrow eyebrow-light">BOUTIQUE ASSAVENDO</span><h2>Des créations<br><em>à adopter.</em></h2><p>Découvrez les produits réellement proposés à la vente. Les démonstrations du portfolio restent distinctes de la boutique.</p><a class="button button-light" href="/boutique">Découvrir la boutique →</a></div><div class="shop-callout-mark"><span>A</span><i></i><b></b></div></div></section><section id="contact" class="section"><span class="eyebrow">VOTRE PROJET COMMENCE ICI</span><h2>Parlons de <em>la suite.</em></h2><p>Partagez votre idée et votre contexte ; Assavendo vous répondra par e-mail.</p><form class="contact-form" action="/" method="get"><label>Nom<input name="name" placeholder="Votre nom" /></label><label>E-mail<input name="email" placeholder="vous@exemple.fr" /></label><label>Votre projet<textarea name="message" rows="3" placeholder="Quel résultat souhaitez-vous obtenir ?"></textarea></label><button class="button button-primary" type="submit">Préparer ma demande →</button></form></section></main>${footer()}</div>`;
  return { status: 200, title: "Assavendo — Studio digital indépendant", description: "Portfolio digital, 100 concepts de business et créations e-commerce. Explorez les prototypes Assavendo et découvrez la boutique.", body, image: HERO_IMAGE, keywords: ["studio digital", "portfolio web", "e-commerce", "prototypes interactifs", "Assavendo"] };
}

function portfolioPage(): SeoPage {
  const categories = portfolioCategories.map(category => {
    const entries = portfolioExamples.filter(example => example.category === category.name);
    return `<section class="seo-category"><h2>${escapeHtml(category.name)}</h2><p>${escapeHtml(category.intro)}</p><div class="example-grid">${entries.map(example => `<article class="example-card"><div class="example-art art-${example.id % 8}"><span class="art-number">${example.number}</span><span class="art-word">${escapeHtml(example.title.slice(0, 1))}</span><span class="art-category">${escapeHtml(example.category)}</span></div><div class="example-card-body"><span class="eyebrow">${escapeHtml(example.category)}</span><h3><a href="/exemples/${escapeHtml(example.slug)}">${escapeHtml(example.title)}</a></h3><p>${escapeHtml(example.tagline)}</p><div class="card-actions"><a class="text-link" href="/exemples/${escapeHtml(example.slug)}">Découvrir le concept →</a><a class="icon-link" href="/demos/${escapeHtml(example.slug)}" aria-label="Tester le prototype">↗</a></div></div></article>`).join("")}</div></section>`;
  }).join("");
  const body = `<div class="site-shell">${nav()}<main><header class="page-intro"><div><span class="eyebrow">PORTFOLIO · 10 CATÉGORIES</span><h1>100 pistes.<br><em>Un terrain de jeu.</em></h1><p>Explorez des concepts de business en ligne imaginés par Assavendo. Chaque fiche ouvre un prototype interactif à tester directement sur le site.</p></div><div class="portfolio-count-card"><span>COLLECTION</span><strong>100</strong><small>concepts fictifs à explorer</small></div></header><div class="section catalog-section"><p class="catalog-disclaimer">Ces concepts sont des exemples de portfolio ; ils ne représentent pas des clients, des entreprises existantes ni des résultats commerciaux réels.</p>${categories}</div></main>${footer()}</div>`;
  return { status: 200, title: "100 concepts de business — Portfolio Assavendo", description: "Découvrez 100 concepts de business en ligne répartis en 10 catégories, avec fiches détaillées et prototypes interactifs à tester.", body, keywords: ["concepts business", "portfolio digital", "prototypes web", "idées e-commerce", "Assavendo"] };
}

function examplePage(slug: string): SeoPage | null {
  const example = portfolioExamples.find(entry => entry.slug === slug);
  if (!example) return null;
  const body = `<div class="site-shell">${nav()}<main><div class="detail-topline"><a class="back-link" href="/portfolio">← Retour aux concepts</a><span class="status-badge"><i></i> PROTOTYPE DE PORTFOLIO</span></div><section class="example-detail-hero"><div class="detail-art art-${example.id % 8}"><span class="detail-art-number">${example.number} / 100</span><i class="art-orbit orbit-one"></i><i class="art-orbit orbit-two"></i><span class="detail-art-initials">${escapeHtml(example.title.slice(0, 1))}</span><span class="detail-art-label">${escapeHtml(example.category)}</span></div><div class="detail-heading"><span class="eyebrow">${escapeHtml(example.category)} · CONCEPT N° ${example.number}</span><h1>${escapeHtml(example.title)}</h1><p class="detail-tagline">${escapeHtml(example.tagline)}</p><span class="detail-audience"><span>POUR QUI ?</span>${escapeHtml(example.audience)}</span><a class="button button-primary" href="/demos/${escapeHtml(example.slug)}">Tester le prototype interactif →</a><small class="demo-note">Exemple fictif — aucun achat ni service réel.</small></div></section><section class="detail-content-grid"><div><span class="eyebrow">L’IDÉE</span><h2>Une expérience plus<br><em>simple à choisir.</em></h2><p>${escapeHtml(example.tagline)} Le concept met en avant une proposition claire et un parcours numérique adapté à ses utilisateurs.</p><p>Ce cas est une démonstration de portfolio créée pour illustrer une piste de travail. Il ne constitue pas une entreprise cliente ou un résultat commercial vérifié.</p></div><div class="detail-pillars"><span class="eyebrow">PISTES D’EXPÉRIENCE</span>${example.pillars.map((pillar,index) => `<div class="pillar-row"><span>0${index+1}</span><p>${escapeHtml(pillar)}</p></div>`).join("")}<div class="pillar-audience"><span>PUBLIC VISÉ</span><p>${escapeHtml(example.audience)}</p></div></div></section></main>${footer()}</div>`;
  return { status: 200, title: clipped(`${example.title} — Exemple Assavendo`, 60), description: clipped(`${example.tagline} Découvrez le concept ${example.title} et testez son prototype interactif. Exemple fictif de portfolio Assavendo.`, 155), body, keywords: [example.category, "concept business", "prototype interactif", "portfolio Assavendo"] };
}

function demoPage(slug: string): SeoPage | null {
  const example = portfolioExamples.find(entry => entry.slug === slug);
  if (!example) return null;
  const body = `<div class="site-shell">${nav()}<main><div class="demo-page-topline"><a class="back-link" href="/exemples/${escapeHtml(example.slug)}">← Retour à la fiche</a><span class="prototype-pill"><i></i> DÉMONSTRATION FICTIVE</span></div><header class="demo-page-heading"><span class="eyebrow">${escapeHtml(example.category)} · PROTOTYPE</span><h1>${escapeHtml(example.title)}</h1><p>${escapeHtml(example.tagline)}</p></header><section class="demo-stage"><div class="demo-workspace"><div class="demo-chrome"><span class="demo-light"></span><span class="demo-light"></span><span class="demo-light"></span><span class="demo-url">demo.assavendo.fr / ${escapeHtml(example.slug)}</span><span class="demo-badge"><i></i> PROTOTYPE LOCAL</span></div><div class="demo-body"><div class="demo-brandline"><span class="mini-brand">${escapeHtml(example.title.slice(0,1))}</span>${escapeHtml(example.title)}<span class="demo-brand-muted">Concept de portfolio</span></div><div class="demo-content"><div class="demo-copy"><span class="eyebrow">${escapeHtml(example.category)}</span><h2>${escapeHtml(example.title)} — ${escapeHtml(example.tagline)}</h2><p>${escapeHtml(example.audience)}</p><p>La démonstration interactive s’ouvre après le chargement de l’application.</p><a class="button button-primary" href="/exemples/${escapeHtml(example.slug)}">Voir la fiche du concept →</a></div><div class="demo-product-art art-${example.id % 8}"><i class="art-orbit orbit-one"></i><i class="art-orbit orbit-two"></i><span class="product-monogram">${escapeHtml(example.title.slice(0,1))}</span></div></div></div></div></section><aside class="demo-info"><strong>Prototype de portfolio</strong><p>Cette démo simule une interaction. Elle ne vend pas un produit réel et n’enregistre aucune commande.</p></aside></main>${footer()}</div>`;
  return { status: 200, title: clipped(`Démo ${example.title} — Assavendo`, 60), description: clipped(`Testez le prototype interactif ${example.title}, un concept fictif de ${example.category.toLowerCase()} signé Assavendo.`, 150), body, noindex: true };
}

async function storePage(): Promise<SeoPage> {
  const database = await getDb();
  if (!database) return { status: 503, title: "Boutique momentanément indisponible — Assavendo", description: "La boutique Assavendo sera de nouveau disponible prochainement.", body: `<main class="store-empty"><h1>Boutique momentanément indisponible</h1><p>Réessayez dans quelques instants.</p></main>`, noindex: true };
  const rows = await database.select().from(products).where(eq(products.status, "published")).orderBy(desc(products.createdAt)).limit(60);
  const cards = rows.map(product => `<article class="product-card"><a class="product-card-art" href="/produits/${escapeHtml(product.slug)}">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" loading="lazy" />` : `<div class="product-placeholder"><span>${escapeHtml(product.title.slice(0,1))}</span><i></i><b></b></div>`}<span class="product-card-arrow">↗</span></a><div class="product-card-body"><span class="eyebrow">CRÉATION ASSAVENDO</span><h2><a href="/produits/${escapeHtml(product.slug)}">${escapeHtml(product.title)}</a></h2><p>${escapeHtml(product.summary)}</p><div class="product-card-bottom"><strong>${new Intl.NumberFormat("fr-FR", { style: "currency", currency: product.currency }).format(product.priceCents / 100)}</strong><a class="text-link" href="/produits/${escapeHtml(product.slug)}">Voir la fiche →</a></div></div></article>`).join("");
  const contents = rows.length ? `<div class="product-grid">${cards}</div>` : `<section class="store-empty"><div class="empty-bag">A</div><span class="eyebrow">LA BOUTIQUE ASSAVENDO</span><h1>Les premières créations arrivent bientôt.</h1><p>Les prototypes du portfolio sont des exemples ; la boutique ne présentera que les produits réellement mis en vente par Assavendo.</p><a class="button button-outline" href="/portfolio">Découvrir les concepts →</a></section>`;
  return { status: 200, title: "Boutique Assavendo — Produits & créations", description: "Parcourez les produits réellement proposés à la vente par Assavendo. Chaque fiche détaille la création, son prix et les conditions d’achat.", body: `<div class="site-shell">${nav()}<main><header class="page-intro store-intro"><div><span class="eyebrow">BOUTIQUE ASSAVENDO</span><h1>Des créations<br><em>à adopter.</em></h1><p>Une sélection de produits et services Assavendo. Chaque article en vente est distinct des concepts de démonstration du portfolio.</p></div><div class="store-intro-mark"><span>PRODUITS VÉRIFIÉS</span><strong>${rows.length.toString().padStart(2,"0")}</strong></div></header><section class="section store-section">${contents}</section></main>${footer()}</div>`, keywords: ["boutique Assavendo", "produits numériques", "créations e-commerce", "achat en ligne"] };
}

async function productPage(slug: string): Promise<SeoPage | null> {
  const database = await getDb();
  if (!database) return { status: 503, title: "Produit momentanément indisponible — Assavendo", description: "La fiche produit Assavendo sera de nouveau disponible prochainement.", body: `<main class="empty-state"><h1>Fiche momentanément indisponible</h1></main>`, noindex: true };
  const [product] = await database.select().from(products).where(eq(products.slug, slug)).limit(1);
  if (!product || product.status !== "published") return null;
  let features: string[] = [];
  try {
    const parsed: unknown = JSON.parse(product.features || "[]");
    if (Array.isArray(parsed)) features = parsed.filter((value): value is string => typeof value === "string").map(value => value.trim()).filter(Boolean).slice(0, 8);
  } catch {
    features = product.features?.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean).slice(0, 8) ?? [];
  }
  const price = new Intl.NumberFormat("fr-FR", { style: "currency", currency: product.currency }).format(product.priceCents / 100);
  const featureList = features.length ? `<ul>${features.map(feature => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>` : "";
  const demoUrl = product.demoUrl?.trim();
  const demoAction = demoUrl ? `<a class="button button-outline" href="${escapeHtml(demoUrl)}">Tester la démonstration →</a>` : "";
  const body = `<div class="site-shell">${nav()}<main><div class="detail-topline"><a class="back-link" href="/boutique">← Retour à la boutique</a></div><article class="product-detail-grid"><div class="product-detail-image">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" />` : `<div class="product-placeholder"><span>${escapeHtml(product.title.slice(0,1))}</span><i></i><b></b></div>`}</div><div class="product-detail-copy"><span class="eyebrow">CRÉATION ASSAVENDO</span><h1>${escapeHtml(product.title)}</h1><p class="product-summary">${escapeHtml(product.summary)}</p><strong class="product-price">${price}</strong><p class="product-stock-note">Paiement sécurisé. La commande est confirmée uniquement après validation du paiement par Stripe.</p><p>${text(product.description)}</p>${featureList}${demoAction}<a class="button button-primary" href="/boutique">Acheter via la fiche interactive →</a></div></article><section class="product-community"><h2>Questions et avis</h2><p>Les visiteurs peuvent commenter et donner leur avis sur la fiche produit.</p></section></main>${footer()}</div>`;
  const safeTitle = clipped(product.title, 45);
  return { status: 200, title: `${safeTitle} — Assavendo`, description: clipped(`${product.summary} Découvrez ${product.title}, son prix de ${price} et toutes les informations avant achat. Produit Assavendo.`, 155), body, type: "product", image: product.imageUrl, keywords: [product.title, "produit Assavendo", "boutique en ligne", "achat sécurisé"] };
}

function legalPage(path: string): SeoPage {
  const legal = path === "/mentions-legales"
    ? { title: "Mentions légales — Assavendo", heading: "Mentions légales", description: "Les mentions légales complètes d’Assavendo seront publiées après validation de l’identité et des coordonnées officielles de l’entreprise." }
    : path === "/confidentialite"
      ? { title: "Confidentialité — Assavendo", heading: "Politique de confidentialité", description: "Informations sur les données collectées, leur usage, leur durée de conservation et les moyens d’exercer vos droits." }
      : { title: "Conditions de vente — Assavendo", heading: "Conditions générales de vente", description: "Les conditions de vente définitives seront renseignées par Assavendo avant toute commercialisation." };
  const body = `<div class="site-shell">${nav()}<main class="legal-page"><span class="eyebrow">ASSAVENDO · DOCUMENT D’INFORMATION</span><h1>${escapeHtml(legal.heading)}</h1><p class="legal-intro">${escapeHtml(legal.description)}</p><aside class="legal-warning">Les textes ci-dessous sont des emplacements de préparation. Ils ne remplacent pas les informations juridiques applicables ni les conditions réelles de l’entreprise.</aside><section class="legal-section"><h2>À compléter avant publication commerciale</h2><p>Raison sociale, forme juridique, adresse, adresse e-mail, numéro d’immatriculation, numéro de TVA si applicable, hébergeur, responsable de publication, traitements de données, durées de conservation et modalités de contact.</p></section><a class="button button-outline" href="/">Retour à l’accueil →</a></main>${footer()}</div>`;
  return { status: 200, title: legal.title, description: clipped(legal.description, 155), body, noindex: true };
}

function notFoundPage(): SeoPage {
  return { status: 404, title: "Page introuvable — Assavendo", description: "La page demandée n’existe pas ou n’est plus disponible sur Assavendo.", body: `<div class="site-shell">${nav()}<main class="empty-state"><span class="eyebrow">ERREUR 404</span><h1>Cette page n’existe pas.</h1><p>Le lien demandé est incorrect ou la fiche a été retirée.</p><a class="button button-primary" href="/">Retour à l’accueil →</a></main>${footer()}</div>`, noindex: true };
}

async function resolvePage(path: string): Promise<SeoPage> {
  if (path === "/" || path === "/index.html") return homePage();
  if (path === "/portfolio") return portfolioPage();
  if (path === "/boutique") return storePage();
  if (path === "/admin") return { status: 200, title: "Administration — Assavendo", description: "Espace sécurisé de gestion du site Assavendo.", body: `<div class="site-shell">${nav()}<main class="admin-gate"><span class="eyebrow">ESPACE PRIVÉ</span><h1>Administration Assavendo</h1><p>Connectez-vous avec le compte propriétaire pour gérer les produits, commandes et interactions.</p><a class="button button-primary" href="/admin">Ouvrir la connexion propriétaire →</a></main>${footer()}</div>`, noindex: true };
  if (path === "/paiement/retour") return { status: 200, title: "Vérification de paiement — Assavendo", description: "Vérification de l’état de votre paiement Stripe.", body: `<div class="site-shell">${nav()}<main class="payment-result"><span class="eyebrow">PAIEMENT</span><h1>Vérification de votre commande</h1><p>La confirmation s’affichera après validation par Stripe.</p><a class="button button-outline" href="/boutique">Retour à la boutique →</a></main>${footer()}</div>`, noindex: true };
  if (["/mentions-legales", "/confidentialite", "/conditions-generales"].includes(path)) return legalPage(path);
  const example = path.match(/^\/exemples\/([^/]+)$/);
  if (example) return examplePage(example[1]) ?? notFoundPage();
  const demo = path.match(/^\/demos\/([^/]+)$/);
  if (demo) return demoPage(demo[1]) ?? notFoundPage();
  const product = path.match(/^\/produits\/([^/]+)$/);
  if (product) return await productPage(product[1]) ?? notFoundPage();
  return notFoundPage();
}

export async function renderSeoHtml(template: string, requestedUrl: string) {
  let path: string;
  try {
    path = decodeURIComponent(new URL(requestedUrl, "http://assavendo.invalid").pathname);
  } catch {
    path = "/__invalid__";
  }
  const page = await resolvePage(path);
  return htmlDocument(template, path, page);
}
