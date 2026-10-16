"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [{ href: "/problemes", label: "Problèmes résolus" }, { href: "/boutique", label: "Boutique" }, { href: "/contact", label: "Contact" }];

export function Header() {
  const path = usePathname(); const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="wrap header-in">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <svg className="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="1" width="24" height="24" fill="#0b3c5d" /><path d="M6 20 13 6l7 14M9 15h8" stroke="#f5c400" strokeWidth="2.4" fill="none" /></svg>
          Assavendo
        </Link>
        <button className="menu-toggle" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>{open ? "Fermer" : "Menu"}</button>
        <nav id="nav" className={`nav${open ? " open" : ""}`} aria-label="Navigation principale">
          {links.map((l) => <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} onClick={() => setOpen(false)}>{l.label}</Link>)}
          <Link href="/contact" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Parler de votre projet</Link>
        </nav>
      </div>
    </header>
  );
}
