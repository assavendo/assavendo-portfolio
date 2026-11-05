# Import fournisseur et image produit assistée par IA

## Flux actuel

1. Un administrateur fournit une URL publique HTTPS, un nom de produit et confirme disposer des droits nécessaires sur la page et les visuels.
2. Le serveur vérifie les adresses contre le SSRF, consulte `robots.txt`, limite taille/durée/redirections, lit seulement des métadonnées HTML/JSON-LD et vérifie les URL d’image. Il ne contourne ni connexion, ni paywall, ni CAPTCHA.
3. L’agent catalogue prépare une proposition en français. Les champs source sont considérés comme non fiables, le prix de vente est forcé à 0 €, et aucune donnée produit n’est publiée.
4. L’administrateur vérifie la provenance et la fiche dans le Centre IA. L’approbation crée un produit physique `draft`, relié à `public.dropship_imports`; le prix est à définir, et le stock est initialisé à 0 avec suivi activé.
5. Avant ou après la génération facultative d’une image, l’administrateur doit vérifier que le résultat représente exactement le produit. La publication reste une action distincte dans l’éditeur de produits.

La génération d’image appelle le endpoint Images API `POST /v1/images/edits` avec une image source HTTPS publique, le modèle `gpt-image-1.5`, la qualité `medium`, une sortie WebP carrée et une consigne de fidélité stricte. L’image générée est enregistrée dans le bucket public `media` déjà présent (limite Supabase vérifiée : 8 Mo). Une seule image est conservée par import. Les appels peuvent entraîner des frais OpenAI selon la clé configurée; le bouton l’indique. Le timeout applicatif est de 110 secondes et la durée maximale de la route est 120 secondes.

## Prérequis et limites

- Une clé OpenAI active, rôle `catalogue` ou `general`, est nécessaire pour générer l’image. Les fournisseurs compatibles destinés au texte ne sont pas utilisés pour cet endpoint.
- Le commutateur IA général et le plafond d’appels quotidiens du Centre IA s’appliquent.
- L’import de texte et d’images demeure soumis aux droits d’auteur, marques, exigences de conformité et règles de chaque site source. La case à cocher est une déclaration de l’administrateur, pas une licence garantie.
- Le modèle peut déformer des détails; toute image doit être comparée à la source. N’utilisez pas le résultat pour prétendre à une certification ou caractéristique non vérifiée.
- Ce flux n’assure pas encore la disponibilité chez le fournisseur, la synchronisation du stock, la fixation automatique du prix, l’envoi automatique de commandes, le fulfillment, les retours fournisseur ni la facturation fournisseur. Ces opérations requièrent un connecteur/API fournisseur autorisé, des règles commerciales explicites et des tests distincts. Aucun achat fournisseur ni paiement n’est déclenché.
- Le schéma `dropship_imports` et le bucket `media` étaient déjà présents dans Supabase lors de l’audit. Cette étape n’ajoute aucune table, colonne ni migration; elle réutilise les champs déjà déployés. Aucune ligne de production n’a été créée pendant le développement.

## Sources officielles consultées (5 novembre 2026)

- OpenAI, guide de génération/édition d’images : <https://developers.openai.com/api/docs/guides/image-generation>
- OpenAI, référence de l’endpoint d’édition `POST /v1/images/edits`, paramètres et forme de réponse : <https://developers.openai.com/api/reference/resources/images/methods/edit/>
