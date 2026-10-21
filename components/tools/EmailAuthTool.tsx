"use client";
import { Score, TargetForm, usePost } from "./shared";
import { ToolActions } from "./ToolActions";
import type { DkimResult, EmailIssue } from "@/lib/tools/email-auth";

type Part = { record: string | null; issues: EmailIssue[] };
type R = { domain: string; spf: Part; dmarc: Part; dkim: DkimResult; score: number };
const cls = (l: EmailIssue["level"]) => (l === "ok" ? "b-ok" : l === "avertissement" ? "b-warn" : "b-fail");
function Block({ title, part }: { title: string; part: Part }) {
  return (
    <section style={{ marginTop: "1.4rem" }}><h3>{title}</h3>
      {part.record ? <pre className="code">{part.record}</pre> : <p className="muted">Aucun enregistrement trouvé.</p>}
      <ul className="result-list">{part.issues.map((i, k) => <li key={k}><span className={`badge ${cls(i.level)}`}>{i.level === "ok" ? "Conforme" : i.level === "erreur" ? "Erreur" : "À améliorer"}</span><div><strong>{i.text}</strong>{i.fix ? <p>{i.fix}</p> : null}</div></li>)}</ul>
    </section>
  );
}
export default function EmailAuthTool() {
  const { data, error, loading, run } = usePost<R>("/api/tools/email-auth");
  return (
    <div>
      <TargetForm onRun={run} loading={loading} label="Votre nom de domaine" placeholder="exemple.fr" />
      {error ? <p className="alert alert-err" role="alert" style={{ marginTop: "1rem" }}>{error}</p> : null}
      {data ? <div aria-live="polite"><Score value={data.score} label={`Authentification de ${data.domain}`} /><Block title="SPF : qui a le droit d'envoyer en votre nom" part={data.spf} /><Block title="DMARC : que faire des messages qui échouent" part={data.dmarc} />
        <Block title="DKIM : la signature de vos messages" part={{ record: data.dkim.found.map((f) => `${f.selector} → ${f.record}`).join("\n") || null, issues: [data.dkim.issue] }} />
        <ToolActions summary={`Authentification e-mail de ${data.domain} : note ${data.score}/100. SPF : ${data.spf.record ?? "absent"}. DMARC : ${data.dmarc.record ?? "absent"}. DKIM : ${data.dkim.issue.text}`} subject={`Résultat du test SPF/DMARC/DKIM (${data.score}/100) pour ${data.domain}`} cta="Faire corriger mon e-mail" /></div> : null}
    </div>
  );
}
