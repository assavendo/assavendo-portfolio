import type { Metadata } from "next";
import { Todo, legal, v } from "@/components/LegalPage";
export const metadata: Metadata = { title: "Politique de confidentialité", robots: { index: false } };
export default function Page() {
  return <div className="section legal"><div className="wrap" style={{ maxWidth: 780 }}>
    <h1>Politique de confidentialité</h1><Todo />
    <p>Responsable du traitement : {v(legal.name)} — contact : {v(legal.email)}.</p>
    <h2>Ce que nous collectons</h2>
    <p><strong>Formulaire de contact :</strong> nom, adresse e-mail, message. Finalité : répondre à votre demande. Base légale : votre consentement. Conservation : le temps nécessaire au traitement de la demande, puis archivage limité.</p>
    <p><strong>Achats :</strong> adresse e-mail et informations de commande. Le paiement est traité par Stripe ; nous ne voyons ni ne stockons vos données de carte. Base légale : exécution du contrat et obligations comptables.</p>
    <p><strong>Avis, commentaires, mentions « j'aime » :</strong> le nom que vous saisissez et le contenu publié après modération ; un identifiant technique anonyme (cookie strictement nécessaire) empêche les doublons.</p>
    <h2>Outils en ligne</h2><p>Les outils d'analyse lisent uniquement des informations publiques d'un site que vous indiquez (en-têtes, code HTML, enregistrements DNS). Les outils de calcul et de compression d'images s'exécutent dans votre navigateur ; vos fichiers ne sont pas envoyés à nos serveurs. Le test de mot de passe n'envoie que les 5 premiers caractères d'une empreinte SHA-1 au service Have I Been Pwned.</p>
    <h2>Mesure d'audience et cookies</h2><p>Ce site n'utilise pas de cookie publicitaire ni de traceur tiers. Le seul cookie déposé est un identifiant anonyme nécessaire au fonctionnement des mentions « j'aime » et des avis.</p>
    <h2>Sous-traitants</h2><p>Supabase (base de données), Vercel (hébergement), Stripe (paiement), Resend (envoi d'e-mails), Cloudflare (protection anti-robot).</p>
    <h2>Vos droits</h2><p>Vous pouvez demander l'accès, la rectification ou l'effacement de vos données, ou vous opposer à leur traitement, en écrivant à {v(legal.email)}. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
  </div></div>;
}
