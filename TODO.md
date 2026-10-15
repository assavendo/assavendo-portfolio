# Suivi de réalisation — Assavendo

## 1. Portfolio, compétences et 100 démonstrations
- [x] « je veux un site portfolio qui va trouver mes visiteurs mes compétences » : une vitrine publique responsive présente clairement les compétences, services, bénéfices et appels à l’action d’Assavendo.
- [x] « générer 100 business en ligne en catégories » : présenter exactement 100 concepts d’activité en ligne, répartis en catégories, avec navigation et recherche utiles.
- [x] « présenter chaque business ultra professionnellement aux visiteurs comme exemplaires de mes travaux » : différencier clairement les exemples de portfolio des produits effectivement vendus ; fournir à chaque exemple une présentation complète, un positionnement et des fonctions cohérents, sans inventer de clients ni de résultats réels.
- [x] « les exemplaires doivent être complets, ultra premium, consultable et testé toujours dans le site » : permettre de consulter chaque exemple et d’ouvrir une démonstration interactive utilisable sur le site.

## 2. Boutique et espace d’administration
- [x] « mon espace d’administration où je peux commencer à vendre directement mes propres produits différents celles des exemplaires » : proposer une zone d’administration protégée et séparer les produits commerciaux réels du catalogue d’exemples.
- [x] « plus d’options de publication pour que les visiteurs voient les produits complets avec les options des teste satisfaisant » : gérer les fiches produits complètes, les médias, prix, brouillons/statuts de publication et une expérience de consultation/démonstration côté visiteur.
- [x] Les produits commerciaux peuvent être publiés/édités/archivés par le propriétaire depuis l’administration ; les formulaires sont validés côté serveur.
- [ ] Le parcours de paiement utilise le compte Stripe français en mode test, distingue les états en attente/annulé/payé, persiste la commande et ne confirme une vente qu’après webhook Stripe vérifié ; les achats restent désactivés tant que le webhook test n’est pas configuré.

## 3. Interactions et qualité éditoriale
- [x] « les produits doivent être comme les publications avec toutes les options d’une publication comme par exemple likes, avis, commentaires, partages et autres » : offrir aux visiteurs des mentions J’aime, avis notés, commentaires modérés et partage ; permettre à l’administration de modérer les contributions.
- [x] Fournir des pages publiques partageables, navigation mobile, état vide/erreur clair et éléments de contenu en français.
- [x] Mettre en place les titres/descriptions et métadonnées sociales des pages publiques dans l’HTML initial (y compris les fiches de concepts et produits), corriger les statuts des routes 404 et `noindex` les pages privées ; ajouter une structure de pages légales avec les champs qui devront être complétés par le propriétaire.

## 4. Comptes et services demandés
- [ ] « je vais utilisé mes comptes : github, Supabase et stripe situé en France. alors pour ce projet si y a d'autres comptes que je dois avoir n'hésite pas à me les dires » : utiliser GitHub selon le flux autorisé de dépôt ; utiliser la base gérée du projet (choix confirmé) à la place de Supabase ; utiliser le compte Stripe français en mode test via les secrets sécurisés et expliquer la configuration propriétaire requise pour passer en production.
- [x] « autres choses, options et fonctionnalités qui correspondent ici » : ajouter les fonctions essentielles au portfolio et à la boutique (recherche/filtres, statistiques de publication/commandes, gestion des brouillons et modération), sans inventer les informations métier ou juridiques de l’entreprise.
