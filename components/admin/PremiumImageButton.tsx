"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PremiumImageButton({ importId }: { importId: string }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/dropshipping/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importId }) });
      const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !body.url) { setMessage(body.error ?? "Génération impossible."); router.refresh(); return; }
      setMessage("Image prête. Vérifiez qu'elle représente fidèlement le produit avant toute approbation.");
      router.refresh();
    } catch { setMessage("Connexion interrompue; vérifiez l'état de l'import avant de relancer."); router.refresh(); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" className="btn btn-ghost btn-sm" onClick={generate} disabled={busy}>{busy ? "Création de l'image…" : "Créer une image premium avec l'IA"}</button>
    <p className="muted small">Utilise la clé OpenAI configurée dans le Centre IA et peut être facturé par OpenAI. Une seule génération par import.</p>
    {message ? <p className="notice" role="status">{message}</p> : null}
  </div>;
}
