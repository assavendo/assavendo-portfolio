"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[page]", error.digest ?? "", error.message); }, [error]);
  return (
    <div className="section state-page"><div className="wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Un incident est survenu</p>
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Cette page ne peut pas s'afficher pour le moment.</h1>
      <p>Le problème vient de notre côté et a été enregistré. Réessayez dans un instant ; si cela persiste, écrivez-nous.</p>
      <div className="hero-cta"><button className="btn btn-primary" onClick={reset}>Réessayer</button><Link className="btn btn-ghost" href="/contact">Nous écrire</Link></div>
      {error.digest ? <p className="muted small" style={{ marginTop: "1.5rem" }}>Référence : <code>{error.digest}</code></p> : null}
    </div></div>
  );
}
