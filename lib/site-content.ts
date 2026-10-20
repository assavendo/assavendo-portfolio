/** Contenu éditorial commun (accueil, offres, méthode). Aucune promesse chiffrée, aucun témoignage, aucun logo client. */
export const offers = [
  { domain: "sites-performance-referencement", title: "Un site rapide, que l'on trouve", text: "Mesurer la vitesse et la visibilité réelles, puis corriger dans l'ordre d'impact.", points: ["Mesure avant et après", "Plan de correction priorisé", "Images, cache et code allégés"] },
  { domain: "e-commerce-paiements", title: "Une boutique qui encaisse", text: "Rendre le parcours d'achat fluide, fiable et conforme, du panier à la livraison.", points: ["Paiement sécurisé", "Commandes et livraisons suivies", "Parcours d'achat testé de bout en bout"] },
  { domain: "securite-conformite-fiabilite", title: "Un site sûr et fiable", text: "Fermer les failles courantes, protéger les comptes et garder le site en ligne.", points: ["En-têtes et accès durcis", "E-mails authentifiés", "Sauvegardes et reprise vérifiées"] },
  { domain: "automatisation-ia", title: "Du temps libéré, sans perdre le contrôle", text: "Automatiser les tâches répétitives en gardant l'humain là où cela compte.", points: ["Cas d'usage choisi avec vous", "Sources et limites visibles", "Validation humaine prévue"] },
] as const;

export const steps = [
  { title: "Diagnostic", text: "Vous décrivez la situation. Nous la vérifions par des mesures (outils, relevés, lecture du site), pas par des impressions." },
  { title: "Proposition", text: "Un document écrit : périmètre, livrables, délai et prix. Vous décidez avant tout engagement." },
  { title: "Réalisation", text: "Les corrections sont faites dans l'ordre d'impact, avec des points d'étape pour que vous voyiez avancer le travail." },
  { title: "Validation et suivi", text: "Nous mesurons après l'intervention, remettons la documentation et précisons ce qui relève d'un suivi éventuel." },
] as const;

export const faq = [
  { q: "Combien de temps faut-il ?", a: "Cela dépend du périmètre. Le délai est indiqué dans la proposition écrite, avant tout engagement. Nous répondons à votre message sous deux jours ouvrés." },
  { q: "Combien cela coûte-t-il ?", a: "Chaque situation est différente : nous ne publions pas de grille tarifaire figée. Vous recevez une proposition écrite avec le périmètre, les livrables et le prix avant de vous engager. Les outils en ligne de ce site sont gratuits." },
  { q: "De quels accès avez-vous besoin ?", a: "Seulement de ceux qui servent la mission (hébergement, nom de domaine, outils concernés), demandés au moment du diagnostic. Nous recommandons de créer des accès dédiés, que vous pouvez retirer à la fin." },
  { q: "Que se passe-t-il après la mise en ligne ?", a: "La proposition précise ce qui est inclus après la livraison et ce qui relèverait d'un suivi distinct. Rien n'est facturé sans votre accord." },
  { q: "Mes données sont-elles protégées ?", a: "Les outils gratuits n'enregistrent pas ce que vous saisissez. Pour une mission, les accès et les données manipulées sont limités au strict nécessaire. Le détail figure dans la politique de confidentialité." },
  { q: "Comment les livrables sont-ils remis ?", a: "Par un canal convenu (code, fichiers, documentation), avec l'explication de ce qui a été fait et de la manière de le vérifier." },
] as const;
