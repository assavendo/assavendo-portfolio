"use client";
import { useRef, useState } from "react";
import { fmt } from "./shared";

type Item = { name: string; before: number; after: number; url: string; outName: string; w: number; h: number; type: string };
const kb = (n: number) => (n > 1048576 ? `${fmt(n / 1048576, 2)} Mo` : `${fmt(n / 1024, 0)} Ko`);

async function compress(file: File, maxW: number, quality: number, type: string): Promise<Item> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width); const w = Math.round(bmp.width * scale); const h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), type, quality / 100));
  const ext = type === "image/webp" ? "webp" : "jpg";
  return { name: file.name, before: file.size, after: blob.size, url: URL.createObjectURL(blob), outName: file.name.replace(/\.[^.]+$/, "") + `.${ext}`, w, h, type };
}

export default function ImageCompressTool() {
  const [items, setItems] = useState<Item[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [over, setOver] = useState(false);
  const [quality, setQuality] = useState(78); const [maxW, setMaxW] = useState(1600); const [type, setType] = useState("image/webp");
  const input = useRef<HTMLInputElement>(null);
  async function handle(files: FileList | File[]) {
    setErr(""); setBusy(true); const out: Item[] = [];
    for (const f of [...files].slice(0, 12)) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErr(`« ${f.name} » n'est pas une image JPEG, PNG ou WebP.`); continue; }
      if (f.size > 25 * 1048576) { setErr(`« ${f.name} » dépasse 25 Mo.`); continue; }
      try { out.push(await compress(f, maxW, quality, type)); } catch { setErr(`« ${f.name} » n'a pas pu être traitée par votre navigateur.`); }
    }
    setItems((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.url)); return out; }); setBusy(false);
  }
  const saved = items.reduce((s, i) => s + i.before - i.after, 0); const total = items.reduce((s, i) => s + i.before, 0);
  return (
    <div>
      <div className="grid2" style={{ marginBottom: "1rem" }}>
        <label className="field">Format de sortie<select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="image/webp">WebP (recommandé)</option><option value="image/jpeg">JPEG</option></select></label>
        <label className="field">Qualité : {quality} %<input type="range" min={40} max={95} value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></label>
        <label className="field">Largeur maximale : {maxW}px<input type="range" min={480} max={3000} step={80} value={maxW} onChange={(e) => setMaxW(Number(e.target.value))} /></label>
      </div>
      <div className={`drop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}>
        <p style={{ margin: "0 auto 1rem" }}>Glissez jusqu'à 12 images ici, ou</p>
        <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Traitement…" : "Choisir des images"}</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && handle(e.target.files)} />
        <p className="muted small" style={{ margin: "1rem auto 0" }}>Traitement dans votre navigateur : aucune image n'est envoyée à un serveur.</p>
      </div>
      {err ? <p className="alert alert-err" role="alert" style={{ marginTop: "1rem" }}>{err}</p> : null}
      {items.length ? (
        <div aria-live="polite">
          <div className="kpis"><div className="kpi"><b>{kb(total)} → {kb(total - saved)}</b><small>poids total avant → après</small></div><div className="kpi"><b>{total ? fmt((saved / total) * 100, 0) : 0} %</b><small>économisé</small></div></div>
          <div className="table-scroll"><table className="tbl" style={{ marginTop: "1rem" }}><thead><tr><th>Aperçu</th><th>Fichier</th><th>Avant</th><th>Après</th><th>Dimensions</th><th></th></tr></thead><tbody>
            {items.map((i) => <tr key={i.url}><td><img src={i.url} alt="" width={64} height={48} style={{ objectFit: "cover", borderRadius: 4 }} /></td><td>{i.name}</td><td>{kb(i.before)}</td><td><strong>{kb(i.after)}</strong>{i.after >= i.before ? <small className="muted"> (déjà optimisée)</small> : null}</td><td>{i.w}×{i.h}</td><td><a className="btn btn-ghost btn-sm" href={i.url} download={i.outName}>Télécharger</a></td></tr>)}
          </tbody></table></div>
        </div>
      ) : null}
    </div>
  );
}
