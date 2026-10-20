# Assavendo — site portfolio (Next.js 15 · Supabase · Stripe · Vercel)

Fiches « problème → solution », outils gratuits en ligne, boutique de produits numériques et prestations de service.

## Ce qui est en place

- **Contenu** : 14 fiches rédigées, 86 brouillons jamais publiés automatiquement (`content/`), règles de publication centralisées (`lib/content-rules.ts`), un seul test « outil opérationnel » (`hasOperationalTool`).
- **Paiement** : commande créée *avant* la session Stripe (clé d'idempotence), webhook qui appelle la fonction SQL `fulfil_order` (verrou, contrôle montant/devise, jeton), événement enregistré seulement après succès (sinon 500 → Stripe rejoue). Consentements CGV + renonciation (produits numériques) journalisés avec version, IP hachée.
- **Téléchargements** : `claim_download` / `release_download` atomiques, expiration, quota, journal `order_downloads`, révocation/renouvellement depuis l'admin.
- **Sécurité** : anti-SSRF (`lib/ip.ts`, `lib/safe-fetch.ts`), Turnstile, limitation de débit (visiteur + IP, repli mémoire), quota quotidien par outil, images restreintes à des hôtes autorisés, RLS sur toutes les tables.
- **Outils** : en-têtes HTTP, SEO, SPF/DMARC/DKIM, mots de passe, ROAS, panier abandonné, A/B, **PageSpeed** (nouveau) ; copie, impression, export et CTA contextuel.
- **Design** : tokens CSS, mode sombre automatique, contrastes WCAG AA vérifiés par script, illustrations SVG originales par domaine, CSS d'impression, pages d'erreur, icônes, manifest, images Open Graph.
- **Qualité** : 32 tests Node, tests SQL sur PostgreSQL jetable, tests e2e Playwright + axe, CI GitHub Actions.

## Ce qui n'est PAS fait (et que je ne prétends pas faire)

- CSP avec nonces (risque de casser le site sans test réel).
- Sentry : remplacé par `instrumentation.ts` (logs structurés) et `/api/health`.
- 2FA admin : uniquement la limitation de tentatives de connexion.
- Outils DNS/HTTPS, générateur de redirections, etc. ; pages « Études de cas » et « Blog » (volontairement non créées : pas de faux contenu).
- Multilingue, espace client, analytics, réécriture éditoriale des 86 brouillons.
- Textes légaux : dépendent des variables `LEGAL_*` ; **relecture par un juriste obligatoire**.

## Mise en service

### Comptes nécessaires
Supabase, Stripe, Resend, Cloudflare Turnstile, Vercel (+ clé PageSpeed optionnelle).

### Étapes
1. `cp .env.example .env.local` et renseigner toutes les variables (dont `IP_HASH_SALT`, `LEGAL_*`, `STRIPE_*`, `TURNSTILE_*`).
2. **Sauvegarder** la base de production, appliquer les migrations d'abord sur une préprod, dans l'ordre :
   `20261016000000_init` → `20261019000000_reconcile_content` → `20261019010000_commerce_and_ops` → `20261020000000_pagespeed_tool`.
   Les retours arrière sont dans `supabase/rollbacks/`.
3. Dans le tableau de bord Supabase : activer la protection contre les mots de passe compromis et désactiver les inscriptions publiques.
4. Stripe : créer le webhook `https://<domaine>/api/stripe/webhook` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `…_failed`, `checkout.session.expired`).
5. Superviser `/api/health` et les logs Vercel ; la page admin « Commandes » liste les paiements à réconcilier.
6. `npm install && npm run verify`.

### Ajouter un problème
Admin → Problèmes ; la publication est refusée si les règles de `lib/content-rules.ts` ne sont pas respectées. Pour le lot initial : `npx tsx scripts/generate-seed.ts` (`--check` en CI).

### Ajouter un outil
Déclarer la clé dans `lib/tool-keys.ts`, créer `lib/tools/<x>.ts`, la route `app/api/tools/<x>/route.ts`, le composant, l'entrée de `components/ToolRunner.tsx`, la migration (`tool_keys`) et la fiche.

## Vérifications

`npm test` · `npm run check` · `npm run lint` · `npm run test:db` · `npm run e2e` · `npm run verify`.

**Non exécuté dans l'environnement de livraison** (registre npm inaccessible) : typecheck complet, `next build`, ESLint, e2e Playwright/axe, Stripe et Resend réels. À lancer en premier chez vous (la CI le fait).
