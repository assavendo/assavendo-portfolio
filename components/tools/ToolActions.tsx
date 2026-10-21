"use client";
import Link from "next/link";
import { useState } from "react";

/** Actions après un résultat d'outil : copier le rapport, l'imprimer (PDF) et demander un échange avec le résultat prérempli. */
export function ToolActions({ summary, subject, cta }: { summary: string; subject: string; cta: string }) {
  const [msg, setMsg] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(summary); setMsg("Rapport copié."); } catch { setMsg("Copie impossible : sélectionnez le texte manuellement."); }
  }
  return (
    <div className="tool-actions no-print">
      <Link className="btn btn-primary" href={`/contact?sujet=${encodeURIComponent(subject)}`}>{cta}</Link>
      <button type="button" className="btn btn-ghost" onClick={copy}>Copier le rapport</button>
      <button type="button" className="btn btn-ghost" onClick={() => window.print()}>Imprimer ou enregistrer en PDF</button>
      <span className="muted small" role="status">{msg}</span>
    </div>
  );
}
