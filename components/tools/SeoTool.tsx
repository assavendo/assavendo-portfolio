"use client";
import { Score, TargetForm, usePost, levelClass } from "./shared";
import { ToolActions } from "./ToolActions";
import type { SeoReport } from "@/lib/tools/seo";

type R = SeoReport & { url: string };
export default function SeoTool() {
  const { data, error, loading, run } = usePost<R>("/api/tools/seo");
  return (
    <div>
      <TargetForm onRun={run} loading={loading} label="Adresse de la page à analyser" placeholder="exemple.fr/ma-page" />
      {error ? <p className="alert alert-err" role="alert" style={{ marginTop: "1rem" }}>{error}</p> : null}
      {data ? (
        <div aria-live="polite">
          <Score value={data.score} label="Qualité de l'optimisation de la page" />
          {data.wordCount < 80 ? <p className="alert alert-err" role="note" style={{ marginTop: "1rem" }}>Très peu de texte a été lu dans le code HTML reçu. Si votre site construit ses pages dans le navigateur (JavaScript), cette analyse sous-estime ce que voient les moteurs de recherche : traitez le résultat avec prudence.</p> : null}
          <div className="kpis">
            <div className="kpi"><b>{data.wordCount}</b><small>mots de contenu</small></div>
            <div className="kpi"><b>{data.h1.length}</b><small>titre(s) h1</small></div>
            <div className="kpi"><b>{data.images.missingAlt}/{data.images.total}</b><small>images sans alt</small></div>
            <div className="kpi"><b>{data.links.internal}</b><small>liens internes</small></div>
          </div>
          <h3 style={{ marginTop: "1.5rem" }}>Balises détectées</h3>
          <div className="table-scroll"><table className="tbl"><tbody>
            <tr><th scope="row">Titre</th><td>{data.title ?? <em>absent</em>}</td></tr>
            <tr><th scope="row">Description</th><td>{data.description ?? <em>absente</em>}</td></tr>
            <tr><th scope="row">Adresse canonique</th><td>{data.canonical ?? <em>absente</em>}</td></tr>
            <tr><th scope="row">Langue</th><td>{data.lang ?? <em>non déclarée</em>}</td></tr>
            <tr><th scope="row">Open Graph · JSON-LD</th><td>{data.openGraph ? "présent" : "absent"} · {data.jsonLd ? "présent" : "absent"}</td></tr>
          </tbody></table></div>
          <h3 style={{ marginTop: "1.5rem" }}>Corrections, par ordre de priorité</h3>
          {data.issues.length === 0 ? <p className="alert alert-ok">Aucun défaut détecté sur les points contrôlés.</p> : (
            <ul className="result-list">{[...data.issues].sort((a, b) => ["critique", "important", "conseil"].indexOf(a.level) - ["critique", "important", "conseil"].indexOf(b.level)).map((i, k) => (
              <li key={k}><span className={`badge ${i.level === "critique" ? "b-fail" : levelClass(i.level)}`}>{i.level}</span><div><strong>{i.text}</strong><p>{i.fix}</p></div></li>
            ))}</ul>
          )}
          <ToolActions summary={`Analyse SEO de ${data.url} : ${data.score}/100. ${data.issues.length} point(s) à corriger : ${data.issues.map((i) => i.text).join(" ; ")}`} subject={`Résultat de l'analyse SEO (${data.score}/100) pour ${data.url}`} cta="Faire corriger ma page" />
        </div>
      ) : null}
    </div>
  );
}
