import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, Menu, X } from "lucide-react";

const navigation = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/boutique", label: "Boutique" },
  { href: "/#expertises", label: "Expertises" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="site-shell">
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand" aria-label="Assavendo, accueil" onClick={() => setMenuOpen(false)}><span className="brand-mark" aria-hidden="true"><span /></span><span className="brand-word">assavendo<span className="brand-dot">.</span><small>STUDIO DIGITAL</small></span></Link>
      <button className="mobile-menu-button" aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Navigation principale">{navigation.map((item) => <Link key={item.href} href={item.href} className={location === item.href ? "nav-link active" : "nav-link"} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}<Link href="/#contact" className="nav-cta" onClick={() => setMenuOpen(false)}>Parlons de votre projet <ArrowUpRight size={15} /></Link></nav>
    </div></header>
    <main>{children}</main>
    <footer className="site-footer"><div className="footer-top"><div><Link href="/" className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><span /></span><span className="brand-word">assavendo<span className="brand-dot">.</span><small>STUDIO DIGITAL</small></span></Link><p className="footer-note">Des idées claires. Des expériences numériques qui donnent envie d’agir.</p></div><div className="footer-links"><div><span className="footer-label">Explorer</span><Link href="/portfolio">Portfolio</Link><Link href="/boutique">Boutique</Link><Link href="/#expertises">Expertises</Link></div><div><span className="footer-label">Informations</span><Link href="/mentions-legales">Mentions légales</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions-generales">Conditions de vente</Link></div></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Assavendo Studio. Tous droits réservés.</span><span>Conçu avec intention, en France.</span></div></footer>
  </div>;
}
