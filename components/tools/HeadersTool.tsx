"use client";
import { Score, TargetForm, usePost, levelClass } from "./shared";
import { ToolActions } from "./ToolActions";
import type { Check } from "@/lib/tools/security-headers";

type R = { url: string; status: number; score: number; grade: string; checks: Check[]; redirects: string[] };
const word = { ok: "Conforme", warn: "À améliorer", fail: "Manquant" } as const;
type Word = keyof typeof word;
export default function HeadersTool() {
  const { data, error, loading, run } = usePost<R>("/api/tools/headers");
  return (
    <div>
      <TargetForm onRun={run} loading={loading} label="Adresse de votre site" placeholder="exemple.fr" />
      {error ? <p className="alert alert-err" role="alert" style={{ marginTop: "1rem" }}>{error}</p> : null}
      {data ? (
        <div aria-live="polite">
          <Score value={data.score} label={`Note ${data.grade} · ${data.url}`} />
          <ul className="result-list">
            {data.checks.map((c) => (
              <li key={c.id}><span className={`badge ${levelClass(c.status)}`}>{word[c.status as Word]}</span>
                <div><strong>{c.label}</strong><p>{c.why}</p>{c.found ? <p><code>{c.found}</code></p> : null}{c.fix ? <p><strong>Correction :</strong> <code>{c.fix}</code></p> : null}</div></li>
            ))}
          </ul>
          <ToolActions summary={`En-têtes de sécurité de ${data.url} : note ${data.grade} (${data.score}/100). À corriger : ${data.checks.filter((c) => c.status !== "ok").map((c) => c.label).join(", ") || "rien"}.`} subject={`Résultat des en-têtes de sécurité (note ${data.grade}) pour ${data.url}`} cta="Sécuriser mon site" />
        </div>
      ) : null}
    </div>
  );
}
