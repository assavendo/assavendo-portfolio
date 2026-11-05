import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateMasterKey } from "@/lib/ai/crypto";
import { PRESETS, ROLES } from "@/lib/ai/policy";
import { addKey, askProduct, askResearch, decideTask, keyAction, saveAgent, saveSettings } from "@/app/actions/ai";

export const dynamic = "force-dynamic";
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");
const h2 = { fontSize: "1.2rem" } as const;

export default async function CentreIA({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await requireAdmin(); const sp = await searchParams; const db = supabaseAdmin();
  const [{ data: settings }, { data: keys }, { data: agents }, { data: tasks }, { data: notes }, { data: runs }] = await Promise.all([
    db.from("ai_settings").select("*").eq("id", 1).single(),
    db.from("ai_keys").select("id, provider, label, model, key_hint, roles, priority, enabled, cooldown_until, fail_count, last_error, last_ok_at, daily_limit, used_day, used_today").order("priority"),
    db.from("ai_agents").select("*").order("slug"),
    db.from("ai_tasks").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    db.from("ai_tasks").select("id, title, result, created_at").eq("kind", "research_note").order("created_at", { ascending: false }).limit(3),
    db.from("ai_runs").select("*").order("created_at", { ascending: false }).limit(25),
  ]);
  const masterOk = Boolean(process.env.AI_MASTER_KEY); const today = new Date().toISOString().slice(0, 10); const now = Date.now();
  const status = (k: NonNullable<typeof keys>[number]): [string, string] =>
    !k.enabled ? ["Désactivée", "s-draft"]
      : k.cooldown_until && new Date(k.cooldown_until).getTime() > now ? [`En pause jusqu'à ${new Date(k.cooldown_until).toLocaleTimeString("fr-FR")}`, "s-draft"]
        : ["Disponible", "s-published"];

  return <div>
    <h1 style={{ fontSize: "1.8rem" }}>Centre IA</h1>
    <p className="muted" style={{ maxWidth: "70ch" }}>Vos clés API (OpenRouter, Groq, DeepSeek, OpenAI ou service compatible) travaillent ensemble : si l&apos;une tombe ou atteint sa limite, la suivante prend le relais. Les clés sont chiffrées et jamais affichées. Par défaut, <strong>rien n&apos;est envoyé ni publié sans votre validation</strong>.</p>
    {sp.ok ? <p className="alert alert-ok" role="status">{sp.ok}</p> : null}
    {sp.erreur ? <p className="alert alert-err" role="alert">{sp.erreur}</p> : null}

    {!masterOk ? <div className="panel" role="note"><h2 style={h2}>Étape 1 : clé de chiffrement (obligatoire)</h2>
      <p>Dans Vercel, <strong>Settings, Environment Variables</strong>, ajoutez <code>AI_MASTER_KEY</code> (Production) avec la valeur ci-dessous, puis redéployez. Copiez-la et conservez-la : sans elle, les clés enregistrées ne pourraient plus être lues. Ne la partagez avec personne.</p>
      <p><code style={{ wordBreak: "break-all", userSelect: "all" }}>{generateMasterKey()}</code></p></div> : null}

    <section className="panel" aria-labelledby="g-t"><h2 id="g-t" style={h2}>Interrupteur général</h2>
      <form action={saveSettings} className="buy-form">
        <label className="f-check"><input type="checkbox" name="enabled" defaultChecked={settings?.enabled} /> IA activées (décochez pour tout arrêter immédiatement)</label>
        <label className="field">Plafond d&apos;appels par jour<input className="input" name="daily_call_cap" type="number" min={1} max={100000} defaultValue={settings?.daily_call_cap ?? 500} /></label>
        <button className="btn btn-primary btn-sm">Enregistrer</button>
      </form></section>

    <section className="panel" aria-labelledby="k-t"><h2 id="k-t" style={h2}>Clés API ({keys?.length ?? 0})</h2>
      {(keys ?? []).length === 0 ? <p className="muted">Aucune clé. Ajoutez-en une ci-dessous.</p> : (keys ?? []).map((k) => { const [label, cls] = status(k); return <div key={k.id} className="panel">
        <p><strong>{k.label}</strong> · {PRESETS[k.provider]?.label} · <code>{k.model}</code> · clé …{k.key_hint} <span className={`status ${cls}`}>{label}</span></p>
        <p className="muted small">Rôles : {k.roles.join(", ")} · priorité {k.priority} · aujourd&apos;hui : {k.used_day === today ? k.used_today : 0}{k.daily_limit ? ` / ${k.daily_limit}` : ""} · dernier succès : {fmt(k.last_ok_at)}{k.last_error ? ` · dernière erreur : ${k.last_error}` : ""}</p>
        <form action={keyAction} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}><input type="hidden" name="id" value={k.id} />
          <button name="op" value="test" className="btn btn-ghost btn-sm">Tester</button>
          <button name="op" value="toggle" className="btn btn-ghost btn-sm">{k.enabled ? "Désactiver" : "Activer"}</button>
          <button name="op" value="reset" className="btn btn-ghost btn-sm">Lever la pause</button>
          <button name="op" value="delete" className="btn btn-ghost btn-sm">Supprimer</button></form></div>; })}
      <h3 style={{ fontSize: "1.05rem", marginTop: "1.2rem" }}>Ajouter une clé</h3>
      <form action={addKey} className="buy-form" autoComplete="off">
        <label className="field">Service<select className="input" name="provider" defaultValue="groq">{Object.entries(PRESETS).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}</select></label>
        <label className="field">Nom de la clé (ex. « Groq compte 2 »)<input className="input" name="label" required maxLength={80} /></label>
        <label className="field">Clé API<input className="input" name="secret" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label className="field">Modèle (vide = modèle par défaut du service)<input className="input" name="model" maxLength={120} placeholder="ex. llama-3.3-70b-versatile" /></label>
        <label className="field">Adresse du service (uniquement pour « personnalisé », en https)<input className="input" name="base_url" type="url" placeholder="https://…/v1" /></label>
        <fieldset><legend className="f-label">Rôles autorisés</legend>{ROLES.map((r) => <label key={r} className="f-check"><input type="checkbox" name="roles" value={r} defaultChecked={r === "general"} /> {r === "general" ? "général (tous les agents)" : r}</label>)}</fieldset>
        <label className="field">Priorité (1 = utilisée en premier)<input className="input" name="priority" type="number" min={1} max={10000} defaultValue={100} /></label>
        <label className="field">Limite d&apos;appels par jour (facultatif)<input className="input" name="daily_limit" type="number" min={1} /></label>
        <button className="btn btn-primary" disabled={!masterOk}>{masterOk ? "Chiffrer et enregistrer" : "Étape 1 requise d'abord"}</button>
      </form>
      <p className="muted small">Services pris en charge : ceux au format « chat completions » d&apos;OpenAI (OpenRouter, Groq, DeepSeek, OpenAI, et tout service compatible). Manus n&apos;est pas encore branché : son API fonctionne par tâches asynchrones et demande un adaptateur dédié.</p></section>

    <section className="panel" aria-labelledby="a-t"><h2 id="a-t" style={h2}>Agents</h2>
      {(agents ?? []).map((a) => <form key={a.slug} action={saveAgent} className="panel buy-form"><input type="hidden" name="slug" value={a.slug} />
        <p><strong>{a.name}</strong> : <span className="muted">{a.description}</span></p>
        <label className="f-check"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> Activé</label>
        {a.slug === "support"
          ? <label className="field">Mode<select className="input" name="autonomy" defaultValue={a.autonomy}><option value="draft">Brouillon : je valide chaque réponse (recommandé)</option><option value="auto">Automatique : envoi seul si la réponse passe les contrôles (courte, sans lien externe, sans e-mail, sans remboursement ni remise)</option></select></label>
          : <input type="hidden" name="autonomy" value="draft" />}
        <label className="field">Consigne de l&apos;agent<textarea className="input" name="system_prompt" rows={5} defaultValue={a.system_prompt} maxLength={8000} /></label>
        <button className="btn btn-ghost btn-sm">Enregistrer</button></form>)}
    </section>

    <section className="panel" aria-labelledby="d-t"><h2 id="d-t" style={h2}>Demander à un agent</h2>
      <form action={askResearch} className="buy-form"><label className="field">Recherche et analyse du catalogue<textarea className="input" name="request" rows={3} maxLength={1500} placeholder="Ex. Quelles catégories numériques manquent à ma boutique ?" /></label><button className="btn btn-ghost btn-sm">Lancer la recherche</button></form>
      <form action={askProduct} className="buy-form" style={{ marginTop: "1rem" }}><label className="field">Préparer une fiche produit<textarea className="input" name="request" rows={3} maxLength={1500} placeholder="Ex. Un guide PDF « Débuter en jardinage », 9,90 €, 40 pages." /></label><button className="btn btn-ghost btn-sm">Proposer la fiche</button></form>
      {(notes ?? []).map((n) => <div key={n.id} className="panel"><p className="muted small">{n.title} · {fmt(n.created_at)}</p><p style={{ whiteSpace: "pre-wrap" }}>{(n.result as { text?: string } | null)?.text}</p></div>)}
    </section>

    <section className="panel" aria-labelledby="v-t"><h2 id="v-t" style={h2}>À valider ({tasks?.length ?? 0})</h2>
      {(tasks ?? []).length === 0 ? <p className="muted">Rien en attente.</p> : (tasks ?? []).map((t) => { const p = t.payload as Record<string, unknown>; return <form key={t.id} action={decideTask} className="panel buy-form"><input type="hidden" name="id" value={t.id} />
        <p><strong>{t.kind === "reply_draft" ? "Réponse à un client" : "Fiche produit proposée"}</strong> · {t.title} · <span className="muted small">{fmt(t.created_at)}</span></p>
        {t.kind === "reply_draft"
          ? <><p className="muted small">À : {String(p.to)}</p><label className="field">Texte à envoyer (modifiable)<textarea className="input" name="body" rows={7} defaultValue={String(p.body ?? "")} /></label></>
          : <ul><li>Type : {String(p.kind)} · prix : {Number(p.price_eur ?? 0).toFixed(2)} €</li><li>{String(p.summary)}</li>{Array.isArray(p.features) ? p.features.map((f, i) => <li key={i}>{String(f)}</li>) : null}</ul>}
        <div style={{ display: "flex", gap: ".5rem" }}><button name="op" value="approve" className="btn btn-primary btn-sm">{t.kind === "reply_draft" ? "Envoyer" : "Créer en brouillon"}</button><button name="op" value="reject" className="btn btn-ghost btn-sm">Refuser</button></div></form>; })}
    </section>

    <section className="panel" aria-labelledby="j-t"><h2 id="j-t" style={h2}>Journal (25 derniers appels)</h2>
      <div className="table-scroll"><table className="tbl"><thead><tr><th>Date</th><th>Agent</th><th>Clé</th><th>Résultat</th><th>Essais</th><th>Durée</th></tr></thead><tbody>
        {(runs ?? []).map((r) => <tr key={r.id}><td>{fmt(r.created_at)}</td><td>{r.agent}</td><td>{r.key_label ?? "—"}</td><td>{r.ok ? "OK" : r.error}</td><td>{r.attempts}</td><td>{r.latency_ms ? `${r.latency_ms} ms` : "—"}</td></tr>)}</tbody></table></div></section>
  </div>;
}
