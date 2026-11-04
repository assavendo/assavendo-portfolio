# Matrice de conformité : cahier des charges Assavendo V2 ↔ site Next.js / Supabase

Légende : ✅ fait et testé · 🟡 partiel (ce qui manque est précisé) · ⛔ hors périmètre de ce site (autre projet ou décision du propriétaire) · ❓ décision du propriétaire requise

## Boutique, catalogue, recherche
| Exigence | État | Détail |
|---|---|---|
| La boutique est l'accueil | ✅ | `/` ; l'ancien accueil est devenu `/services` (toutes les anciennes adresses sont conservées) |
| Menu : catégories, numérique, promotions, services & solutions, aide, compte, panier | ✅ | Menu déroulant ; mobile et clavier (Échap) testés |
| Taxonomie §6/7/92 (22 familles, 143 rayons), attributs dynamiques par catégorie | ✅ | `content/taxonomy.ts` → graines SQL vérifiées en CI |
| Familles réglementées visibles mais non vendables par défaut (§92.3) | ✅ | Beauté, santé, enfants, alimentation : publication bloquée (formulaire, trigger SQL, achat) |
| Produits : marque, prix barré réel, SKU, GTIN, poids, origine, délais, garantie, retour, livraison | ✅ | Contraintes SQL (prix barré > prix) |
| Variantes avec stock et prix propres | 🟡 | Base, panier, paiement, stock : faits. Écran d'édition des variantes dans l'admin : à ajouter (création par SQL en attendant) |
| Recherche : accents, synonymes, fautes simples, filtres, facettes, tri, URL partageable | ✅ | Côté application, 15 tests unitaires. Pas de moteur dédié (OpenSearch hors périmètre) |
| Collections éditoriales | 🟡 | Tables et lecture publique faites ; pages et édition admin non faites |
| Pas de faux avis, fausse rareté, faux badge, fausse remise | ✅ | Aucun compteur artificiel ; « stock faible » seulement si le stock suivi est réel |
| SEO : canoniques, JSON-LD Product/Breadcrumb/WebSite, sitemap catégories | ✅ | |
| Accessibilité WCAG 2.2 AA | ✅ | axe-core sur toutes les nouvelles pages (CI) |

## Commande, paiement, stock
| Panier multi-produits | ✅ | Cookie (identifiants et quantités seulement) |
| Prix, stock, livraison, disponibilité recalculés côté serveur | ✅ | Fonction SQL atomique `create_cart_order` (tests SQL) |
| Réservation de stock avec expiration, sans survente | ✅ | 35 min, libération sur expiration/annulation, journal `stock_movements` |
| Paiement Stripe multi-lignes, idempotence, webhook | ✅ | Clé d'idempotence par commande ; rejeu sûr |
| Numéro de commande, suivi par lien personnel | ✅ | `/commande/<jeton>` |
| Livraison physique : préparation, expédition + suivi, livré | ✅ | Admin « À expédier », e-mail d'expédition |
| Téléchargements par fichier (limités, expirants, révocables) | ✅ | |
| Retours : demande client, décision admin, remise en stock journalisée | ✅ | Remboursement effectué dans Stripe |
| Remboursement automatique depuis l'admin | ⛔ | Volontairement dans Stripe (traçabilité) |
| TVA / Stripe Tax | ❓ | Prix TTC ; Stripe Tax activable via `STRIPE_TAX_ENABLED` après décision du régime de TVA |
| Frais de port par zone / transporteurs | ❓ | Frais fixes par produit pour l'instant |

## Compte client, support, conformité
| Compte par lien magique (sans mot de passe) | ✅ | Nécessite l'envoi d'e-mails Auth configuré (voir README) |
| Favoris, adresses, historique, export et suppression des données | ✅ | RLS testée |
| Centre d'aide | 🟡 | Page d'aide statique ; pas de tickets ni de base de connaissances |
| Avis vérifiés d'acheteurs | 🟡 | Existant conservé ; pas de campagne d'avis post-achat |

## Hors périmètre de ce site (autres projets ou décisions)
⛔ Medusa / moteur de commerce externe · OpenSearch · Temporal · centre de contrôle IA multi-fournisseurs (mode NO_AI : le commerce fonctionne sans IA) · marketplace de vendeurs tiers et paiements de commissions · fournisseurs/dropshipping automatisés · multi-devises et multi-langues (marché par défaut : France, EUR, français ; registre `markets` prêt).
❓ Décisions du propriétaire : pays vendables au-delà de la France, régime de TVA, transporteurs et tarifs, familles réglementées à ouvrir, politique de retour par catégorie, fournisseurs.
