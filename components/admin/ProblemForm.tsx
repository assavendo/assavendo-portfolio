"use client";
import { useActionState } from "react";
import { saveProblem, type AdminState } from "@/app/actions/admin";
import type { Domain, Problem } from "@/lib/types";
import { CoverField } from "./ImagePicker";

export function ProblemForm({ p, domains, tools, cree = false }: { p: Problem | null; domains: Domain[]; tools: string[]; cree?: boolean }) {
  const [state, action, pending] = useActionState(saveProblem, {} as AdminState);
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <label className="field full">Titre (formulé comme le ressent le client)<input className="input" name="title" defaultValue={state.values?.title ?? (p?.title)} required /></label>
      <label className="field">Domaine<select className="input" name="domain_id" defaultValue={state.values?.domain_id ?? (p?.domain_id ?? "")}><option value="">—</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="field">Adresse (slug, automatique si vide)<input className="input" name="slug" defaultValue={state.values?.slug ?? (p?.slug)} /></label>
      <label className="field full">Accroche (une phrase qui donne envie de lire)<input className="input" name="hook" defaultValue={state.values?.hook ?? (p?.hook)} maxLength={300} /></label>
      <label className="field full">Pour qui<input className="input" name="who" defaultValue={state.values?.who ?? (p?.who)} /></label>
      <label className="field full">Ce que le client observe<textarea className="input" name="symptom" defaultValue={state.values?.symptom ?? (p?.symptom)} /></label>
      <label className="field full">Ce que cela lui coûte<textarea className="input" name="cost" defaultValue={state.values?.cost ?? (p?.cost)} /></label>
      <label className="field full">Pourquoi cela arrive (en langage clair)<textarea className="input" name="cause" defaultValue={state.values?.cause ?? (p?.cause)} /></label>
      <label className="field full">Ce que fait Assavendo<textarea className="input" name="what_we_do" defaultValue={state.values?.what_we_do ?? (p?.what_we_do)} /></label>
      <label className="field full">Ce que le client reçoit (un livrable par ligne)<textarea className="input" name="deliverables" defaultValue={state.values?.deliverables ?? (p?.deliverables.join("\n"))} /></label>
      <label className="field full">Résultat attendu (sans chiffre inventé ni promesse)<textarea className="input" name="outcome" defaultValue={state.values?.outcome ?? (p?.outcome)} /></label>
      <label className="field">Technologies (séparées par des virgules)<input className="input" name="stack" defaultValue={state.values?.stack ?? (p?.stack.join(", "))} /></label>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontWeight: 600, fontSize: ".92rem" }}>Public</legend>
        <label><input type="checkbox" name="audiences" value="entreprise" defaultChecked={state.values ? state.values.audiences?.split(",").includes("entreprise") : p ? p.audiences.includes("entreprise") : true} /> Entreprises</label>{" "}
        <label><input type="checkbox" name="audiences" value="particulier" defaultChecked={state.values ? state.values.audiences?.split(",").includes("particulier") : p?.audiences.includes("particulier")} /> Particuliers</label></fieldset>
      <label className="field">Contenu<select className="input" name="format" defaultValue={state.values?.format ?? (p?.format ?? "study")}><option value="study">Explication détaillée (sans outil)</option><option value="tool">Avec un outil à tester</option></select></label>
      <label className="field">Outil (si « Avec un outil »)<select className="input" name="tool_key" defaultValue={state.values?.tool_key ?? (p?.tool_key ?? "")}><option value="">—</option>{tools.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="field full">Phrase d'introduction de l'outil<input className="input" name="tool_intro" defaultValue={state.values?.tool_intro ?? (p?.tool_intro)} /></label>
      <CoverField initial={p?.cover_url ? { url: p.cover_url, alt: p.cover_alt, credit: p.cover_credit ?? undefined } : null} />
      <fieldset className="full panel" style={{ margin: 0 }}><legend><strong>Référencement et planification</strong> (facultatif)</legend>
        <div className="form-grid">
          <label className="field full">Titre pour Google (70 caractères maximum)<input className="input" name="seo_title" maxLength={70} defaultValue={state.values?.seo_title ?? (p?.seo_title ?? "")} /></label>
          <label className="field full">Description pour Google (170 caractères maximum)<textarea className="input" name="seo_description" maxLength={170} style={{ minHeight: 70 }} defaultValue={state.values?.seo_description ?? (p?.seo_description ?? "")} /></label>
          <label className="field">Publier à partir du<input className="input" type="datetime-local" name="publish_at" defaultValue={state.values?.publish_at ?? (p?.publish_at ? p.publish_at.slice(0, 16) : "")} /></label>
        </div></fieldset>
      <label className="field">Statut<select className="input" name="status" defaultValue={state.values?.status ?? (p?.status ?? "draft")}><option value="draft">Brouillon</option><option value="published">Publié</option><option value="archived">Archivé</option></select></label>
      <label className="field">Ordre d'affichage<input className="input" type="number" name="sort" defaultValue={state.values?.sort ?? (p?.sort ?? 1000)} /></label>
      <label className="full"><input type="checkbox" name="featured" defaultChecked={state.values ? state.values.featured === "on" : p?.featured} /> Mettre en avant sur l'accueil</label>
      <div className="full"><button className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
        {state.error ? <p className="alert alert-err" role="alert" style={{ marginTop: ".8rem" }}>{state.error}</p> : null}{!state.ok && !state.error && cree ? <p className="alert alert-ok" role="status" style={{ marginTop: ".8rem" }}>Créé. Vous pouvez continuer à le modifier ici.</p> : null}{state.ok ? <p className="alert alert-ok" role="status" style={{ marginTop: ".8rem" }}>{state.ok}</p> : null}</div>
    </form>
  );
}
