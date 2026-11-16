
"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { archiveSupplierImport, importSupplierProduct, restoreSupplierImport } from "@/app/actions/dropship";

type SupplierImport = {
  id: string;
  supplier_url: string;
  product_query: string;
  operator_prompt?: string | null;
  status: string;
  images: unknown;
  extracted: Record<string, unknown> | null;
  error: string | null;
  product_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

const STATUS: Record<string, { label: string; tone: string; icon: string }> = {
  queued: { label: "En attente", tone: "amber", icon: "○" },
  running: { label: "Analyse en cours", tone: "blue", icon: "◌" },
  needs_review: { label: "Prêt à vérifier", tone: "violet", icon: "✦" },
  approved: { label: "Brouillon créé", tone: "green", icon: "✓" },
  rejected: { label: "Refusé", tone: "red", icon: "×" },
  failed: { label: "Échec", tone: "red", icon: "!" },
};

const PRESETS = [
  "Prépare une fiche produit premium en français, factuelle et prête pour relecture.",
  "Travaille le positionnement commercial et le bénéfice client sans inventer d'information.",
  "Optimise la structure pour la boutique et la recherche interne avec des caractéristiques vérifiables.",
];

const STYLE = `
.siw{border:1px solid rgba(255,255,255,.08);border-radius:24px;overflow:hidden;background:linear-gradient(145deg,#07111c,#0a1724 55%,#07101a);box-shadow:0 24px 70px rgba(0,0,0,.25)}
.siw-head{padding:26px 28px;border-bottom:1px solid rgba(255,255,255,.07);background:radial-gradient(circle at 12% 0,rgba(255,210,70,.1),transparent 35%),rgba(4,10,17,.6)}
.siw-kicker{font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.38)}
.siw-head h2{margin:.4rem 0 .45rem;font-size:1.45rem}.siw-head p{margin:0;max-width:850px;color:rgba(255,255,255,.56);line-height:1.7;font-size:.84rem}
.siw-main{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr)}.siw-compose{padding:25px;border-right:1px solid rgba(255,255,255,.07)}.siw-history{padding:25px;background:rgba(0,0,0,.12)}
.siw-label{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:.72rem;font-weight:800;margin-bottom:7px}.siw-label span{font-size:.6rem;color:rgba(255,255,255,.35);font-weight:500}
.siw-field{margin-bottom:16px}.siw-input,.siw-textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);color:inherit;border-radius:13px;padding:11px 12px;outline:none;font:inherit}.siw-textarea{min-height:144px;resize:vertical;line-height:1.6}.siw-input:focus,.siw-textarea:focus{border-color:rgba(255,210,70,.32);box-shadow:0 0 0 4px rgba(255,210,70,.045)}
.siw-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.siw-note{padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);font-size:.67rem;color:rgba(255,255,255,.44);line-height:1.55}.siw-note b{color:rgba(255,255,255,.7)}
.siw-presets{display:flex;gap:6px;flex-wrap:wrap;margin:-2px 0 15px}.siw-chip{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:rgba(255,255,255,.7);padding:7px 9px;border-radius:10px;font-size:.63rem;cursor:pointer}.siw-chip:hover{border-color:rgba(255,210,70,.25);color:#fff}
.siw-safety{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 16px}.siw-safe{padding:9px 10px;border-radius:11px;border:1px solid rgba(89,211,157,.12);background:rgba(89,211,157,.045);font-size:.61rem;color:rgba(255,255,255,.55)}.siw-safe strong{display:block;color:#bcead5;font-size:.64rem;margin-bottom:2px}
.siw-submit{width:100%;border:0;border-radius:13px;background:linear-gradient(135deg,#ffe07a,#ffc400);color:#17202a;font-weight:900;padding:12px 14px;cursor:pointer;font-size:.77rem;box-shadow:0 12px 30px rgba(255,196,0,.1)}.siw-submit:disabled{opacity:.68;cursor:wait}
.siw-progress{margin-top:11px;padding:11px 12px;border-radius:12px;border:1px solid rgba(255,210,70,.14);background:rgba(255,210,70,.05);font-size:.64rem;color:rgba(255,255,255,.55);display:flex;align-items:center;gap:8px}.siw-dot{width:7px;height:7px;border-radius:50%;background:#ffd84a;box-shadow:0 0 0 0 rgba(255,216,74,.8);animation:siwPulse 1.2s infinite}@keyframes siwPulse{70%{box-shadow:0 0 0 7px rgba(255,216,74,0)}}.siw-progress b{color:#fff}.siw-progress i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:siwType 1s infinite}.siw-progress i:nth-last-child(2){animation-delay:.15s}.siw-progress i:last-child{animation-delay:.3s}@keyframes siwType{0%,65%,100%{transform:translateY(0);opacity:.25}30%{transform:translateY(-2px);opacity:1}}
.siw-check{display:flex;gap:8px;align-items:flex-start;font-size:.64rem;line-height:1.55;color:rgba(255,255,255,.52);margin:15px 0}.siw-check input{margin-top:2px}
.siw-history-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.siw-history-head h3{margin:0;font-size:.95rem}.siw-count{font-size:.6rem;border-radius:99px;padding:4px 7px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.5)}
.siw-search{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.03);color:inherit;padding:9px 10px;outline:none;margin-bottom:10px}.siw-filters{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px}.siw-filter{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);color:rgba(255,255,255,.48);border-radius:8px;padding:5px 7px;font-size:.58rem;cursor:pointer}.siw-filter.on{border-color:rgba(255,210,70,.22);background:rgba(255,210,70,.08);color:#fff}
.siw-list{display:grid;gap:8px;max-height:650px;overflow:auto;padding-right:2px}.siw-card{border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;background:rgba(255,255,255,.025)}.siw-card:hover{border-color:rgba(255,255,255,.12)}.siw-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.siw-card h4{margin:0;font-size:.76rem}.siw-status{font-size:.54rem;padding:4px 6px;border-radius:99px;white-space:nowrap;border:1px solid rgba(255,255,255,.08)}.siw-status.amber{color:#ffe09a;background:rgba(255,200,60,.08)}.siw-status.blue{color:#a9dbff;background:rgba(70,170,255,.08)}.siw-status.violet{color:#d7c0ff;background:rgba(153,98,255,.09)}.siw-status.green{color:#a7e7c3;background:rgba(80,200,135,.08)}.siw-status.red{color:#ffb3b3;background:rgba(255,80,80,.08)}
.siw-meta{font-size:.58rem;color:rgba(255,255,255,.32);margin-top:5px}.siw-meta strong{color:rgba(255,255,255,.55)}.siw-preview{margin-top:8px;font-size:.65rem;line-height:1.5;color:rgba(255,255,255,.58)}.siw-variant{display:inline-flex;margin:6px 5px 0 0;padding:3px 6px;border-radius:99px;font-size:.55rem;background:rgba(255,255,255,.04);color:rgba(255,255,255,.52)}
.siw-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.siw-link,.siw-action{font-size:.58rem;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:rgba(255,255,255,.65);border-radius:8px;padding:6px 7px;text-decoration:none;cursor:pointer}.siw-link:hover,.siw-action:hover{color:#fff;border-color:rgba(255,210,70,.22)}.siw-danger{color:#ffb8b8}.siw-details{margin-top:9px}.siw-details summary{font-size:.58rem;color:rgba(255,255,255,.35);cursor:pointer}.siw-details p{font-size:.61rem;color:rgba(255,255,255,.46);line-height:1.5}.siw-empty{padding:30px 12px;text-align:center;color:rgba(255,255,255,.35);font-size:.68rem;border:1px dashed rgba(255,255,255,.07);border-radius:12px}
@media(max-width:980px){.siw-main{grid-template-columns:1fr}.siw-compose{border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.siw-list{max-height:none}.siw-row,.siw-safety{grid-template-columns:1fr}.siw-head,.siw-compose,.siw-history{padding:18px}}
`;

function date(v: string) { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v)); }
function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "source fournisseur"; } }
function clip(v: string, max = 180) { const x = v.replace(/\s+/g, " ").trim(); return x.length > max ? x.slice(0, max - 1) + "…" : x; }

function PendingImport() {
  const { pending } = useFormStatus();
  const [index, setIndex] = useState(0);
  const steps = ["Sécurisation de la source", "Lecture des données publiques", "Préparation de la fiche par l’IA", "Contrôle et mise en revue"];
  useEffect(() => {
    if (!pending) { setIndex(0); return; }
    const timer = window.setInterval(() => setIndex((x) => (x + 1) % steps.length), 1450);
    return () => window.clearInterval(timer);
  }, [pending]);
  if (!pending) return <button className="siw-submit">Importer et préparer avec l’IA</button>;
  return <div className="siw-progress" aria-live="polite"><span className="siw-dot"/><b>{steps[index]}</b><span style={{ marginLeft: "auto" }}>en cours <i/><i/><i/></span></div>;
}

function ImportCard({ item }: { item: SupplierImport }) {
  const extracted = item.extracted ?? {};
  const images = Array.isArray(item.images) ? item.images as { url?: string; kind?: string }[] : [];
  const variants = Array.isArray(extracted.variants) ? extracted.variants as { label?: string; sku?: string }[] : [];
  const status = STATUS[item.status] ?? { label: item.status, tone: "blue", icon: "•" };
  const prompt = typeof item.operator_prompt === "string" ? item.operator_prompt : "";
  return <article className="siw-card">
    <div className="siw-card-top">
      <div style={{ minWidth: 0 }}><h4>{item.product_query}</h4><div className="siw-meta">{host(item.supplier_url)} · {date(item.created_at)}</div></div>
      <span className={"siw-status " + status.tone}>{status.icon} {status.label}</span>
    </div>
    {typeof extracted.product_name === "string" && extracted.product_name ? <div className="siw-preview"><strong>Source :</strong> {clip(extracted.product_name, 120)}{typeof extracted.brand === "string" && extracted.brand ? " · " + extracted.brand : ""}</div> : null}
    {typeof extracted.supplier_price === "number" ? <div className="siw-meta" style={{ marginTop: 6 }}>Prix fournisseur lu : <strong>{extracted.supplier_price} {String(extracted.currency || "")}</strong> · jamais utilisé comme prix de vente</div> : null}
    {variants.length ? <div>{variants.slice(0, 8).map((v, i) => <span className="siw-variant" key={(v.sku || v.label || "v") + "-" + i}>{v.label || "Variante"}{v.sku ? " · " + v.sku : ""}</span>)}{variants.length > 8 ? <span className="siw-variant">+{variants.length - 8}</span> : null}</div> : null}
    <details className="siw-details"><summary>Voir le contexte d’import</summary>{prompt ? <p><strong>Prompt :</strong> {clip(prompt, 600)}</p> : null}{typeof extracted.description === "string" && extracted.description ? <p><strong>Description :</strong> {clip(extracted.description, 450)}</p> : null}{images.length ? <p><strong>Visuels :</strong> {images.length} source(s) enregistrée(s) pour vérification des droits.</p> : null}</details>
    {item.error ? <div className="alert alert-err" style={{ marginTop: ".6rem" }}>{item.error}</div> : null}
    <div className="siw-actions">
      {item.status === "needs_review" ? <a className="siw-link" href="/admin/ia#ai-studio">✦ Ouvrir dans le Centre IA</a> : null}
      {item.product_id ? <a className="siw-link" href={"/admin/produits?id=" + encodeURIComponent(item.product_id)}>Ouvrir le brouillon</a> : null}
      {images.some((x) => x.kind === "source" && x.url) ? <a className="siw-link" href={images.find((x) => x.kind === "source" && x.url)?.url} target="_blank" rel="noreferrer">Source visuelle</a> : null}
      {item.archived_at ? <form action={restoreSupplierImport}><input type="hidden" name="id" value={item.id}/><button className="siw-action" type="submit">Restaurer</button></form> : <form action={archiveSupplierImport}><input type="hidden" name="id" value={item.id}/><button className="siw-action siw-danger" type="submit">Archiver</button></form>}
    </div>
  </article>;
}

export function SupplierImportForm({ imports = [] }: { imports?: SupplierImport[] }) {
  const [prompt, setPrompt] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => imports.filter((item) => {
    if (!showArchived && item.archived_at) return false;
    if (filter !== "all" && item.status !== filter) return false;
    const hay = (item.product_query + " " + item.supplier_url + " " + (item.operator_prompt || "")).toLowerCase();
    return !historySearch.trim() || hay.includes(historySearch.trim().toLowerCase());
  }), [imports, showArchived, filter, historySearch]);

  function applyPreset(value: string) { setPrompt((current) => current ? current.trim() + "\n\n" + value : value); }

  return <section className="siw">
    <style>{STYLE}</style>
    <header className="siw-head">
      <div className="siw-kicker">Supplier Workspace · Import intelligent</div>
      <h2>Importer un produit fournisseur</h2>
      <p>Donne la source publique et écris à l’IA le résultat que tu veux obtenir. La source est sécurisée, les données publiques sont extraites, la fiche est préparée puis placée en revue. Aucun achat et aucune publication automatique.</p>
    </header>
    <div className="siw-main">
      <div className="siw-compose">
        <form action={importSupplierProduct}>
          <div className="siw-field"><div className="siw-label">Page produit publique <span>HTTPS uniquement</span></div><input className="siw-input" name="supplier_url" type="url" inputMode="url" placeholder="https://fournisseur.example/produit" required maxLength={2000}/></div>
          <div className="siw-row">
            <div className="siw-field"><div className="siw-label">Produit ciblé <span>2–200 caractères</span></div><input className="siw-input" name="product_query" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Ex. lampe de bureau rechargeable" required minLength={2} maxLength={200}/></div>
            <div className="siw-note"><b>Garde le contrôle</b><br/>Prix de vente, stock, livraison, droits, conformité et publication restent des décisions administratives.</div>
          </div>
          <div className="siw-field"><div className="siw-label">Prompt de préparation IA <span>{prompt.length}/4000</span></div><textarea className="siw-textarea" name="operator_prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={4000} placeholder="Ex. Prépare une fiche premium, concise et factuelle. Mets en avant les caractéristiques vérifiables et structure le texte pour la boutique."></textarea></div>
          <div className="siw-presets">{PRESETS.map((preset) => <button key={preset} className="siw-chip" type="button" onClick={() => applyPreset(preset)}>+ {clip(preset, 82)}</button>)}</div>
          <div className="siw-safety"><div className="siw-safe"><strong>🛡️ Source sécurisée</strong>SSRF, HTTPS, redirections et robots.txt contrôlés.</div><div className="siw-safe"><strong>✦ IA cloisonnée</strong>La donnée fournisseur n’est jamais traitée comme une instruction.</div></div>
          <label className="siw-check"><input type="checkbox" name="rights_confirmed" required/><span>Je confirme que je suis autorisé à utiliser cette source et ses visuels, et que je relirai la fiche et les visuels avant toute publication.</span></label>
          <PendingImport/>
        </form>
      </div>
      <div className="siw-history">
        <div className="siw-history-head"><h3>Historique des imports</h3><span className="siw-count">{filtered.length}</span></div>
        <input className="siw-search" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} aria-label="Recherche de l’historique" placeholder="Rechercher un import…"/>
        <div className="siw-filters">
          <button type="button" className={"siw-filter " + (filter === "all" ? "on" : "")} onClick={() => setFilter("all")}>Tous</button>
          {Object.entries(STATUS).slice(0, 4).map(([key, value]) => <button key={key} type="button" className={"siw-filter " + (filter === key ? "on" : "")} onClick={() => setFilter(key)}>{value.label}</button>)}
          <button type="button" className={"siw-filter " + (showArchived ? "on" : "")} onClick={() => setShowArchived((x) => !x)}>Archivés</button>
        </div>
        <div className="siw-list">{filtered.length ? filtered.map((item) => <ImportCard key={item.id} item={item}/>) : <div className="siw-empty">Aucun import ne correspond à cette vue.</div>}</div>
      </div>
    </div>
  </section>;
}
