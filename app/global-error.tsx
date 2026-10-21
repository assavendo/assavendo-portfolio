"use client";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr"><body style={{ fontFamily: "system-ui, sans-serif", margin: 0, display: "grid", minHeight: "100vh", placeItems: "center", background: "#0a1d2c", color: "#fff", padding: "1.5rem" }}>
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: "2rem" }}>Assavendo est momentanément indisponible.</h1>
        <p>Un incident empêche d'afficher le site. Réessayez dans un instant.</p>
        <button onClick={reset} style={{ background: "#f5c400", color: "#2f2400", border: 0, padding: ".9rem 1.4rem", fontWeight: 700, fontSize: "1rem", borderRadius: 6, cursor: "pointer" }}>Réessayer</button>
      </div>
    </body></html>
  );
}
