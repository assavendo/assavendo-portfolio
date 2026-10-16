export const domains = [
  { slug: "sites-performance-referencement", name: "Sites web, performance et référencement", sort: 10, intro: "Un site lent, introuvable ou fragile fait perdre des clients chaque jour, sans que son propriétaire le voie." },
  { slug: "e-commerce-paiements", name: "E-commerce et paiements", sort: 20, intro: "Chaque friction dans le parcours d'achat se paie en ventes perdues : paiement, stock, livraison, confiance." },
  { slug: "securite-conformite-fiabilite", name: "Sécurité, conformité et fiabilité", sort: 30, intro: "Une intrusion, une amende ou une panne peut arrêter une activité en une journée. Nous travaillons de façon défensive et vérifiable." },
  { slug: "marketing-acquisition", name: "Marketing et acquisition", sort: 40, intro: "Attirer des clients coûte cher quand on avance sans mesure. Nous relions les chiffres aux décisions." },
  { slug: "contenu-video-design", name: "Contenu, vidéo et design", sort: 50, intro: "Un contenu juste, cohérent et rapide à produire est la première chose que voit un client." },
  { slug: "automatisation-ia", name: "Automatisation et IA", sort: 60, intro: "Automatiser utilement libère du temps, à condition de garder l'humain là où cela compte." },
  { slug: "donnees-finance-gestion", name: "Données, finance et gestion", sort: 70, intro: "Décider sans chiffres fiables revient à naviguer sans carte. Les outils financiers sont des aides au calcul, pas des conseils." },
  { slug: "formation-produits-numeriques", name: "Formation et produits numériques", sort: 80, intro: "Enseigner et vendre du savoir en ligne pose des questions de pédagogie, de livraison et de protection du créateur." },
  { slug: "services-rh-metiers", name: "Services, RH et métiers", sort: 90, intro: "Chaque métier a son quotidien de papiers, de messages dispersés et de tableurs fragiles. Nous en faisons des outils simples." },
  { slug: "multilingue-accessibilite", name: "Multilingue, accessibilité et marchés émergents", sort: 100, intro: "Un bon produit web fonctionne avec une connexion fragile, dans plusieurs langues et pour tous les utilisateurs." },
] as const;
export type DomainSlug = (typeof domains)[number]["slug"];
