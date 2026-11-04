"use client";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type Img = { url: string; alt: string; credit?: string };
type Found = { id: string; alt: string; thumb: string; url: string; credit: string; page: string; download: string };

export function ImagePicker({ onPick }: { onPick: (i: Img) => void }) {
  const [q, setQ] = useState(""); const [found, setFound] = useState<Found[]>([]); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const file = useRef<HTMLInputElement>(null);
  async function search() {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/admin/unsplash?q=${encodeURIComponent(q)}`); const j = await r.json();
    if (!r.ok) setMsg(j.error ?? "Recherche impossible."); else { setFound(j.results); if (!j.results.length) setMsg("Aucun résultat : essayez des mots plus généraux (en anglais, les résultats sont souvent plus riches)."); }
    setBusy(false);
  }
  async function pick(f: Found) {
    await fetch("/api/admin/unsplash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ download: f.download }) });
    onPick({ url: f.url, alt: f.alt, credit: f.credit }); setFound([]);
  }
  async function upload(f: File) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(f.type) || f.size > 8 * 1048576) { setMsg("Image JPEG, PNG, WebP ou AVIF de 8 Mo maximum."); return; }
    setBusy(true); setMsg("");
    const sb = supabaseBrowser(); const ext = f.type.split("/")[1].replace("jpeg", "jpg"); const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("media").upload(path, f, { contentType: f.type, cacheControl: "31536000" });
    if (error) setMsg("Envoi impossible : " + error.message); else onPick({ url: sb.storage.from("media").getPublicUrl(path).data.publicUrl, alt: "" });
    setBusy(false);
  }
  return (
    <div className="panel" style={{ background: "var(--surface-2)" }}>
      <div className="tool-form">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une photo (Unsplash)…" aria-label="Rechercher une photo" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={search} disabled={busy || !q.trim()}>Chercher</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => file.current?.click()} disabled={busy}>Envoyer mon image</button>
        <input ref={file} type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {msg ? <p className="alert alert-err" role="alert" style={{ marginTop: ".6rem" }}>{msg}</p> : null}
      {found.length ? <div className="img-pick">{found.map((f) => <button type="button" key={f.id} onClick={() => pick(f)} title={f.credit}><img src={f.thumb} alt={f.alt || "Photo"} /></button>)}</div> : null}
    </div>
  );
}

export function CoverField({ initial }: { initial: Img | null }) {
  const [img, setImg] = useState<Img | null>(initial);
  return (
    <fieldset className="full panel" style={{ margin: 0 }}>
      <legend><strong>Image de couverture</strong></legend>
      {img ? <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "start" }}>
        <img src={img.url} alt="" style={{ width: 220, aspectRatio: "4/3", objectFit: "cover", borderRadius: 6 }} />
        <div style={{ flex: "1 1 260px", display: "grid", gap: ".6rem" }}>
          <label className="field">Texte alternatif (décrit l'image pour les lecteurs d'écran)<input className="input" name="cover_alt" value={img.alt} onChange={(e) => setImg({ ...img, alt: e.target.value })} /></label>
          <input type="hidden" name="cover_url" value={img.url} /><input type="hidden" name="cover_credit" value={img.credit ?? ""} />
          {img.credit ? <p className="muted small">{img.credit}</p> : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImg(null)}>Retirer l'image</button>
        </div></div> : <><input type="hidden" name="cover_url" value="" /><input type="hidden" name="cover_alt" value="" /></>}
      {!img ? <ImagePicker onPick={setImg} /> : null}
    </fieldset>
  );
}

export function GalleryField({ initial }: { initial: Img[] }) {
  const [imgs, setImgs] = useState<Img[]>(initial);
  return (
    <fieldset className="full panel" style={{ margin: 0 }}>
      <legend><strong>Galerie du produit</strong> (la première image sert de couverture)</legend>
      {imgs.map((img, i) => (
        <div key={img.url + i} style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "start" }}>
          <img src={img.url} alt="" style={{ width: 140, aspectRatio: "4/3", objectFit: "cover", borderRadius: 6 }} />
          <div style={{ flex: "1 1 240px", display: "grid", gap: ".5rem" }}>
            <input type="hidden" name="img_url" value={img.url} /><input type="hidden" name="img_credit" value={img.credit ?? ""} />
            <label className="field">Texte alternatif<input className="input" name="img_alt" value={img.alt} onChange={(e) => setImgs(imgs.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))} /></label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImgs(imgs.filter((_, k) => k !== i))} style={{ justifySelf: "start" }}>Retirer</button>
          </div>
        </div>
      ))}
      {imgs.length < 6 ? <ImagePicker onPick={(i) => setImgs([...imgs, i])} /> : <p className="muted small">6 images maximum.</p>}
    </fieldset>
  );
}

export function DeliverableField({ initialName }: { initialName?: string }) {
  const [path, setPath] = useState(""); const [name, setName] = useState(initialName ?? ""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function up(f: File) {
    setBusy(true); setMsg("");
    const p = `${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabaseBrowser().storage.from("deliverables").upload(p, f, { contentType: f.type || "application/octet-stream" });
    if (error) setMsg("Envoi impossible : " + error.message); else { setPath(p); setName(f.name); }
    setBusy(false);
  }
  return (
    <div className="full panel" style={{ margin: 0 }}>
      <strong>Fichier livré après paiement</strong>
      <p className="muted small">Stocké dans un espace privé. Le client reçoit un lien personnel, limité en nombre de téléchargements et en durée (30 jours par défaut).</p>
      <input type="file" disabled={busy} onChange={(e) => e.target.files?.[0] && up(e.target.files[0])} />
      {name ? <p className="small">Fichier : <strong>{name}</strong>{path ? " (nouveau, à enregistrer)" : ""}</p> : null}
      {msg ? <p className="alert alert-err" role="alert">{msg}</p> : null}
      <input type="hidden" name="deliverable_path" value={path} /><input type="hidden" name="deliverable_name" value={name} />
    </div>
  );
}
