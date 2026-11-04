"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SHOWN = ["/services", "/problemes", "/offres", "/methode"];
/** Barre d'action fixe sur mobile, réservée aux pages « Services & solutions » : la boutique garde l'écran libre pour acheter. */
export function MobileCta() {
  const path = usePathname(); const hidden = !SHOWN.some((h) => path.startsWith(h));
  useEffect(() => { document.body.classList.toggle("has-mobile-cta", !hidden); return () => document.body.classList.remove("has-mobile-cta"); }, [hidden]);
  if (hidden) return null;
  return <div className="mobile-cta no-print"><Link className="btn btn-primary" href="/contact">Demander un diagnostic</Link><Link className="btn btn-ghost" href="/problemes">Les solutions</Link></div>;
}
