"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const HIDDEN = ["/contact", "/admin", "/paiement", "/api"];
/** Barre d'action fixe sur mobile : le chemin vers le contact reste à portée de pouce, sauf sur les pages où elle gênerait. */
export function MobileCta() {
  const path = usePathname(); const hidden = HIDDEN.some((h) => path.startsWith(h));
  useEffect(() => { document.body.classList.toggle("has-mobile-cta", !hidden); return () => document.body.classList.remove("has-mobile-cta"); }, [hidden]);
  if (hidden) return null;
  return <div className="mobile-cta no-print"><Link className="btn btn-primary" href="/contact">Demander un diagnostic</Link><Link className="btn btn-ghost" href="/problemes">Les solutions</Link></div>;
}
