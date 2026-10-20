"use client";
import { useState } from "react";
import { fmt } from "./shared";

async function sha1Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
export default function PasswordLeakTool() {
  const [pwd, setPwd] = useState(""); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ count: number; prefix: string } | null>(null); const [err, setErr] = useState("");
  async function check(e: React.FormEvent) {
    e.preventDefault(); if (!pwd) return; setBusy(true); setErr(""); setRes(null);
    try {
      const hash = await sha1Hex(pwd); const prefix = hash.slice(0, 5); const suffix = hash.slice(5);
      const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true" } });
      if (!r.ok) throw new Error();
      const line = (await r.text()).split("\n").map((l) => l.trim().split(":")).find(([h]) => h === suffix);
      setRes({ count: line ? Number(line[1]) : 0, prefix });
    } catch { setErr("Le service de vérification est injoignable. Réessayez dans un instant."); }
    setBusy(false);
  }
  return (
    <div>
      <p className="alert alert-err" role="note" style={{ marginBottom: "1rem" }}><strong>Ne saisissez pas un mot de passe que vous utilisez encore.</strong> Le test est anonyme (seuls 5 caractères d'une empreinte quittent votre navigateur), mais la bonne habitude est de tester un mot de passe d'exemple ou un ancien.</p>
      <form className="tool-form" onSubmit={check} autoComplete="off">
        <label className="field" style={{ flex: "1 1 260px" }}>Mot de passe d'exemple à tester
          <input className="input" type={show ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <label style={{ alignSelf: "end", display: "flex", gap: ".4rem", paddingBottom: ".8rem" }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Afficher</label>
        <button className="btn btn-primary" disabled={busy || !pwd} style={{ alignSelf: "end" }}>{busy ? "Vérification…" : "Vérifier"}</button>
        <button type="button" className="btn btn-ghost" style={{ alignSelf: "end" }} onClick={() => { setPwd("azerty123"); setShow(true); setRes(null); }}>Essayer avec un exemple</button>
      </form>
      {err ? <p className="alert alert-err" role="alert" style={{ marginTop: "1rem" }}>{err}</p> : null}
      {res ? (
        <div aria-live="polite" style={{ marginTop: "1rem" }}>
          {res.count > 0 ? <p className="alert alert-err"><strong>Ce mot de passe figure dans des fuites connues ({fmt(res.count)} occurrences).</strong> Un site sérieux doit le refuser à l'inscription.</p>
            : <p className="alert alert-ok"><strong>Ce mot de passe n'apparaît dans aucune fuite connue.</strong> Cela ne prouve pas qu'il soit solide : longueur et unicité restent essentielles.</p>}
          <p className="muted small">Ce qui a quitté votre navigateur : uniquement <code>{res.prefix}</code>, les 5 premiers caractères de l'empreinte SHA-1. Le mot de passe et le reste de l'empreinte restent chez vous.</p>
        </div>
      ) : null}
    </div>
  );
}
