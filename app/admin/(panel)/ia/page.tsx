import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateMasterKey } from "@/lib/ai/crypto";
import { PRESETS, ROLES } from "@/lib/ai/policy";
import {
  addKey, askProduct, askResearch, decideTask, keyAction, saveAgent, saveSettings
} from "@/app/actions/ai";
import {
  addManusAccount, decideAiApproval, resolveAiIncident, saveAiBudget, saveAiModel, setAgentTool, setAiMode,
  testAiAccount, toggleAiAccount, toggleAiProvider, toggleAiTool,
} from "@/app/actions/ai-control";

export const dynamic = "force-dynamic";

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("fr-FR") : "—");
const money = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(n));
const h2 = { fontSize: "1.2rem" } as const;
const statusClass = (status: string) => status === "healthy" || status === "active" || status === "approved" ? "s-published" : status === "disabled" || status === "deprecated" ? "s-draft" : "s-draft";

export default async function CentreIA({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = supabaseAdmin();

  const [
    { data: settings },
    { data: control },
    { data: keys },
    { data: providers },
    { data: accounts },
    { data: models },
    { data: agents },
    { data: tools },
    { data: agentTools },
    { data: budgets },
    { data: policies },
    { data: routes },
    { data: tasks },
    { data: approvals },
    { data: workflows },
    { data: incidents },
    { data: runs },
    { data: auditLogs },
    { data: notes },
  ] = await Promise.all([
    db.from("ai_settings").select("*").eq("id", 1).single(),
    db.from("ai_control_state").select("*").eq("id", 1).single(),
    db.from("ai_keys").select("id,provider,label,model,key_hint,roles,priority,enabled,cooldown_until,fail_count,last_error,last_ok_at,daily_limit,used_day,used_today").order("priority"),
    db.from("ai_providers").select("*").order("name"),
    db.from("ai_accounts").select("id,provider_slug,name,environment,credential_type,credential_id,status,allowed_agents,quota,rate_limits,cost_policy,last_success,last_failure,last_429,created_at").order("provider_slug").order("name"),
    db.from("ai_models").select("*").order("provider_slug").order("display_name"),
    db.from("ai_agents").select("*").order("slug"),
    db.from("ai_tools").select("*").order("risk_level").order("name"),
    db.from("ai_agent_tools").select("agent_slug,tool_slug,allowed"),
    db.from("ai_budgets").select("*").order("scope_type").order("scope_id"),
    db.from("ai_policies").select("slug,version,name,enabled,created_at").order("slug").order("version", { ascending: false }),
    db.from("ai_routes").select("id,slug,agent_slug,task_kind,required_capability,data_classification,max_latency_ms,max_cost_usd,enabled,priority").order("priority"),
    db.from("ai_tasks").select("*").in("status", ["pending","queued","running","awaiting_approval","approved"]).order("created_at", { ascending: false }).limit(100),
    db.from("ai_approvals").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(50),
    db.from("ai_workflows").select("id,slug,version,name,trigger_type,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(50),
    db.from("ai_incidents").select("*").in("status", ["open","acknowledged"]).order("started_at", { ascending: false }).limit(50),
    db.from("ai_runs").select("*").order("created_at", { ascending: false }).limit(40),
    db.from("ai_audit_logs").select("id,timestamp,actor_type,actor_id,action,resource_type,resource_id,policy_decision,result,error").order("created_at", { ascending: false }).limit(60),
    db.from("ai_tasks").select("id,title,result,created_at").eq("kind","research_note").order("created_at", { ascending: false }).limit(3),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const callsToday = (runs ?? []).filter((r) => String(r.created_at).slice(0, 10) === today).length;
  const successfulToday = (runs ?? []).filter((r) => String(r.created_at).slice(0, 10) === today && r.ok).length;
  const fallbackToday = (runs ?? []).filter((r) => String(r.created_at).slice(0, 10) === today && r.fallback_used).length;
  const costToday = (runs ?? []).filter((r) => String(r.created_at).slice(0, 10) === today).reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0);
  const openIncidents = incidents?.length ?? 0;
  const pendingApprovals = approvals?.length ?? 0;
  const activeTasks = (tasks ?? []).filter((t) => ["running","queued","awaiting_approval"].includes(t.status)).length;
  const healthyProviders = (providers ?? []).filter((p) => p.enabled && p.status === "healthy").length;
  const masterOk = Boolean(process.env.AI_MASTER_KEY);
  const mode = String(control?.mode ?? (settings?.enabled ? "FULL" : "NO_AI"));
  const accountByCredential = new Map((accounts ?? []).filter((a) => a.credential_id).map((a) => [String(a.credential_id), a]));

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: "1.8rem", marginBottom: ".35rem" }}>AI Control Center</h1>
        <p className="muted" style={{ maxWidth: "76ch" }}>Control Room centrale : fournisseurs, comptes, modèles, agents, outils, policies, budgets, workflows, validations, incidents, audit et observabilité. Les secrets complets restent côté serveur.</p>
      </div>
      <span className={`status ${statusClass(mode === "FULL" ? "healthy" : "disabled")}`}>{mode}</span>
    </div>

    {sp.ok ? <p className="alert alert-ok" role="status">{sp.ok}</p> : null}
    {sp.erreur ? <p className="alert alert-err" role="alert">{sp.erreur}</p> : null}

    {!masterOk ? <section className="panel" role="note" style={{ border: "1px solid var(--danger, #b42318)" }}>
      <h2 style={h2}>Secret Manager serveur requis</h2>
      <p>Définissez <code>AI_MASTER_KEY</code> côté serveur uniquement. Cette clé ne doit jamais être copiée dans le navigateur ni dans Git.</p>
      <p><code style={{ wordBreak: "break-all", userSelect: "all" }}>{generateMasterKey()}</code></p>
    </section> : null}

    <section aria-label="AI KPIs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".75rem", margin: "1rem 0" }}>
      {[
        ["Providers sains", `${healthyProviders}/${providers?.length ?? 0}`],
        ["Tâches actives", String(activeTasks)],
        ["Validations", String(pendingApprovals)],
        ["Incidents", String(openIncidents)],
        ["Appels aujourd'hui", String(callsToday)],
        ["Taux succès", callsToday ? `${Math.round((successfulToday / callsToday) * 100)}%` : "—"],
        ["Fallbacks", String(fallbackToday)],
        ["Coût aujourd'hui", money(costToday)],
      ].map(([label, value]) => <div key={label} className="panel" style={{ margin: 0 }}>
        <p className="muted small">{label}</p><strong style={{ fontSize: "1.35rem" }}>{value}</strong>
      </div>)}
    </section>

    <section className="panel">
      <h2 style={h2}>Control Room · mode global</h2>
      <p className="muted small">FULL = tout autorisé par policy · DEGRADED = automatisations non critiques réduites · SAFE = lecture/brouillons contrôlés · NO_AI = aucune nouvelle tâche · MAINTENANCE = administration limitée.</p>
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        {(["FULL","DEGRADED","SAFE","NO_AI","MAINTENANCE"] as const).map((m) => <form action={setAiMode} key={m}>
          <input type="hidden" name="mode" value={m} /><input type="hidden" name="reason" value={`Admin Control Room → ${m}`} />
          <button className={`btn ${m === mode ? "btn-primary" : "btn-ghost"} btn-sm`} disabled={m === mode}>{m}</button>
        </form>)}
      </div>
      <p className="muted small" style={{ marginTop: ".7rem" }}>Dernier changement : {fmt(control?.updated_at)} · motif : {control?.reason || "—"}</p>
    </section>

    <section className="panel">
      <h2 style={h2}>1. Providers</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Provider</th><th>Adapter</th><th>État</th><th>Health</th><th>Capacités</th><th>Action</th></tr></thead><tbody>
        {(providers ?? []).map((p) => <tr key={p.slug}>
          <td><strong>{p.name}</strong><br/><span className="muted small">{p.slug}</span></td>
          <td>{p.adapter}</td><td><span className={`status ${statusClass(p.status)}`}>{p.status}</span></td><td>{Number(p.health_score ?? 0).toFixed(0)}/100</td>
          <td className="small">{(p.capabilities ?? []).join(", ") || "—"}</td>
          <td><form action={toggleAiProvider}><input type="hidden" name="slug" value={p.slug}/><input type="hidden" name="enabled" value={p.enabled ? "false" : "true"}/><button className="btn btn-ghost btn-sm">{p.enabled ? "Désactiver" : "Activer"}</button></form></td>
        </tr>)}</tbody></table></div>
      <p className="muted small">Manus est enregistré comme adapter agentique mais reste désactivé tant qu'un credential et un test de santé ne sont pas validés.</p>
    </section>

    <section className="panel">
      <h2 style={h2}>2. Accounts & credentials</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Compte</th><th>Provider</th><th>Credential</th><th>État</th><th>Agents autorisés</th><th>Dernier succès</th><th>Actions</th></tr></thead><tbody>
      {(accounts ?? []).map((a) => <tr key={a.id}>
        <td><strong>{a.name}</strong><br/><span className="muted small">{a.environment}</span></td>
        <td>{a.provider_slug}</td>
        <td>{a.credential_type === "ai_key" ? <>{(keys ?? []).find((k) => k.id === a.credential_id)?.label ?? "Clé"} · …{(keys ?? []).find((k) => k.id === a.credential_id)?.key_hint ?? "—"}</> : a.credential_type}</td>
        <td><span className={`status ${statusClass(a.status)}`}>{a.status}</span></td>
        <td className="small">{a.allowed_agents?.length ? a.allowed_agents.join(", ") : "Tous selon policy"}</td>
        <td className="small">{fmt(a.last_success)}</td>
        <td><div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
          <form action={testAiAccount}><input type="hidden" name="id" value={a.id}/><button className="btn btn-ghost btn-sm">Tester</button></form>
          <form action={toggleAiAccount}><input type="hidden" name="id" value={a.id}/><input type="hidden" name="enabled" value={a.status === "active" ? "false" : "true"}/><button className="btn btn-ghost btn-sm">{a.status === "active" ? "Désactiver" : "Activer"}</button></form>
        </div></td>
      </tr>)}</tbody></table></div>

      <h3 style={{ fontSize: "1.05rem", marginTop: "1.2rem" }}>Ajouter un compte Manus</h3>
      <form action={addManusAccount} className="buy-form" autoComplete="off">
        <label className="field">Nom du compte<input className="input" name="name" required maxLength={120} placeholder="Manus production"/></label>
        <label className="field">Clé API Manus<input className="input" name="secret" type="password" required minLength={10} maxLength={400} autoComplete="new-password"/></label>
        <label className="field">Profil<select className="input" name="agent_profile"><option value="standard">standard</option><option value="lite">lite</option><option value="max">max</option></select></label>
        <button className="btn btn-primary" disabled={!masterOk}>{masterOk ? "Chiffrer et enregistrer Manus" : "AI_MASTER_KEY requis"}</button>
      </form>

      <h3 style={{ fontSize: "1.05rem" }}>Ajouter une clé OpenAI-compatible</h3>
      <form action={addKey} className="buy-form" autoComplete="off">
        <label className="field">Service<select className="input" name="provider" defaultValue="groq">{Object.entries(PRESETS).map(([v,p]) => <option key={v} value={v}>{p.label}</option>)}</select></label>
        <label className="field">Nom logique<input className="input" name="label" required maxLength={80}/></label>
        <label className="field">Clé API<input className="input" name="secret" type="password" required minLength={10} maxLength={400} autoComplete="new-password"/></label>
        <label className="field">Modèle<input className="input" name="model" maxLength={120} placeholder="Par défaut du provider"/></label>
        <label className="field">Base URL personnalisée (custom uniquement)<input className="input" name="base_url" type="url" placeholder="https://…/v1"/></label>
        <fieldset><legend className="f-label">Agents autorisés</legend>{ROLES.map((r) => <label key={r} className="f-check"><input type="checkbox" name="roles" value={r} defaultChecked={r === "general"}/> {r}</label>)}</fieldset>
        <label className="field">Priorité<input className="input" name="priority" type="number" min={1} max={10000} defaultValue={100}/></label>
        <label className="field">Limite appels/jour<input className="input" name="daily_limit" type="number" min={1}/></label>
        <button className="btn btn-primary" disabled={!masterOk}>{masterOk ? "Enregistrer et gouverner" : "AI_MASTER_KEY requis"}</button>
      </form>
    </section>

    <section className="panel">
      <h2 style={h2}>3. Models · governance</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Provider / modèle</th><th>Capacités</th><th>Classification</th><th>État</th><th>Benchmark</th><th>Action</th></tr></thead><tbody>
      {(models ?? []).map((m) => <tr key={m.id}><td><strong>{m.display_name}</strong><br/><span className="muted small">{m.provider_slug} · <code>{m.model_key}</code></span></td><td className="small">{(m.capabilities ?? []).join(", ")}</td><td className="small">{(m.data_classifications ?? []).join(", ")}</td><td><span className={`status ${statusClass(m.status)}`}>{m.status}</span></td><td>{m.benchmark_score == null ? "—" : Number(m.benchmark_score).toFixed(1)}</td><td><form action={saveAiModel} style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}><input type="hidden" name="id" value={m.id}/><select className="input" name="status" defaultValue={m.status}><option value="candidate">candidate</option><option value="approved">approved</option><option value="disabled">disabled</option><option value="deprecated">deprecated</option></select><input className="input" name="benchmark_score" type="number" min="0" max="100" step="0.1" defaultValue={m.benchmark_score ?? ""} style={{ maxWidth: 90 }}/><button className="btn btn-ghost btn-sm">Valider</button></form></td></tr>)}</tbody></table></div>
    </section>

    <section className="panel">
      <h2 style={h2}>4. Agents · permissions · versions</h2>
      {(agents ?? []).map((a) => {
        const allowed = (agentTools ?? []).filter((x) => x.agent_slug === a.slug && x.allowed).map((x) => x.tool_slug);
        return <form key={a.slug} action={saveAgent} className="panel buy-form" style={{ marginBottom: ".8rem" }}>
          <input type="hidden" name="slug" value={a.slug}/><input type="hidden" name="version" value={a.version ?? 1}/>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}><div><strong>{a.name}</strong> · <span className="muted">{a.slug}</span><p className="muted small">{a.description}</p></div><span className={`status ${a.enabled ? "s-published" : "s-draft"}`}>{a.enabled ? "actif" : "désactivé"}</span></div>
          <label className="f-check"><input type="checkbox" name="enabled" defaultChecked={a.enabled}/> Activer</label>
          <label className="field">Objectif<input className="input" name="objective" maxLength={500} defaultValue={a.objective ?? ""}/></label>
          <label className="field">Autonomie (0 observation → 4 critique)<input className="input" name="autonomy_level" type="number" min={0} max={4} defaultValue={a.autonomy_level ?? 1}/></label>
          <label className="field">Mode<select className="input" name="autonomy" defaultValue={a.autonomy ?? "draft"}><option value="draft">Brouillon / contrôlé</option><option value="auto">Automatique (support uniquement)</option></select></label>
          <label className="field">Prompt système<textarea className="input" name="system_prompt" rows={6} maxLength={8000} defaultValue={a.system_prompt}/></label>
          <p className="muted small">Outils autorisés : {allowed.length ? allowed.join(", ") : "aucun"}</p>
          <button className="btn btn-ghost btn-sm">Enregistrer la gouvernance</button>
        </form>;
      })}
    </section>

    <section className="panel">
      <h2 style={h2}>5. Tools · allowlist</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Outil</th><th>Risque</th><th>Approval</th><th>État</th><th>Actions</th></tr></thead><tbody>
      {(tools ?? []).map((t) => <tr key={t.slug}><td><strong>{t.name}</strong><br/><span className="muted small">{t.slug}</span></td><td>{t.risk_level}</td><td>{t.requires_approval ? "Oui" : "Non"}</td><td>{t.enabled ? "actif" : "bloqué"}</td><td><form action={toggleAiTool}><input type="hidden" name="slug" value={t.slug}/><input type="hidden" name="enabled" value={t.enabled ? "false" : "true"}/><button className="btn btn-ghost btn-sm">{t.enabled ? "Désactiver" : "Activer"}</button></form></td></tr>)}</tbody></table></div>
    </section>

    <section className="panel">
      <h2 style={h2}>6. Budgets & garde-fous</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Scope</th><th>Jour</th><th>Semaine</th><th>Mois</th><th>/ tâche</th></tr></thead><tbody>
        {(budgets ?? []).map((b) => <tr key={b.id}><td>{b.scope_type} · {b.scope_id}</td><td>{money(Number(b.daily_limit_usd))}</td><td>{money(Number(b.weekly_limit_usd))}</td><td>{money(Number(b.monthly_limit_usd))}</td><td>{money(Number(b.per_task_limit_usd))}</td></tr>)}
      </tbody></table></div>
      <form action={saveAiBudget} className="buy-form" style={{ marginTop: "1rem" }}>
        <label className="field">Scope<select className="input" name="scope_type"><option>global</option><option>provider</option><option>account</option><option>agent</option><option>workflow</option><option>task</option><option>team</option></select></label>
        <label className="field">Identifiant<input className="input" name="scope_id" defaultValue="assavendo" required/></label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: ".5rem" }}>
          <input className="input" name="daily_limit_usd" type="number" min="0" step="0.01" placeholder="Jour USD" defaultValue="25"/>
          <input className="input" name="weekly_limit_usd" type="number" min="0" step="0.01" placeholder="Semaine USD" defaultValue="100"/>
          <input className="input" name="monthly_limit_usd" type="number" min="0" step="0.01" placeholder="Mois USD" defaultValue="300"/>
          <input className="input" name="per_task_limit_usd" type="number" min="0" step="0.01" placeholder="/ tâche USD" defaultValue="2"/>
        </div>
        <button className="btn btn-ghost btn-sm">Enregistrer le budget</button>
      </form>
      <p className="muted small">Seuils recommandés du cahier : 70 % avertissement · 85 % restriction · 95 % modèles coûteux réduits · 100 % blocage ou politique approuvée.</p>
    </section>

    <section className="panel">
      <h2 style={h2}>7. Policies & routing</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Policy</th><th>Version</th><th>État</th><th>Route</th><th>Capacité</th><th>Limites</th></tr></thead><tbody>
      {(policies ?? []).map((p) => <tr key={`${p.slug}-${p.version}`}><td>{p.name}<br/><span className="muted small">{p.slug}</span></td><td>{p.version}</td><td>{p.enabled ? "active" : "off"}</td><td colSpan={3}>Policy versionnée, décisions centralisées</td></tr>)}
      {(routes ?? []).map((r) => <tr key={r.id}><td><span className="muted small">Route</span></td><td colSpan={2}>{r.slug}</td><td>{r.agent_slug} · {r.task_kind}</td><td>{r.required_capability}</td><td>{r.max_latency_ms ? `${r.max_latency_ms} ms` : "—"} · {money(Number(r.max_cost_usd))}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="panel">
      <h2 style={h2}>8. Approval Center</h2>
      {(approvals ?? []).length === 0 ? <p className="muted">Aucune action en attente.</p> : (approvals ?? []).map((a) => <div key={a.id} className="panel" style={{ marginBottom: ".6rem" }}>
        <p><strong>{a.action}</strong> · {a.agent_slug ?? "système"} · risque {a.risk_level} · {fmt(a.created_at)}</p>
        <p className="muted small">{String(a.context?.summary ?? "Contexte protégé")}</p>
        <form action={decideAiApproval} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}><input type="hidden" name="id" value={a.id}/><input className="input" name="reason" placeholder="Justification / motif" maxLength={1000}/><button className="btn btn-primary btn-sm" name="decision" value="approved">Approuver</button><button className="btn btn-ghost btn-sm" name="decision" value="rejected">Refuser</button><button className="btn btn-ghost btn-sm" name="decision" value="canceled">Annuler</button></form>
      </div>)}
    </section>

    <section className="panel">
      <h2 style={h2}>9. Workflows</h2>
      {(workflows ?? []).length === 0 ? <p className="muted">Aucun workflow enregistré.</p> : <div className="table-scroll"><table className="tbl"><thead><tr><th>Workflow</th><th>Trigger</th><th>Statut</th><th>Version</th><th>Mis à jour</th></tr></thead><tbody>{(workflows ?? []).map((w) => <tr key={w.id}><td><strong>{w.name}</strong><br/><span className="muted small">{w.slug}</span></td><td>{w.trigger_type}</td><td>{w.status}</td><td>{w.version}</td><td>{fmt(w.updated_at)}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="panel">
      <h2 style={h2}>10. Incidents</h2>
      {(incidents ?? []).length === 0 ? <p className="muted">Aucun incident ouvert.</p> : (incidents ?? []).map((i) => <div key={i.id} className="panel" style={{ marginBottom: ".6rem" }}><p><strong>{i.title}</strong> · {i.severity} · {i.kind}</p><p className="muted small">{fmt(i.started_at)} · {i.provider_slug ?? "global"} · {String(i.details?.message ?? "")}</p><form action={resolveAiIncident} style={{ display:"flex", gap:".5rem" }}><input type="hidden" name="id" value={i.id}/><button className="btn btn-ghost btn-sm" name="status" value="acknowledged">Prendre en compte</button><button className="btn btn-primary btn-sm" name="status" value="resolved">Résoudre</button></form></div>)}
    </section>

    <section className="panel">
      <h2 style={h2}>11. Tasks & observabilité</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Task</th><th>Agent</th><th>Statut</th><th>Risque</th><th>Attempts</th><th>Créée</th></tr></thead><tbody>{(tasks ?? []).map((t) => <tr key={t.id}><td>{t.title}<br/><span className="muted small">{t.kind}</span></td><td>{t.agent}</td><td>{t.status}</td><td>{t.risk_level ?? "medium"}</td><td>{t.attempts ?? 0}</td><td>{fmt(t.created_at)}</td></tr>)}</tbody></table></div>
      <div className="table-scroll" style={{ marginTop: "1rem" }}><table className="tbl"><thead><tr><th>Date</th><th>Provider</th><th>Modèle</th><th>Agent</th><th>Résultat</th><th>Latency</th><th>Cost</th><th>Fallback</th></tr></thead><tbody>{(runs ?? []).slice(0,25).map((r) => <tr key={r.id}><td>{fmt(r.created_at)}</td><td>{r.provider_slug ?? "—"}</td><td>{r.model_id ?? "—"}</td><td>{r.agent}</td><td>{r.ok ? "OK" : r.error}</td><td>{r.latency_ms ? `${r.latency_ms} ms` : "—"}</td><td>{money(Number(r.estimated_cost_usd))}</td><td>{r.fallback_used ? "Oui" : "Non"}</td></tr>)}</tbody></table></div>
    </section>

    <section className="panel">
      <h2 style={h2}>12. Audit append-only</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Ressource</th><th>Policy</th><th>Résultat</th></tr></thead><tbody>{(auditLogs ?? []).map((a) => <tr key={a.id}><td>{fmt(a.timestamp)}</td><td>{a.actor_type} · {a.actor_id ?? "—"}</td><td>{a.action}</td><td>{a.resource_type ?? "—"} · {a.resource_id ?? "—"}</td><td>{a.policy_decision ?? "—"}</td><td>{a.result ?? a.error ?? "—"}</td></tr>)}</tbody></table></div>
    </section>

    <section className="panel">
      <h2 style={h2}>13. Legacy keys / actions</h2>
      {(keys ?? []).map((k) => <div key={k.id} className="panel" style={{ marginBottom: ".6rem" }}>
        <p><strong>{k.label}</strong> · {k.provider} · <code>{k.model}</code> · …{k.key_hint} · priorité {k.priority}</p>
        <p className="muted small">Usage aujourd'hui : {k.used_day === today ? k.used_today : 0}{k.daily_limit ? ` / ${k.daily_limit}` : ""} · dernier succès {fmt(k.last_ok_at)} · erreur {k.last_error ?? "—"}</p>
        <form action={keyAction} style={{ display:"flex", gap:".4rem", flexWrap:"wrap" }}><input type="hidden" name="id" value={k.id}/><button className="btn btn-ghost btn-sm" name="op" value="test">Tester</button><button className="btn btn-ghost btn-sm" name="op" value="toggle">{k.enabled ? "Désactiver" : "Activer"}</button><button className="btn btn-ghost btn-sm" name="op" value="reset">Reset</button><button className="btn btn-ghost btn-sm" name="op" value="delete">Supprimer</button></form>
      </div>)}
    </section>

    <section className="panel">
      <h2 style={h2}>14. Agents existants · demandes et approbations historiques</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:".8rem" }}>
        <form action={askResearch} className="buy-form"><label className="field">Recherche produit / catalogue<textarea className="input" name="request" rows={3} maxLength={1500} placeholder="Ex. analyse des catégories qui manquent"/></label><button className="btn btn-ghost btn-sm">Lancer</button></form>
        <form action={askProduct} className="buy-form"><label className="field">Nouvelle fiche produit<textarea className="input" name="request" rows={3} maxLength={1500} placeholder="Décrire la fiche à préparer"/></label><button className="btn btn-ghost btn-sm">Proposer</button></form>
      </div>
      {(notes ?? []).map((n) => <div key={n.id} className="panel"><p className="muted small">{n.title} · {fmt(n.created_at)}</p><p style={{ whiteSpace:"pre-wrap" }}>{String(n.result?.text ?? "")}</p></div>)}
    </section>

    <section className="panel">
      <h2 style={h2}>15. Definition of Done IA</h2>
      <p className="muted">Pour chaque nouvel agent, provider ou workflow : rôle, outils, permissions, budget, policy, fallback, tests, kill switch, monitoring, version et audit doivent être présents avant passage en production.</p>
      <p className="muted small">Le commerce reste fonctionnel en NO_AI : catalogue, recherche classique, panier, paiement, commandes, livraison, téléchargements et support manuel ne doivent pas dépendre de ce Control Center.</p>
    </section>
  </div>;
}
