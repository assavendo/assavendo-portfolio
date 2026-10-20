export default function Loading() {
  return (
    <div className="section" role="status" aria-label="Chargement de la page"><div className="wrap">
      <div className="skeleton" style={{ height: 22, width: 160, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 54, width: "min(100%, 640px)", marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 20, width: "min(100%, 480px)", marginBottom: 40 }} />
      <div className="cards">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 280, borderRadius: 12 }} />)}</div>
    </div></div>
  );
}
