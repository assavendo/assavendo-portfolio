"use client";
import { Score, TargetForm, usePost, levelClass } from "./shared";
import { ToolActions } from "./ToolActions";
import type { PagespeedReport, Rating } from "@/lib/tools/pagespeed";

type R = PagespeedReport & { url: string };
const word: Record<Rating, string> = { good: "Bon", average: "À améliorer", poor: "Insuffisant" };
const level = (r: Rating) => (r === "good" ? "ok" : r === "average" ? "warn" : "fail");

export default function PagespeedTool() {
  const { data, error, loading, run } = usePost<R>("/api/tools/pagespeed");
  const summary = data ? `Test de vitesse (mobile) de ${data.url} : note ${data.score}/100. ${data.metrics.map((m) => `${m.label} ${m.display}`).join(" ; ")}. Corrections prioritaires : ${data.opportunities.map((o) => o.title).join(" ; ") || "aucune"}.` : "";
  return (
    <div>
      <TargetForm onRun={run} loading={loading} label="Adresse de la page à mesurer" placeholder="exemple.fr" />
      {loading ? <p className="muted small" role="status">La mesure prend généralement entre 10 et 30 secondes : Google charge votre page comme un téléphone.</p> : null}
      {error ? <p className="alert alert-err" role="alert" style={{ marginTop: "1rem" }}>{error}</p> : null}
      {data ? (
        <div aria-live="polite">
          <Score value={data.score} label={`Note de performance sur mobile · ${data.url}`} />
          <div className="kpis">
            {data.metrics.map((m) => (
              <div className="kpi" key={m.id}><b>{m.display}</b><small>{m.label}</small><br /><span className={`badge ${levelClass(level(m.rating))}`} style={{ marginTop: ".4rem", display: "inline-block" }}>{word[m.rating]}</span></div>
            ))}
          </div>
          {data.field?.inp ? <p className="muted small" style={{ marginTop: "1rem" }}>Données de visiteurs réels (Chrome) : réactivité (INP) {data.field.inp.value} ms.</p> : null}
          <h3 style={{ marginTop: "1.5rem" }}>Les corrections qui comptent le plus</h3>
          {data.opportunities.length === 0 ? <p className="alert alert-ok">Aucune correction prioritaire détectée sur cette mesure.</p> : (
            <ol className="result-list">{data.opportunities.map((o, i) => (
              <li key={i}><span className="badge b-warn">{i + 1}</span><div><strong>{o.title}</strong><p>{o.detail}{o.savingsMs ? ` Gain estimé : environ ${(o.savingsMs / 1000).toFixed(1).replace(".", ",")} s.` : ""}</p></div></li>
            ))}</ol>
          )}
          <ToolActions summary={summary} subject={`Résultat du test de vitesse (${data.score}/100) pour ${data.url}`} cta="Obtenir le plan de correction" />
        </div>
      ) : null}
    </div>
  );
}
