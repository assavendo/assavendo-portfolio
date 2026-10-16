"use client";
import { Score, TargetForm, usePost, levelClass } from "./shared";
import type { Check } from "@/lib/tools/security-headers";

type R = { url: string; status: number; score: number; grade: string; checks: Check[]; redirects: string[] };
const word = { ok: "Conforme", warn: "À améliorer", fail: "Manquant" } as const;
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
              <li key={c.id}><span className={`badge ${levelClass(c.status)}`}>{word[c.status]}</span>
                <div><strong>{c.label}</strong><p>{c.why}</p>{c.found ? <p><code>{c.found}</code></p> : null}{c.fix ? <p><strong>Correction :</strong> <code>{c.fix}</code></p> : null}</div></li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
