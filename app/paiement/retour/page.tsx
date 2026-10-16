import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Merci pour votre achat", robots: { index: false } };
export default function Retour() {
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Merci pour votre achat</h1>
      <p>Votre paiement a bien été transmis à Stripe. Une confirmation vous est envoyée par e-mail, avec le lien de téléchargement lorsque le produit comporte un fichier. Si vous ne la voyez pas d'ici quelques minutes, vérifiez vos courriers indésirables.</p>
      <p className="muted">Le lien de téléchargement est valable pour 5 téléchargements.</p>
      <Link href="/boutique" className="btn btn-primary">Retour à la boutique</Link>
    </div></div>
  );
}
