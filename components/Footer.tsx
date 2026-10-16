import Link from "next/link";
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div><h2>Assavendo</h2><p>Nous résolvons les problèmes web qui coûtent des clients, et nous le prouvons avec des outils que vous pouvez tester.</p></div>
          <div><h2>Explorer</h2><ul><li><Link href="/problemes">Problèmes résolus</Link></li><li><Link href="/boutique">Boutique</Link></li><li><Link href="/contact">Contact</Link></li></ul></div>
          <div><h2>Informations</h2><ul><li><Link href="/mentions-legales">Mentions légales</Link></li><li><Link href="/confidentialite">Confidentialité</Link></li><li><Link href="/conditions-de-vente">Conditions de vente</Link></li></ul></div>
        </div>
        <p className="foot-bottom">© {new Date().getFullYear()} Assavendo. Les résultats affichés par nos outils sont calculés à partir des données que vous saisissez ; ils illustrent une méthode et ne constituent pas un engagement de résultat.</p>
      </div>
    </footer>
  );
}
