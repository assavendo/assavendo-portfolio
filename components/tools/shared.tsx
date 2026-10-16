"use client";
import { useState } from "react";

export function usePost<T>(url: string) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function run(target: string) {
    setLoading(true); setError(""); setData(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Le test n'a pas pu aboutir."); else setData(json as T);
    } catch { setError("Connexion impossible. Vérifiez votre réseau et réessayez."); }
    setLoading(false);
  }
  return { data, error, loading, run };
}

export function TargetForm({ onRun, loading, placeholder, label }: { onRun: (v: string) => void; loading: boolean; placeholder: string; label: string }) {
  const [v, setV] = useState("");
  return (
    <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onRun(v.trim()); }}>
      <label className="field" style={{ flex: "1 1 260px" }}><span>{label}</span><input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
      <button className="btn btn-primary" disabled={loading} style={{ alignSelf: "end" }}>{loading ? "Analyse en cours…" : "Lancer l'analyse"}</button>
    </form>
  );
}

export const Score = ({ value, label }: { value: number; label: string }) => (
  <div><div className="score"><strong aria-label={`${value} sur 100`}>{value}</strong><span>/ 100 · {label}</span></div><div className="bar" aria-hidden="true"><i style={{ width: `${value}%` }} /></div></div>
);

export const Num = ({ label, value, set, step = 1, min = 0, suffix }: { label: string; value: number; set: (n: number) => void; step?: number; min?: number; suffix?: string }) => (
  <label className="field">{label}{suffix ? ` (${suffix})` : ""}<input className="input" type="number" inputMode="decimal" min={min} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => set(e.target.value === "" ? NaN : Number(e.target.value))} /></label>
);

export const fmt = (n: number, d = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
export const money = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
export const levelClass = (s: string) => (s === "ok" ? "b-ok" : s === "warn" || s === "avertissement" || s === "important" ? "b-warn" : "b-fail");
