"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [{ href: "/problemes", label: "Problèmes résolus" }, { href: "/offres", label: "Offres" }, { href: "/methode", label: "Méthode" }, { href: "/boutique", label: "Boutique" }];

export function Header() {
  const path = usePathname(); const [open, setOpen] = useState(false); const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  // Échap referme le menu et rend le focus au bouton ; le menu se ferme aussi quand le focus le quitte.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <header className="site-header">
      <div className="wrap header-in">
        <Link href="/" className="brand" aria-label="Assavendo, accueil">
          <svg className="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><rect width="26" height="26" rx="5" fill="#0b3c5d" /><path d="M6 20 13 6l7 14M9 15h8" stroke="#f5c400" strokeWidth="2.4" fill="none" /></svg>
          Assavendo
        </Link>
        <button ref={toggle} className="menu-toggle" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>{open ? "Fermer" : "Menu"}</button>
        <nav id="nav" className={`nav${open ? " open" : ""}`} aria-label="Navigation principale">
          {links.map((l) => <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>)}
          <Link href="/contact" className="btn btn-primary btn-sm">Demander un diagnostic</Link>
        </nav>
      </div>
    </header>
  );
}
