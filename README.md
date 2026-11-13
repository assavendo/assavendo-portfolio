# Assavendo — site portfolio (Next.js 15 · Supabase · Stripe · Vercel)

Fiches « problème → solution », outils gratuits en ligne, boutique de produits numériques et prestations de service.

## Ce qui est en place

- **Contenu** : 14 fiches rédigées, 86 brouillons jamais publiés automatiquement (`content/`), règles de publication centralisées (`lib/content-rules.ts`), un seul test « outil opérationnel » (`hasOperationalTool`).
- **Boutique** : catalogue, catégories, marques, variantes, panier serveur, stock réservé, commandes à lignes, favoris, avis/commentaires modérés et garde-fous de vente.
- **Espace client** : connexion par lien magique, commandes, téléchargements, favoris, adresses, retours, export des données et suppression du compte.
- **Paiement** : commande créée *avant* la session Stripe (clé d'idempotence), webhook qui appelle les fonctions SQL de finalisation (verrou, contrôle montant/devise, jetons), événement enregistré seulement après succès ; consentements CGV + renonciation (produits numériques) journalisés avec version et IP hachée.
- **Marchés** : les destinations physiques autorisées au checkout sont calculées depuis `public.markets` ; un marché doit être explicitement vendable et expédiable, avec ses statuts fiscalité/livraison/conformité/prix/paiement validés.
- **Téléchargements** : `claim_download` / `release_download` atomiques, expiration, quota, journal `order_downloads`, révocation/renouvellement depuis l’admin.
- **Sécurité** : anti-SSRF (`lib/ip.ts`, `lib/safe-fetch.ts`), Turnstile, limitation de débit, RLS, CSP, HSTS, permissions policy, images restreintes aux hôtes autorisés et clés serveur séparées.
- **Outils** : en-têtes HTTP, SEO, SPF/DMARC/DKIM, mots de passe, ROAS, panier abandonné, A/B, PageSpeed ; copie, impression, export et CTA contextuel.
- **Design** : tokens CSS, mode sombre automatique, contrastes WCAG AA vérifiés par script, illustrations SVG originales, CSS d'impression, pages d'erreur, icônes, manifest et images Open Graph.
- **Qualité** : tests Node, tests SQL sur PostgreSQL jetable avec tests de concurrence/rollback, tests e2e Playwright + axe, CI GitHub Actions.

## Ce qui n'est pas fait

- CSP avec nonces : non activé pour éviter de casser le rendu sans campagne de test dédiée.
- **2FA admin** : authentification TOTP intégrée ; après enrôlement du premier facteur, chaque connexion administrateur exige un code MFA.
- **Multilingue et analytics** : non déployés.
- **Réécriture éditoriale** des 86 brouillons : volontairement non automatisée.
- Pages « Études de cas » et « Blog » : volontairement absentes tant qu'il n'y a pas de contenu réel.
- Outils DNS/HTTPS et générateur de redirections : non implémentés.
- Textes légaux : dépendent des variables `LEGAL_*` ; **relecture par un juriste obligatoire**.
- La protection Supabase contre les mots de passe compromis reste dépendante des capacités du plan Auth utilisé.

## Migrations et déploiement

Les migrations versionnées de la base sont dans `supabase/migrations/` et couvrent notamment :

`20261016000000_init` → `20261019000000_reconcile_content` → `20261019010000_commerce_and_ops` → `20261020000000_pagespeed_tool` → `20261104000000_catalog` → `20261105000000_cart_orders` → `20261106000000_customer_account` → `20261107000000_ai_hub` → `20261108044420_global_markets_additive_20261106043200` → `20261113075603_security_hardening` → `20261113080018_prevent_zero_total_physical_orders` → `20261113081238_account_admin_hardening`.

La CI rejoue les migrations et les tests SQL sur un PostgreSQL jetable avant le build et les tests e2e. Les installations Node utilisent `npm ci` avec cache npm et les GitHub Actions sont épinglées sur des commits précis.

Avant une ouverture commerciale :

1. renseigner toutes les variables de production de `.env.example` (dont `NEXT_PUBLIC_SITE_URL`, Stripe, Resend, Turnstile, `IP_HASH_SALT`, `LEGAL_*`) ;
2. sauvegarder et vérifier la base de production avant toute évolution ;
3. vérifier que les marchés souhaités sont explicitement `sell_enabled` et `ship_enabled` avec des statuts validés ;
4. dans Stripe, configurer le webhook `https://<domaine>/api/stripe/webhook` pour les événements Checkout et remboursement prévus ;
5. superviser `/api/health`, les logs Vercel et la page admin « Commandes » ;
6. exécuter `npm run verify`.

## Ajouter un problème

Admin → Problèmes ; la publication est refusée si les règles de `lib/content-rules.ts` ne sont pas respectées. Pour le lot initial : `npx tsx scripts/generate-seed.ts` (`--check` en CI).

## Ajouter un produit

Admin → Produits ; les produits physiques doivent avoir des informations de livraison cohérentes, les produits numériques publiés doivent avoir un livrable, et les catégories non validées pour la vente sont bloquées.

## Ajouter un outil

Déclarer la clé dans `lib/tool-keys.ts`, créer `lib/tools/<x>.ts`, la route `app/api/tools/<x>/route.ts`, le composant, l'entrée de `components/ToolRunner.tsx`, la migration (`tool_keys`) et la fiche.

## Vérifications

`npm test` · `npm run check` · `npm run lint` · `npm run typecheck` · `npm run test:db` · `npm run e2e` · `npm run verify`.

La CI exécute également `npm audit --omit=dev --audit-level=high` à titre informatif. Les intégrations Stripe/Resend réelles et les secrets de production restent à tester dans leurs environnements respectifs.
