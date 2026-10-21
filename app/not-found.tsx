import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Page introuvable", robots: { index: false } };
export default function NotFound() {
  return (
    <div className="section state-page"><div className="wrap" style={{ maxWidth: 680 }}>
      <p className="code-big" aria-hidden="true">404</p>
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Page introuvable</h1>
      <p>Cette adresse n'existe pas ou n'est plus publiée. Parcourez les problèmes que nous résolvons, ou décrivez-nous le vôtre.</p>
      <div className="hero-cta"><Link className="btn btn-primary" href="/problemes">Voir les problèmes résolus</Link><Link className="btn btn-ghost" href="/contact">Nous écrire</Link></div>
    </div></div>
  );
}
