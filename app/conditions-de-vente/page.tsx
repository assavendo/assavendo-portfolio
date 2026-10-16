import type { Metadata } from "next";
import { Todo, legal, v } from "@/components/LegalPage";
export const metadata: Metadata = { title: "Conditions de vente", robots: { index: false } };
export default function Page() {
  return <div className="section legal"><div className="wrap" style={{ maxWidth: 780 }}>
    <h1>Conditions de vente</h1><Todo />
    <p className="todo" role="note">Ce texte est un modèle de départ : faites-le valider par un professionnel du droit avant d'ouvrir la vente, en particulier pour le droit de rétractation applicable à vos produits.</p>
    <h2>Vendeur</h2><p>{v(legal.name)} — {v(legal.address)} — {v(legal.email)}.</p>
    <h2>Produits et prix</h2><p>Les prix sont indiqués en euros, toutes taxes comprises le cas échéant, sur la page de chaque produit. Le prix applicable est celui affiché au moment de la commande.</p>
    <h2>Paiement</h2><p>Le paiement s'effectue en ligne par carte via Stripe. La commande est confirmée à réception du paiement.</p>
    <h2>Livraison des produits numériques</h2><p>Le lien de téléchargement est envoyé par e-mail après paiement ; il est limité à 5 téléchargements.</p>
    <h2>Droit de rétractation</h2><p>[À compléter selon la nature du produit : le contenu numérique fourni immédiatement avec l'accord exprès du consommateur peut être exclu du droit de rétractation.]</p>
    <h2>Service client</h2><p>Pour toute question ou réclamation : {v(legal.email)}.</p>
  </div></div>;
}
