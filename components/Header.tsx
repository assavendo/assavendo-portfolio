"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CartLink } from "./CartLink";

export type NavFamily = { slug: string; name: string };
const services = [
  { href: "/services", label: "Vue d'ensemble des services" }, { href: "/problemes", label: "Problèmes résolus" }, { href: "/offres", label: "Offres de service" },
  { href: "/methode", label: "Méthode et questions" }, { href: "/contact?sujet=Demande%20de%20diagnostic", label: "Demander un diagnostic" },
];

export function Header({ families }: { families: NavFamily[] }) {
  const path = usePathname(); const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null); const nav = useRef<HTMLElement>(null);
  const closeDrops = () => nav.current?.querySelectorAll("details.nav-drop[open]").forEach((d) => d.removeAttribute("open"));
  useEffect(() => { setOpen(false); closeDrops(); }, [path]);
  // Échap referme menus déroulants et menu mobile ; un clic à l'extérieur referme les menus déroulants.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { closeDrops(); if (open) { setOpen(false); toggle.current?.focus(); } } };
    const onClick = (e: MouseEvent) => { if (!nav.current?.contains(e.target as Node)) closeDrops(); };
    document.addEventListener("keydown", onKey); document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, [open]);
  const cur = (h: string) => (path === h || (h !== "/" && path.startsWith(h)) ? "page" : undefined);
  const inServices = ["/services", "/problemes", "/offres", "/methode"].some((h) => path.startsWith(h));
  return (
    <header className="site-header">
      <div className="wrap header-in">
        <Link href="/" className="brand" aria-label="Assavendo, accueil de la boutique">
          <svg className="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><rect width="26" height="26" rx="5" fill="#0b3c5d" /><path d="M6 20 13 6l7 14M9 15h8" stroke="#f5c400" strokeWidth="2.4" fill="none" /></svg>
          Assavendo
        </Link>
        <button ref={toggle} className="menu-toggle" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>{open ? "Fermer" : "Menu"}</button>
        <nav id="nav" ref={nav} className={`nav${open ? " open" : ""}`} aria-label="Navigation principale">
          <form role="search" action="/boutique" method="get" className="header-search">
            <label className="sr-only" htmlFor="h-q">Rechercher un produit</label>
            <input id="h-q" name="q" type="search" placeholder="Rechercher" maxLength={120} autoComplete="off" />
          </form>
          <details className="nav-drop">
            <summary>Catégories</summary>
            <div className="drop-panel wide">
              <Link href="/boutique">Tous les produits</Link>
              {families.map((f) => <Link key={f.slug} href={`/categorie/${f.slug}`}>{f.name}</Link>)}
            </div>
          </details>
          <Link href="/numerique" aria-current={cur("/numerique")}>Numérique</Link>
          <Link href="/promotions" aria-current={cur("/promotions")}>Promotions</Link>
          <Link href="/collections" aria-current={cur("/collections")}>Collections</Link>
          <details className="nav-drop">
            <summary aria-current={inServices ? "true" : undefined}>Services &amp; solutions</summary>
            <div className="drop-panel">{services.map((s) => <Link key={s.href} href={s.href}>{s.label}</Link>)}</div>
          </details>
          <Link href="/aide" aria-current={cur("/aide")}>Aide</Link>
          <Link href="/compte" aria-current={cur("/compte")}>Mon compte</Link>
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
