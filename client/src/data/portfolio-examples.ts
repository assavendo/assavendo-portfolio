export type DemoKind = "store" | "dashboard" | "course" | "booking" | "creator" | "impact";

type CategorySeed = {
  name: string;
  intro: string;
  audience: string;
  demo: DemoKind;
  pillars: [string, string, string];
  items: [string, string][];
};

const categorySeeds: CategorySeed[] = [
  {
    name: "Boutiques & marques",
    intro: "Des expériences directes, désirables et simples à acheter.",
    audience: "Marques indépendantes et acheteurs sensibles à la qualité.",
    demo: "store",
    pillars: ["Catalogue éditorial", "Parcours de découverte", "Achat sans friction"],
    items: [
      ["Éclat Botanique", "Des soins botaniques formulés pour les routines courtes et les peaux sensibles."],
      ["Atelier Noma", "Une maison de décoration qui remet l’artisanat local au centre du quotidien."],
      ["Maison Amande", "Une épicerie fine en ligne dédiée aux producteurs du bassin méditerranéen."],
      ["Lumea Studio", "Des luminaires sculpturaux conçus à la demande pour les intérieurs contemporains."],
      ["Marée Douce", "Des essentiels balnéaires durables pensés pour vivre plusieurs saisons."],
      ["Orbe Textile", "Une garde-robe capsule traçable, produite en petites séries responsables."],
      ["Peau Claire", "Une sélection de cosmétiques transparents avec un diagnostic de routine guidé."],
      ["Petit Atlas", "Des objets de voyage compacts imaginés pour les escapades en famille."],
      ["Brume Maison", "Des parfums d’intérieur et rituels sensoriels inspirés des paysages français."],
      ["Ligne Source", "Une marque de papeterie élégante pour les équipes créatives et indépendantes."],
    ],
  },
  {
    name: "SaaS & productivité",
    intro: "Des outils numériques ciblés qui transforment une tâche en système clair.",
    audience: "Indépendants, petites équipes et responsables opérationnels.",
    demo: "dashboard",
    pillars: ["Tableau de bord lisible", "Actions mesurables", "Automatisation utile"],
    items: [
      ["Tempo Desk", "Un planificateur léger qui protège les plages de concentration des équipes hybrides."],
      ["Briefly", "La collecte de briefs clients devient un formulaire guidé plutôt qu’un fil d’e-mails."],
      ["AtelierFlow", "Les studios créatifs suivent leurs projets, validations et livrables au même endroit."],
      ["ClairOps", "Un tableau de bord réunit les opérations récurrentes d’une petite entreprise."],
      ["Rendez-vous Plus", "Les professionnels centralisent disponibilité, rappels et suivi après rendez-vous."],
      ["Facturoom", "Un espace de pilotage aide les micro-entreprises à suivre devis et encaissements."],
      ["Signal Client", "Les retours clients deviennent des priorités produit triées par impact."],
      ["FluxNote", "Une base de connaissances transforme les notes d’équipe en procédures réutilisables."],
      ["SprintBoard", "Un espace de travail asynchrone affiche objectifs, blocages et prochaines actions."],
      ["Nova Automate", "Des automatisations accessibles connectent les tâches répétitives sans code."],
    ],
  },
  {
    name: "Formation & apprentissage",
    intro: "Des parcours pédagogiques concrets, progressifs et faciles à reprendre.",
    audience: "Apprenants autonomes, formateurs et petites écoles spécialisées.",
    demo: "course",
    pillars: ["Parcours par étapes", "Exercices pratiques", "Progression visible"],
    items: [
      ["Langue Vivante", "Des micro-leçons de français professionnel adaptées aux situations réelles."],
      ["Code en Clair", "Un parcours de programmation qui apprend en construisant de petits projets."],
      ["Cuisine Essentielle", "Des cours vidéo structurent les bases culinaires pour cuisiner avec confiance."],
      ["Studio Freelance", "Un programme guide les créatifs de leur première offre à leurs premiers clients."],
      ["ÉcoGestes", "Des défis hebdomadaires rendent les habitudes écologiques mesurables."],
      ["Mémo Finance", "Des modules courts rendent les notions budgétaires accessibles aux jeunes adultes."],
      ["Pixel Academy", "Des exercices guidés initient au design d’interface et au prototypage."],
      ["Cap Examen", "Un espace de révision mélange fiches, quiz et calendrier de préparation."],
      ["Voix d’Orateur", "Un parcours pratique accompagne la prise de parole en public, du script à la scène."],
      ["Artisan Digital", "Une école en ligne transmet les fondamentaux de la vente directe aux artisans."],
    ],
  },
  {
    name: "Bien-être & rendez-vous",
    intro: "Des services de proximité accessibles, planifiables et personnalisés.",
    audience: "Praticiens, studios de bien-être et clients qui recherchent un suivi humain.",
    demo: "booking",
    pillars: ["Choix du service", "Disponibilités claires", "Suivi personnalisé"],
    items: [
      ["Respire Studio", "Des séances de respiration guidées complètent le suivi d’un studio bien-être."],
      ["Mouv’ Doux", "Un studio de mouvement propose des cours adaptés à tous les niveaux."],
      ["Pause Claire", "La réservation de consultations de sophrologie se fait en quelques étapes."],
      ["Peau & Sens", "Un institut indépendant associe conseils de soin et prise de rendez-vous."],
      ["Le Cabinet Vert", "Un réseau de praticiens présente ses spécialités et créneaux disponibles."],
      ["Yoga du Matin", "Des cours collectifs et individuels s’organisent selon le rythme des participants."],
      ["Nuit Calme", "Un programme d’accompagnement au sommeil associe rituels et rendez-vous."],
      ["Ostéo Local", "Un cabinet de quartier simplifie l’accès aux créneaux et aux informations pratiques."],
      ["Équilibre Nutrition", "Un suivi nutritionnel présente les étapes, ressources et consultations."],
      ["Parenthèse", "Une conciergerie bien-être assemble des expériences de récupération sur mesure."],
    ],
  },
  {
    name: "Food & restauration",
    intro: "Des menus vivants et des commandes conçues autour du bon produit.",
    audience: "Restaurants, producteurs et clients qui commandent localement.",
    demo: "store",
    pillars: ["Menu de saison", "Panier rapide", "Retrait ou livraison"],
    items: [
      ["Bocaux du Jour", "Des plats cuisinés de saison se commandent en bocaux consignés."],
      ["La Table Locale", "Un restaurant de quartier raconte ses producteurs avant de présenter sa carte."],
      ["Café Matin", "Un coffee shop permet de commander à l’avance les cafés et douceurs du jour."],
      ["Pasta Casa", "Des pâtes fraîches artisanales sont préparées en lots et réservées en ligne."],
      ["Ferme à Table", "Un panier hebdomadaire relie directement les fermes voisines aux foyers."],
      ["Douce Heure", "Une pâtisserie sur commande met en avant les créations et dates de retrait."],
      ["Épices du Monde", "Un comptoir d’épices propose des assemblages et recettes faciles à tester."],
      ["Brunch Club", "Des formules brunch pour groupes se réservent avec les préférences alimentaires."],
      ["Saison Pizza", "Une pizzeria de quartier présente la carte courte et les créneaux de commande."],
      ["Citrus Bar", "Des boissons fraîches artisanales se déclinent en collections et abonnements."],
    ],
  },
  {
    name: "Créateurs & services",
    intro: "Des offres créatives présentées avec un portfolio utile et un brief clair.",
    audience: "Créateurs, freelances, petites agences et entreprises qui cherchent un partenaire.",
    demo: "creator",
    pillars: ["Portfolio narratif", "Offres compréhensibles", "Brief de contact"],
    items: [
      ["Studio Forme", "Un studio de branding transforme sa démarche créative en offres lisibles."],
      ["Cadre Libre", "Un photographe indépendant présente ses séries et prépare les demandes de devis."],
      ["Mots Justes", "Une rédactrice web associe études de cas, spécialités et brief éditorial."],
      ["Motion Rue", "Un collectif d’animation explique ses formats et rassemble les demandes de projet."],
      ["Voix Maison", "Des voix off professionnelles sont classées par ton, langue et usage."],
      ["Noémie Conseil", "Une consultante indépendante détaille son accompagnement et ses ressources."],
      ["Maison Sonore", "Un producteur audio présente ses créations et ouvre un formulaire de commande."],
      ["Web Atelier", "Un développeur freelance rend visibles ses services, méthodes et étapes projet."],
      ["Com’ Locale", "Une petite agence organise ses offres de communication par objectif d’entreprise."],
      ["Les Bons Plans", "Un annuaire de créateurs locaux aide les marques à trouver le bon savoir-faire."],
    ],
  },
  {
    name: "Finance & pilotage",
    intro: "Des interfaces de décision qui mettent les indicateurs essentiels à portée de main.",
    audience: "Entrepreneurs, associations et petites équipes qui veulent mieux piloter leur activité.",
    demo: "dashboard",
    pillars: ["Indicateurs synthétiques", "Scénarios comparables", "Décisions traçables"],
    items: [
      ["Cap Trésorerie", "Un tableau de bord simplifie la lecture de trésorerie des petites structures."],
      ["Budget Famille", "Un outil partagé rend les objectifs budgétaires visibles sans jargon financier."],
      ["Impact Compte", "Les associations relient leurs dépenses aux projets et résultats suivis."],
      ["Devis Malin", "Un configurateur aide les indépendants à chiffrer leurs prestations récurrentes."],
      ["Marge Claire", "Les commerces testent leurs marges par famille de produits et périodes."],
      ["Prix Juste", "Un simulateur pédagogique aide les créateurs à structurer leurs tarifs."],
      ["Pilotage Zen", "Un espace mensuel rassemble objectifs, indicateurs et décisions de l’entreprise."],
      ["Subvention Facile", "Un suivi de dossiers rassemble échéances et pièces pour les associations."],
      ["Collectif Pro", "Une plateforme clarifie les budgets et contributions d’un collectif indépendant."],
      ["Compta Départ", "Un guide interactif aide les jeunes entreprises à préparer leurs documents."],
    ],
  },
  {
    name: "Voyage & local",
    intro: "Des expériences de territoire qui facilitent la découverte et la réservation.",
    audience: "Voyageurs curieux, guides, hébergeurs et acteurs locaux.",
    demo: "booking",
    pillars: ["Parcours par envie", "Réservation simple", "Repères de proximité"],
    items: [
      ["Balade Secrète", "Des itinéraires de quartier révèlent des adresses choisies par les habitants."],
      ["Nid de Passage", "Des hébergements indépendants exposent leurs disponibilités et leurs histoires."],
      ["Train & Terroir", "Des escapades sans voiture assemblent transport, visite et table locale."],
      ["Les Guides d’Ici", "Des guides locaux réservent des expériences en petits groupes."],
      ["Micro Aventure", "Des sorties nature proches du domicile s’organisent par durée et niveau."],
      ["Escapade Bleue", "Des séjours côtiers rassemblent hébergement, activités et conseils saisonniers."],
      ["Patrimoine Vivant", "Des visites culturelles donnent une place aux récits et artisans du territoire."],
      ["Route des Saveurs", "Un parcours gourmand présente les producteurs et créneaux de dégustation."],
      ["Vélo Doux", "Des boucles à vélo affichent distance, services et points d’intérêt locaux."],
      ["Week-end Atelier", "Des séjours créatifs combinent hébergement et ateliers réservables."],
    ],
  },
  {
    name: "Maison & artisanat",
    intro: "Des objets faits avec soin, accompagnés d’informations et de services concrets.",
    audience: "Artisans et acheteurs qui privilégient les pièces durables et singulières.",
    demo: "store",
    pillars: ["Pièces et matières", "Histoire du savoir-faire", "Commande personnalisée"],
    items: [
      ["Terre & Forme", "Une céramiste présente des pièces façonnées à la main et leurs variations."],
      ["Bois de Lune", "Un atelier de menuiserie transforme des chutes locales en mobilier durable."],
      ["Lin du Sud", "Une marque de linge de maison privilégie les fibres naturelles et les séries limitées."],
      ["Atelier Cannelle", "Des accessoires en cuir sont réalisés à la demande et réparables."],
      ["Verre d’Atelier", "Un artisan verrier propose ses pièces et organise des initiations réservables."],
      ["Laine Commune", "Une filière de laine locale relie éleveurs, teinturiers et tricoteurs."],
      ["Papier Vivant", "Des tirages d’art et affiches imprimés en petite série racontent leur fabrication."],
      ["L’Herbier Maison", "Des créations végétales séchées sont présentées avec leurs conseils d’entretien."],
      ["Reprise & Répare", "Un atelier de réparation facilite la prise en charge des objets du quotidien."],
      ["La Fabrique Douce", "Des cadeaux personnalisés réunissent artisans et emballages réutilisables."],
    ],
  },
  {
    name: "Impact & économie circulaire",
    intro: "Des services qui rendent la seconde vie et l’impact faciles à comprendre.",
    audience: "Citoyens, organisations responsables et acteurs du réemploi.",
    demo: "impact",
    pillars: ["Impact observable", "Parcours de réemploi", "Communauté engagée"],
    items: [
      ["Seconde Vie", "Une place de marché locale relie les objets réutilisables à leurs nouveaux foyers."],
      ["Répare Tout", "Des réparateurs de proximité rendent visibles leurs spécialités et créneaux."],
      ["Consigne Club", "Des commerces suivent le retour des contenants et facilitent leur réutilisation."],
      ["Partage Jardin", "Des voisins partagent outils, graines et temps de jardinage en circuit court."],
      ["Trajet Léger", "Une communauté de mobilité active compare les trajets évités en voiture."],
      ["Bureau Sobre", "Des équipes suivent leurs gestes de sobriété numérique au fil des projets."],
      ["Donnerie Pro", "Des entreprises redistribuent leurs surplus à des associations locales."],
      ["Terre Commune", "Un réseau citoyen suit les plantations et les soins d’espaces verts partagés."],
      ["Textile Retour", "Une collecte textile indique les étapes de tri, réparation et revente."],
      ["Circuit Court", "Des producteurs rassemblent commandes et points de retrait à l’échelle locale."],
    ],
  },
];

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const portfolioCategories = categorySeeds.map(({ name, intro }) => ({ name, intro }));

export const portfolioExamples = categorySeeds.flatMap((category) => category.items.map(([title, tagline], itemIndex) => {
  const categoryIndex = categorySeeds.indexOf(category);
  const index = categoryIndex * 10 + itemIndex + 1;
  return {
    id: index,
    number: String(index).padStart(2, "0"),
    title,
    slug: slugify(title),
    category: category.name,
    categoryIntro: category.intro,
    tagline,
    audience: category.audience,
    demo: category.demo,
    pillars: category.pillars,
    status: "Prototype de portfolio",
  };
}));

export type PortfolioExample = (typeof portfolioExamples)[number];
export const getPortfolioExample = (slug: string) => portfolioExamples.find((item) => item.slug === slug);
