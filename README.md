# Assavendo — site portfolio (Next.js · Supabase · Stripe · Vercel)

Refonte complète du portfolio. Principes : des problèmes expliqués du point de vue du client, de **vrais outils** seulement quand ils ont du sens, aucun numéro ni lettre affiché, tout le contenu administrable sans toucher au code.

## Ce qui est en place

| Domaine | Contenu |
|---|---|
| Catalogue | Recherche insensible aux accents, filtres (domaine, avec outil ou explication, public), fiches à adresse stable sans numéro, données structurées JSON-LD, sitemap, robots |
| Fiches problème | Ce que le client observe → ce que cela lui coûte → pourquoi → outil réel (si pertinent) → ce que fait Assavendo → livrables → résultat attendu → appel à l'action |
| Outils réels (8) | Analyse SEO d'une page, en-têtes de sécurité, SPF/DMARC, rentabilité publicitaire, paniers abandonnés, test A/B (taille d'échantillon et significativité), mot de passe compromis (k-anonymat), compression d'images dans le navigateur |
| Boutique | Produits avec galerie, prix, paiement Stripe Checkout, livraison par lien temporaire (5 téléchargements), likes, partages, avis (1 par visiteur, modérés), commentaires avec réponses, réponse « au nom d'Assavendo » |
| Administration | Connexion Supabase Auth + table `admins`, CRUD des problèmes et des produits, recherche de photos Unsplash avec crédit ou envoi de vos images, modération, messages, commandes |
| Sécurité | RLS sur toutes les tables, CSP et en-têtes, protection SSRF (résolution DNS validée à la connexion, redirections revalidées, plafonds de taille et de durée, robots.txt respecté), limitation de débit en base, Turnstile, champ piège, webhook Stripe signé et idempotent |

**Contenu au lancement :** 14 problèmes rédigés et publiés (8 avec outil), 86 autres fiches du cahier des charges importées **en brouillon** : elles sont invisibles tant que vous ne les réécrivez pas et ne les publiez pas depuis `/admin/problemes`.

## Ce qui n'est PAS fait (et que je ne prétends pas faire)

- **Photos** : aucune image n'est fournie. Les cartes affichent un visuel neutre tant qu'une photo n'est pas choisie. Utilisez la recherche Unsplash ou l'envoi d'image dans l'administration (elles s'enregistrent avec texte alternatif et crédit).
- **Les 86 brouillons** n'ont pas de texte client rédigé, et les outils correspondants (générateurs IA, CRM, planning, réservation, PWA…) ne sont pas construits. Chacun se traite un par un, voir « Ajouter un outil ».
- **Textes légaux** : les pages sont des modèles alimentés par les variables `LEGAL_*`. À faire valider par un juriste (surtout le droit de rétractation).
- La migration SQL a été vérifiée syntaxiquement, **pas exécutée** sur votre projet Supabase. Le paiement Stripe et l'envoi d'e-mails n'ont pas été testés en réel (aucune clé disponible ici).

## Mise en service

### Comptes nécessaires
GitHub, Supabase, Stripe (déjà à vous) puis : **Vercel** (hébergement), **Resend** (e-mails ; domaine d'envoi à authentifier SPF/DKIM/DMARC), **Cloudflare** (Turnstile gratuit), **Unsplash** (clé développeur gratuite, pour les photos), un **nom de domaine**. Optionnel : clé Google PageSpeed.

### Étapes
1. `npm ci` puis copier `.env.example` en `.env.local` et le remplir.
2. Supabase : exécuter `supabase/migrations/20261016000000_init.sql` puis `supabase/seed/001_contenu.sql` (éditeur SQL ou `supabase db push`).
3. Supabase → Authentication : créer votre utilisateur, **désactiver les inscriptions publiques**, puis dans l'éditeur SQL : `insert into public.admins (user_id) select id from auth.users where email = 'vous@exemple.fr';`
4. Stripe : créer un webhook vers `https://VOTRE-DOMAINE/api/stripe/webhook` pour `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, et copier le secret dans `STRIPE_WEBHOOK_SECRET`. Commencer en mode test.
5. Vercel : importer le dépôt, renseigner les variables, déployer. Ne jamais préfixer `SUPABASE_SECRET_KEY` ou `STRIPE_SECRET_KEY` par `NEXT_PUBLIC_`.
6. Rendre le dépôt GitHub à nouveau **privé** si vous l'aviez ouvert temporairement.

### Ajouter un problème
`/admin/problemes` → « Ajouter un problème ». Pas de numéro à gérer. Choisissez « Explication » ou « Avec un outil ».

### Ajouter un outil
1. Logique pure dans `lib/tools/` avec un test dans `tests/`. 2. Composant dans `components/tools/`. 3. Clé dans `lib/tool-keys.ts` et dans `components/ToolRunner.tsx`. 4. Si l'outil lit une adresse saisie, passer **obligatoirement** par `lib/safe-fetch.ts` et `lib/tool-route.ts`.

## Vérifications
`npm run typecheck` · `npm test` · `npm run build` (exécutés en CI, `.github/workflows/ci.yml`).
