# Plan de réalisation — Assavendo

## Objectif et périmètre

Créer un portfolio e-commerce français premium qui explique les compétences d’Assavendo, rend son catalogue de concepts immédiatement explorables, et sépare nettement les **démonstrations de portfolio** des **produits réellement commercialisés**. Le site comprend une vitrine publique, 100 fiches d’exemples réparties par catégories et testables, une boutique avec interactions sociales, un espace d’administration réservé au propriétaire, et un parcours de paiement Stripe.

### Décisions confirmées

- Utiliser le starter React / Express / tRPC / Drizzle déjà initialisé.
- Utiliser la base MySQL gérée du projet pour les données applicatives. Le choix de ne pas utiliser Supabase pour cette première version a été confirmé ; Supabase n’a actuellement aucun projet accessible dans la session.
- Garder les exemples de portfolio distincts des produits vendus et utiliser un jeu de données éditorial versionné pour les 100 concepts.
- Protéger l’administration par la session et le rôle propriétaire ; ne pas fabriquer de connexion de démonstration ni de faux comptes.
- Le provisionnement Stripe natif a répondu `country_not_supported`. Utiliser le compte Stripe français existant via le SDK Stripe côté serveur ; la clé de test est conservée dans le coffre sécurisé, jamais dans le code. Le paiement restera bloqué jusqu’à la configuration d’un webhook de test vérifié. Le propriétaire fera ensuite la bascule vers les clés live par une procédure sécurisée.
- GitHub est activé, mais le dépôt canonique initial est Manus ; inspecter les possibilités de liaison avant tout basculement de dépôt.

## Approche fonctionnelle

1. **Vitrine** : accueil orienté valeur et prise de contact, présentation des compétences/services, preuves de travail, appel à l’action clair et navigation mobile.
2. **Bibliothèque d’exemples** : 100 idées de business en ligne réparties en catégories cohérentes, avec recherche, filtres, fiches individuelles (concept, audience, proposition de valeur, fonctions et parcours) et parcours de démonstration manipulable. Les démonstrations sont explicitement identifiées comme des prototypes de portfolio, pas comme des entreprises ou des témoignages réels.
3. **Boutique** : produits réels séparés des exemples, fiches détaillées, prix et médias, statuts de publication, mentions J’aime, évaluations, commentaires modérés, partage et achat.
4. **Administration** : accès réservé au propriétaire authentifié ; tableau de bord, création/édition/brouillon/publication/archivage de produits, suivi des commandes et modération des interactions. Les écritures sont validées côté serveur.
5. **Paiements** : Checkout créé côté serveur, persistance minimale des commandes et confirmation fondée sur webhook vérifié et idempotent (jamais sur la seule URL de retour). Les commandes non payées ou en attente restent distinctes des commandes acquittées.
6. **Qualité publique** : interface responsive, accessibilité clavier, contenu français et routes publiques adaptées au partage et à l’indexation ; générer des pages HTML initiales riches par route pour les concepts, la boutique et les fiches publiques, sans dépendre de JavaScript pour le contenu destiné aux robots. Prévoir un statut 404 réel pour les routes ou produits inexistants, des pages privées en `noindex`, et des métadonnées canoniques uniquement à partir d’une origine publique configurée. Les pages légales sont structurées avec des zones à compléter avec les coordonnées, les conditions de vente, la politique de confidentialité et les informations fiscales réelles du propriétaire.

## Architecture et structure du projet

- `client/src/App.tsx` : routes publiques et route de l’administration.
- `client/src/pages/` : accueil, portfolio, fiche de concept, boutique, fiche produit et panneau d’administration.
- `client/src/components/` : navigation, blocs éditoriaux, cartes, interactions, formulaires et composants de démonstration.
- `client/src/data/portfolio-examples.ts` : jeu de données éditorial stable des 100 concepts ; aucune écriture en base pour des exemples statiques.
- `client/src/lib/` : client tRPC et fonctions de partage/formatage.
- `server/routers.ts` : API tRPC publique (catalogue réel, réactions, avis, commentaires) et procédures protégées (administration, modération, commandes).
- `server/db.ts` et `drizzle/schema.ts` : accès et schéma Drizzle pour produits, interactions, commandes et événements Stripe ; migrations additives uniquement.
- `server/_core/` : conserver les mécanismes fournis d’authentification, de session, de routage et de serveur ; ajouter le endpoint webhook HTTP avec lecture des octets bruts avant tout parseur JSON.
- `client/public/` : petites ressources versionnées (manifeste de routes, icônes) ; `server/_core/seo.ts` : rendu HTML initial, métadonnées par route et réponse 404.

## Direction artistique

Trois directions candidates évaluées dans la queue de distribution (< 0,10 chacune) : **éditoriale suisse chaleureuse** (0,07), **néo-brutalisme chromatique** (0,04), **modernisme techno-futuriste** (0,02). Choix : éditoriale suisse chaleureuse.

- **Mouvement** : design éditorial suisse contemporain, avec la sobriété d’un studio digital indépendant.
- **Principes** : hiérarchie typographique nette ; contenu avant décoration ; contrastes lisibles ; interactions courtes et précises.
- **Couleurs** : ivoire et encre profonde pour la confiance et la lecture, bleu pétrole signature pour l’expertise, accent corail réservé aux actions importantes.
- **Mise en page** : grande composition éditoriale asymétrique, alternance de sections pleine largeur et de colonnes de lecture ; filtres et navigation latéraux sur grands écrans plutôt qu’une grille uniforme.
- **Signatures** : monogramme géométrique « A » ; traits de repère éditoriaux ; cartouches numérotés pour les projets et catégories.
- **Interaction / animation** : états visibles et accessibles ; transitions discrètes de 160–220 ms ; aucune animation nécessaire à la compréhension, réduction de mouvement respectée.
- **Typographie** : Manrope pour titres et UI, DM Sans pour texte courant ; titres compacts à fort contraste de taille, corps confortable, chiffres tabulaires pour prix et métriques.
- **Essence** : « Assavendo transforme des idées numériques en expériences commerciales concrètes. » Personnalité : précise, ambitieuse, accessible.
- **Voix** : directe, concrète, sans promesses gonflées. Exemples : « Des idées claires. Des expériences qui convertissent. » ; « Explorez 100 concepts, puis découvrez les créations à adopter. »
- **Wordmark** : nom Assavendo dessiné en caractères solides avec un A modulaire inspiré d’un curseur/chevron, jamais un logo typographique par défaut.
- **Couleur signature** : bleu pétrole profond.

Les références visuelles repérées dans la recherche renvoyaient à des annonces d’illustrations et d’impressions de banques/places de marché ; aucune n’est intégrée faute de licence explicite. La couverture du site utilise une illustration originale générée pour Assavendo.

## Dépendances et limites

- Le compte de session Supabase n’expose aucun projet ; il n’est pas utilisé pour cette version.
- Le dépôt Git actuel est lié à Manus ; la connexion à GitHub doit respecter le guide de dépôt canonique et ne pas réécrire l’historique.
- Le mode Stripe géré par la plateforme n’est pas disponible pour ce compte (`country_not_supported`). La voie retenue est le compte Stripe français existant et ses clés en secrets d’environnement ; la clé de webhook de test doit encore être créée dans Stripe et enregistrée de manière sécurisée avant tout achat test. Aucune clé live n’est utilisée.
- Les téléchargements/médias durables utilisent les chemins de stockage du projet lorsqu’un fichier téléversé est requis ; aucune clé privée n’est livrée au navigateur.
- Le périmètre vise une base complète et exploitable dans le projet initialisé ; il ne fabrique ni identité juridique, ni produits réels, ni témoignages, ni coordonnées du propriétaire.
