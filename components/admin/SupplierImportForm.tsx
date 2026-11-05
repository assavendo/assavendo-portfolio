"use client";
import { importSupplierProduct } from "@/app/actions/dropship";

export function SupplierImportForm() {
  return <form action={importSupplierProduct} className="form-grid">
    <label className="field full">Page produit publique du fournisseur
      <input className="input" name="supplier_url" type="url" inputMode="url" placeholder="https://fournisseur.example/produit" required maxLength={2000} />
    </label>
    <label className="field full">Nom du produit à créer
      <input className="input" name="product_query" required minLength={2} maxLength={200} placeholder="Ex. lampe de bureau rechargeable" />
    </label>
    <p className="notice full" role="note">La page est consultée en lecture seule. L'import respecte robots.txt, ne contourne pas de connexion, paywall ou CAPTCHA, vérifie les adresses contre le SSRF et crée uniquement une proposition en attente. Le prix de vente, le stock et le délai restent à vérifier.</p>
    <label className="field full" style={{ display: "flex", alignItems: "start", gap: ".55rem" }}>
      <input type="checkbox" name="rights_confirmed" required style={{ marginTop: ".25rem" }} />
      <span>Je confirme que j'ai le droit d'utiliser cette page et les visuels du fournisseur, et que je vérifierai les informations et l'image générée avant toute publication.</span>
    </label>
    <button className="btn btn-primary">Importer et préparer la fiche</button>
  </form>;
}
