import type { Metadata } from "next";
import { Todo, legal, v } from "@/components/LegalPage";
import { TERMS_VERSION } from "@/lib/legal";
export const metadata: Metadata = { title: "Conditions de vente", alternates: { canonical: "/conditions-de-vente" }, robots: { index: false } };
export default function Page() {
  return <div className="section legal"><div className="wrap" style={{ maxWidth: 780 }}>
    <h1>Conditions de vente</h1>
    <p className="muted">Version du {TERMS_VERSION}. Applicables aux commandes passées sur ce site.</p>
    <Todo />
    <h2>1. Vendeur</h2><p>{v(legal.name)}{legal.form ? `, ${legal.form}` : ""} — {v(legal.address)}{legal.siret ? ` — SIRET ${legal.siret}` : ""}{legal.vat ? ` — TVA ${legal.vat}` : ""} — {v(legal.email)}.</p>
    <h2>2. Produits et prix</h2><p>Chaque produit est décrit sur sa page : contenu, format, prérequis et limites. Les prix sont indiqués en euros, toutes taxes comprises lorsque la TVA est applicable. Le prix applicable est celui affiché au moment de la commande. Nous nous réservons le droit de modifier nos prix à tout moment, sans effet sur les commandes déjà validées.</p>
    <h2>3. Commande et paiement</h2><p>Le paiement s'effectue en ligne par carte via Stripe ; Assavendo ne reçoit ni ne conserve les données de carte. La commande est confirmée à réception du paiement et une facture est envoyée par e-mail. En cas d'échec ou d'abandon du paiement, aucune somme n'est prélevée.</p>
    <h2>4. Livraison</h2>
    <p><strong>Contenu numérique :</strong> un lien de téléchargement personnel est envoyé par e-mail après paiement. Il est limité en nombre de téléchargements et en durée de validité (indiqués dans l'e-mail). En cas de lien expiré ou épuisé, écrivez-nous : un nouveau lien est émis sur justification de la commande.</p>
    <p><strong>Prestations de service :</strong> le périmètre, les délais et les modalités sont convenus avant la prestation ; nous vous contactons après la commande pour l'organiser.</p>
    <p><strong>Produits physiques :</strong> expédiés à l'adresse indiquée lors du paiement, dans les pays proposés ; un e-mail confirme l'expédition.</p>
    <h2>5. Droit de rétractation</h2>
    <p>Pour les produits et prestations soumis au droit de rétractation, le consommateur dispose de quatorze jours à compter de la conclusion du contrat (service) ou de la réception du bien (produit physique) pour se rétracter sans motif, en écrivant à {v(legal.email)}.</p>
    <p><strong>Contenu numérique fourni sur support non matériel :</strong> lorsque le consommateur demande expressément la livraison immédiate et reconnaît qu'il perd son droit de rétractation dès le début de l'exécution (case à cocher avant paiement, enregistrée avec la date, la version de ces conditions et une empreinte non réversible de l'adresse IP), le droit de rétractation ne s'applique plus.</p>
    <h2>6. Garanties légales</h2><p>Les produits bénéficient des garanties légales de conformité et des vices cachés, ainsi que de la garantie de conformité des contenus numériques lorsqu'elle s'applique. Un fichier défectueux ou inaccessible est corrigé ou remplacé ; à défaut, la commande est remboursée.</p>
    <h2>7. Remboursements</h2><p>Un remboursement est effectué sur le moyen de paiement utilisé, dans un délai maximal de quatorze jours après acceptation de la demande. Le lien de téléchargement associé est alors désactivé.</p>
    <h2>8. Données personnelles</h2><p>Les données de commande (e-mail, adresse de facturation ou de livraison, consentements) sont utilisées pour exécuter la commande, établir la facture et respecter nos obligations comptables. Voir la <a href="/confidentialite">politique de confidentialité</a>.</p>
    <h2>9. Service client et litiges</h2><p>Pour toute question ou réclamation : {v(legal.email)}. Le consommateur peut recourir gratuitement à un médiateur de la consommation ; les coordonnées du médiateur compétent sont communiquées sur demande. Les présentes conditions sont soumises au droit français.</p>
  </div></div>;
}
