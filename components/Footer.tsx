import Link from "next/link";
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div><h2>Assavendo</h2><p>La boutique Assavendo : des produits à fiche complète, un paiement sécurisé, et des services web sur devis pour les entreprises.</p></div>
          <div><h2>Boutique</h2><ul><li><Link href="/boutique">Tous les produits</Link></li><li><Link href="/numerique">Numérique</Link></li><li><Link href="/promotions">Promotions</Link></li><li><Link href="/collections">Collections</Link></li><li><Link href="/aide">Aide</Link></li></ul></div>
          <div><h2>Services &amp; solutions</h2><ul><li><Link href="/services">Vue d'ensemble</Link></li><li><Link href="/problemes">Problèmes résolus</Link></li><li><Link href="/offres">Offres de service</Link></li><li><Link href="/methode">Méthode et questions</Link></li></ul></div>
          <div><h2>Nous joindre</h2><ul><li><Link href="/contact">Demander un diagnostic</Link></li></ul></div>
          <div><h2>Informations</h2><ul><li><Link href="/mentions-legales">Mentions légales</Link></li><li><Link href="/confidentialite">Confidentialité</Link></li><li><Link href="/conditions-de-vente">Conditions de vente</Link></li></ul></div>
        </div>
        <p className="foot-bottom">© {new Date().getFullYear()} Assavendo. Les résultats affichés par nos outils sont calculés à partir des données que vous saisissez ; ils illustrent une méthode et ne constituent pas un engagement de résultat.</p>
      </div>
    </footer>
  );
}
