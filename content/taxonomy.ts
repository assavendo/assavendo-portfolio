// Taxonomie de la boutique (cahier des charges §6, §7, §9, §92). Source unique : scripts/generate-taxonomy.ts en tire le SQL.
// RÈGLE (cahier §92.3) : une famille réglementée ou non vérifiée est visible mais NON VENDABLE (sellable: false) tant que le propriétaire ne l'a pas validée dans l'administration.

export type AttrType = "enum" | "number" | "boolean" | "text";
export type Attr = { key: string; label: string; type: AttrType; unit?: string; values?: string[]; filterable?: boolean };
export type Kind = "physical" | "digital" | "service";
export type Family = {
  slug: string; name: string; kind: Kind; description: string; sellable?: boolean; note?: string;
  attributes?: Attr[]; children: { slug: string; name: string; attributes?: Attr[] }[];
};

const ram = { key: "ram_go", label: "Mémoire (RAM)", type: "enum", unit: "Go", values: ["4", "6", "8", "12", "16", "32", "64"], filterable: true } as const satisfies Attr;
const stockage = { key: "stockage_go", label: "Stockage", type: "enum", unit: "Go", values: ["64", "128", "256", "512", "1024", "2048"], filterable: true } as const satisfies Attr;
const couleur = { key: "couleur", label: "Couleur", type: "text", filterable: true } as const satisfies Attr;
const REGULE = "Famille réglementée : aucune vente tant que les règles du pays, les preuves de conformité et les conditions de livraison ne sont pas validées par le propriétaire.";

export const families: Family[] = [
  {
    slug: "electronique", name: "Électronique et informatique", kind: "physical", description: "Téléphones, ordinateurs, audio, réseau et accessoires.",
    children: [
      { slug: "smartphones", name: "Smartphones", attributes: [ram, stockage, { key: "ecran_pouces", label: "Taille d'écran", type: "number", unit: "pouces", filterable: true }, { key: "reseau_5g", label: "5G", type: "boolean", filterable: true }, { key: "systeme", label: "Système", type: "enum", values: ["Android", "iOS"], filterable: true }, couleur] },
      { slug: "tablettes", name: "Tablettes", attributes: [ram, stockage, { key: "ecran_pouces", label: "Taille d'écran", type: "number", unit: "pouces", filterable: true }] },
      { slug: "ordinateurs-portables", name: "Ordinateurs portables", attributes: [{ key: "cpu", label: "Processeur", type: "text", filterable: false }, ram, stockage, { key: "ecran_pouces", label: "Taille d'écran", type: "number", unit: "pouces", filterable: true }, { key: "systeme", label: "Système", type: "enum", values: ["Windows", "macOS", "Linux", "ChromeOS"], filterable: true }, { key: "poids_kg", label: "Poids", type: "number", unit: "kg", filterable: true }] },
      { slug: "ordinateurs-fixes", name: "Ordinateurs fixes", attributes: [{ key: "cpu", label: "Processeur", type: "text" }, ram, stockage, { key: "systeme", label: "Système", type: "enum", values: ["Windows", "macOS", "Linux"], filterable: true }] },
      { slug: "composants", name: "Composants" }, { slug: "ecrans", name: "Écrans", attributes: [{ key: "ecran_pouces", label: "Diagonale", type: "number", unit: "pouces", filterable: true }] },
      { slug: "televisions", name: "Télévisions" }, { slug: "appareils-photo", name: "Appareils photo" }, { slug: "audio", name: "Audio" },
      { slug: "casques", name: "Casques" }, { slug: "ecouteurs", name: "Écouteurs" }, { slug: "accessoires-electronique", name: "Accessoires" },
      { slug: "cables-chargeurs", name: "Câbles et chargeurs" }, { slug: "stockage-donnees", name: "Stockage" }, { slug: "reseau", name: "Réseau" }, { slug: "objets-connectes", name: "Objets connectés" },
    ],
  },
  {
    slug: "maison", name: "Maison et jardin", kind: "physical", description: "Meubles, décoration, cuisine, électroménager et jardin.",
    children: ["Meubles", "Décoration", "Éclairage", "Cuisine", "Électroménager", "Literie", "Rangement", "Salle de bain", "Nettoyage", "Jardin", "Bricolage", "Sécurité domestique"].map((n) => ({ slug: slugify(n), name: n })),
  },
  {
    slug: "mode", name: "Mode et accessoires", kind: "physical", description: "Vêtements, chaussures, sacs, montres et bijoux.",
    children: [
      { slug: "vetements", name: "Vêtements", attributes: [{ key: "taille", label: "Taille", type: "enum", values: ["XS", "S", "M", "L", "XL", "XXL"], filterable: true }, couleur, { key: "genre", label: "Genre", type: "enum", values: ["Femme", "Homme", "Mixte"], filterable: true }, { key: "matiere", label: "Matière", type: "text" }] },
      { slug: "chaussures", name: "Chaussures", attributes: [{ key: "pointure", label: "Pointure", type: "enum", values: Array.from({ length: 12 }, (_, i) => String(36 + i)), filterable: true }, couleur, { key: "genre", label: "Genre", type: "enum", values: ["Femme", "Homme", "Mixte"], filterable: true }, { key: "matiere", label: "Matière", type: "text" }, { key: "usage", label: "Usage", type: "enum", values: ["Ville", "Sport", "Randonnée", "Cérémonie"], filterable: true }] },
      { slug: "sacs", name: "Sacs" }, { slug: "accessoires-mode", name: "Accessoires" }, { slug: "montres", name: "Montres" }, { slug: "bijoux", name: "Bijoux" }, { slug: "lunettes", name: "Lunettes" }, { slug: "sportswear", name: "Sportswear" },
    ],
  },
  { slug: "beaute", name: "Beauté et soins", kind: "physical", description: "Soins du visage et du corps, cheveux, parfums.", sellable: false, note: REGULE, children: ["Soins du visage", "Soins du corps", "Cheveux", "Parfums", "Accessoires beauté", "Appareils de beauté"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "sante", name: "Santé et bien-être", kind: "physical", description: "Bien-être et hygiène éligibles.", sellable: false, note: REGULE, children: [{ slug: "bien-etre", name: "Bien-être" }, { slug: "hygiene", name: "Hygiène" }] },
  { slug: "sport", name: "Sport et plein air", kind: "physical", description: "Fitness, running, randonnée, cyclisme et plein air.", children: ["Fitness", "Musculation", "Running", "Football", "Basketball", "Tennis", "Randonnée", "Camping", "Cyclisme", "Natation"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "enfants", name: "Enfants et jeux", kind: "physical", description: "Jouets, jeux éducatifs et puériculture.", sellable: false, note: REGULE + " (sécurité des produits pour enfants)", children: ["Jouets", "Jeux éducatifs", "Puériculture", "Mobilier enfant", "Accessoires enfant"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "bureau", name: "Bureau et école", kind: "physical", description: "Fournitures, papeterie, mobilier et imprimantes.", children: ["Fournitures", "Papeterie", "Mobilier de bureau", "Imprimantes", "Accessoires de bureau", "Équipement professionnel"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "auto", name: "Auto et mobilité", kind: "physical", description: "Accessoires, entretien, outils et pièces compatibles.", children: ["Accessoires auto", "Entretien auto", "Outils auto", "Équipements auto", "Électronique auto", "Pièces compatibles"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "animaux", name: "Animaux", kind: "physical", description: "Accessoires, hygiène, jouets et équipements.", children: ["Accessoires animaux", "Hygiène animaux", "Jouets animaux", "Équipements animaux"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "livres-medias", name: "Livres et médias", kind: "physical", description: "Livres, magazines, bandes dessinées.", children: ["Livres", "Magazines", "Bandes dessinées", "Médias physiques"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "industrie", name: "Industrie et professionnel", kind: "physical", description: "Outils, équipements, sécurité et pièces.", children: ["Outils professionnels", "Équipements industriels", "Sécurité professionnelle", "Instrumentation", "Pièces", "Fournitures professionnelles"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "alimentation", name: "Alimentation", kind: "physical", description: "Alimentation conditionnée et produits spécialisés.", sellable: false, note: REGULE + " (dates, stockage, température, transport).", children: [{ slug: "epicerie", name: "Épicerie conditionnée" }, { slug: "boissons", name: "Boissons" }] },
  { slug: "artisanat", name: "Artisanat, art et collection", kind: "physical", description: "Pièces uniques, art, objets de collection.", children: [{ slug: "artisanat-objets", name: "Objets artisanaux" }, { slug: "art", name: "Art" }, { slug: "collection", name: "Collection" }] },

  {
    slug: "logiciels", name: "Logiciels et licences", kind: "digital", description: "Applications, extensions, outils professionnels et licences.",
    attributes: [{ key: "plateforme", label: "Plateforme", type: "enum", values: ["Windows", "macOS", "Linux", "Web", "Android", "iOS"], filterable: true }, { key: "licence", label: "Licence", type: "enum", values: ["Personnelle", "Commerciale", "Équipe"], filterable: true }],
    children: ["Licences", "Applications", "Plugins", "Extensions", "Outils professionnels", "SaaS", "Clés d'activation"].map((n) => ({ slug: slugify(n), name: n })),
  },
  {
    slug: "livres-numeriques", name: "Livres numériques", kind: "digital", description: "eBooks, guides, manuels et rapports.",
    attributes: [{ key: "format", label: "Format", type: "enum", values: ["PDF", "EPUB"], filterable: true }, { key: "langue", label: "Langue", type: "enum", values: ["Français", "Anglais", "Arabe", "Espagnol"], filterable: true }, { key: "pages", label: "Pages", type: "number", filterable: false }],
    children: ["eBooks", "PDF", "EPUB", "Guides", "Manuels", "Rapports"].map((n) => ({ slug: slugify(n), name: n })),
  },
  { slug: "formations", name: "Formations et cours", kind: "digital", description: "Cours, masterclass, certifications et tutoriels.", children: ["Cours", "Masterclass", "Formations professionnelles", "Certifications", "Tutoriels", "Formations vidéo"].map((n) => ({ slug: slugify(n), name: n })) },
  {
    slug: "design", name: "Design et créations", kind: "digital", description: "Templates, kits d'interface, illustrations, icônes et polices.",
    attributes: [{ key: "format", label: "Format de fichier", type: "enum", values: ["Figma", "PSD", "SVG", "PNG", "PDF", "3D"], filterable: true }, { key: "licence", label: "Licence", type: "enum", values: ["Personnelle", "Commerciale"], filterable: true }],
    children: ["Templates", "Présentations", "Kits d'interface", "Maquettes", "Illustrations", "Icônes", "Logos", "Fichiers SVG", "Fichiers PSD", "Fichiers Figma", "Modèles 3D", "Polices"].map((n) => ({ slug: slugify(n), name: n })),
  },
  { slug: "audio-video", name: "Audio, vidéo et photo", kind: "digital", description: "Musique, effets sonores, vidéos, photos et animations.", children: ["Musique", "Effets sonores", "Samples", "Boucles", "Vidéos", "Images d'archive", "Photos", "Voix", "Animations"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "developpement", name: "Développement", kind: "digital", description: "Code, thèmes, scripts, bibliothèques et composants.", children: ["Code", "Modèles de code", "Thèmes", "Scripts", "Bibliothèques", "Composants", "Ressources techniques"].map((n) => ({ slug: slugify(n), name: n })) },
  { slug: "productivite", name: "Productivité", kind: "digital", description: "Tableurs, modèles, checklists et documents imprimables.", children: ["Feuilles de calcul", "Modèles de documents", "Checklists", "Documents", "Fichiers imprimables", "Outils de productivité"].map((n) => ({ slug: slugify(n), name: n })) },

  { slug: "services", name: "Services Assavendo", kind: "service", description: "Missions d'audit, de réparation et de mise en place, sur devis écrit.", children: [] },
];

export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Attributs d'une catégorie = ceux de sa famille + les siens (la clé de l'enfant prime). */
export function attributesFor(family: Family, childSlug?: string): Attr[] {
  const own = childSlug ? family.children.find((c) => c.slug === childSlug)?.attributes ?? [] : [];
  const map = new Map<string, Attr>();
  for (const a of [...(family.attributes ?? []), ...own]) map.set(a.key, a);
  return [...map.values()];
}

// Un même libellé peut exister dans deux familles (ex. « Outils professionnels ») : l'adresse est alors préfixée par la famille.
(() => {
  const all = [...families.map((f) => f.slug), ...families.flatMap((f) => f.children.map((c) => c.slug))];
  const count = new Map<string, number>();
  for (const s of all) count.set(s, (count.get(s) ?? 0) + 1);
  for (const f of families) for (const c of f.children) if ((count.get(c.slug) ?? 0) > 1 && !c.slug.startsWith(`${f.slug}-`)) c.slug = `${f.slug}-${c.slug}`;
})();
