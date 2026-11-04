import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Aide", description: "Commande, livraison, téléchargement, retour et paiement : les réponses essentielles.", alternates: { canonical: "/aide" } };

const topics: { q: string; a: React.ReactNode }[] = [
  { q: "Comment suis-je livré ?", a: <>Chaque fiche produit indique le délai et les frais de livraison avant le paiement. Pour un téléchargement, un lien sécurisé est envoyé par e-mail dès que le paiement est confirmé ; il a une durée et un nombre d&apos;usages limités.</> },
  { q: "Je n'ai pas reçu mon e-mail de téléchargement", a: <>Vérifiez vos courriers indésirables, puis écrivez-nous depuis le <Link href="/contact?sujet=Probl%C3%A8me%20de%20commande">formulaire de contact</Link> en indiquant l&apos;adresse utilisée pour la commande : nous renvoyons le lien après vérification.</> },
  { q: "Puis-je retourner un produit ?", a: <>Oui, dans les conditions prévues par la loi et par nos <Link href="/conditions-de-vente">conditions de vente</Link> : 14 jours pour se rétracter pour un achat à distance, sauf exceptions légales (par exemple un contenu numérique dont le téléchargement a commencé avec votre accord).</> },
  { q: "Comment le paiement est-il sécurisé ?", a: <>Le paiement est traité par Stripe sur une page sécurisée. Assavendo ne voit ni ne conserve votre numéro de carte.</> },
  { q: "Quel est le prix final ?", a: <>Les prix sont affichés toutes taxes comprises. Les frais de livraison éventuels sont indiqués avant la validation du paiement.</> },
  { q: "Mes données personnelles", a: <>Voir la <Link href="/confidentialite">politique de confidentialité</Link> : finalités, durées de conservation et droits d&apos;accès, de rectification et de suppression.</> },
];

export default function Aide() {
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: "52rem" }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Aide</h1>
      <p className="muted">Les réponses essentielles sur la commande, la livraison, le retour et le paiement.</p>
      <div className="faq" style={{ marginTop: "1.6rem" }}>
        {topics.map((t) => <details key={t.q}><summary>{t.q}</summary><p>{t.a}</p></details>)}
      </div>
      <div className="cta-band" style={{ marginTop: "2.5rem" }}>
        <div><h2>Une question sans réponse ?</h2><p>Écrivez-nous : nous répondons personnellement.</p></div>
        <Link className="btn btn-signal btn-lg" href="/contact">Contacter Assavendo</Link>
      </div>
    </div></div>
  );
}
