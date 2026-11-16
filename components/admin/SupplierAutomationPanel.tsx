"use client";

import { useMemo, useState } from "react";
import {
  saveSupplierConnection,
  saveSupplierMapping,
  syncSupplierNow,
  testSupplierConnection,
  toggleSupplierConnection,
  deleteSupplierMapping,
  retrySupplierOrder,
} from "@/app/actions/supplier-automation";
import { SUPPLIER_PROVIDERS, getSupplierProvider } from "@/lib/dropship/providers";

type Connection = {
  id: string;
  name: string;
  base_url: string;
  enabled: boolean;
  auto_order_enabled: boolean;
  webhook_enabled: boolean;
  sync_interval_seconds: number;
  status: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  config: Record<string, unknown> | null;
  inventory_method: string;
  inventory_path: string;
  inventory_response_path: string;
  inventory_sku_path: string;
  inventory_qty_path: string;
  inventory_price_path: string | null;
  inventory_currency_path: string | null;
  inventory_available_path: string | null;
  order_method: string;
  order_path: string;
  order_response_id_path: string | null;
  order_status_path: string | null;
  order_tracking_number_path: string | null;
  order_tracking_url_path: string | null;
  order_payload_template: unknown;
  auth_header: string;
  auth_prefix: string;
  provider_key?: string | null;
  integration_mode?: string | null;
  docs_url?: string | null;
  provider_capabilities?: Record<string, unknown> | null;
  sandbox_enabled?: boolean;
};

type Mapping = {
  id: string;
  supplier_connection_id: string;
  product_id: string;
  variant_id: string | null;
  external_sku: string;
  auto_reprice: boolean;
  reprice_mode: string;
  supplier_cost_cents: number | null;
  supplier_qty: number;
  available: boolean;
  last_synced_at: string | null;
  priority?: number;
  destination_countries?: string[];
  products: { title: string; sku: string | null } | null;
  product_variants: { label: string; sku: string | null } | null;
};

type SupplierOrder = {
  id: string;
  status: string;
  client_reference: string;
  external_order_id: string | null;
  supplier_total_cents: number;
  tracking_number: string | null;
  tracking_url: string | null;
  last_error: string | null;
  created_at: string;
  supplier_connections: { name: string } | null;
  orders: { order_number: string | null } | null;
};

type ProductOption = { id: string; title: string; sku: string | null };
type VariantOption = { id: string; product_id: string; label: string; sku: string | null };

const css = `
.saw{margin:0 0 22px;border:1px solid rgba(255,255,255,.08);border-radius:24px;overflow:hidden;background:linear-gradient(145deg,#07111c,#0a1724 58%,#07101a);box-shadow:0 24px 70px rgba(0,0,0,.22)}
.saw-head{padding:24px 26px;border-bottom:1px solid rgba(255,255,255,.07);background:radial-gradient(circle at 12% 0,rgba(255,210,70,.1),transparent 36%),rgba(4,10,17,.55)}
.saw-k{font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.38)}.saw-head h2{margin:.4rem 0 .35rem;font-size:1.35rem}.saw-head p{margin:0;max-width:980px;color:rgba(255,255,255,.56);line-height:1.7;font-size:.8rem}
.saw-grid{display:grid;grid-template-columns:1.05fr .95fr}.saw-pane{padding:22px;border-right:1px solid rgba(255,255,255,.07)}.saw-pane:last-child{border-right:0;background:rgba(0,0,0,.1)}
.saw-section{padding:18px 0;border-top:1px solid rgba(255,255,255,.06)}.saw-section:first-child{border-top:0;padding-top:0}.saw-title{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.saw-title h3{margin:0;font-size:.88rem}.saw-pill{font-size:.54rem;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.54)}
.saw-form{display:grid;gap:9px}.saw-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.saw-three{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.saw-label{font-size:.58rem;font-weight:800;color:rgba(255,255,255,.7);margin-bottom:4px}.saw-input,.saw-select,.saw-textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);color:inherit;border-radius:10px;padding:9px 10px;font:inherit;font-size:.65rem;outline:none}.saw-textarea{min-height:105px;resize:vertical;line-height:1.45}.saw-input:focus,.saw-select:focus,.saw-textarea:focus{border-color:rgba(255,210,70,.3);box-shadow:0 0 0 4px rgba(255,210,70,.04)}
.saw-help{font-size:.56rem;color:rgba(255,255,255,.35);line-height:1.5}.saw-check{display:flex;gap:7px;align-items:flex-start;font-size:.59rem;color:rgba(255,255,255,.58);line-height:1.45}.saw-check input{margin-top:2px}
.saw-btn{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:rgba(255,255,255,.78);border-radius:10px;padding:8px 10px;font-size:.6rem;font-weight:800;cursor:pointer}.saw-btn:hover{border-color:rgba(255,210,70,.22);color:#fff}.saw-btn-primary{background:linear-gradient(135deg,#ffe07a,#ffc400);border-color:transparent;color:#17202a}.saw-btn-danger{color:#ffb9b9}
.saw-card{border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;background:rgba(255,255,255,.025);margin-bottom:8px}.saw-card-top{display:flex;justify-content:space-between;gap:10px}.saw-card h4{margin:0;font-size:.72rem}.saw-meta{font-size:.55rem;color:rgba(255,255,255,.34);line-height:1.5;margin-top:4px}.saw-status{font-size:.54rem;padding:4px 7px;border-radius:999px;white-space:nowrap}.saw-status.ok{color:#a8e6c2;background:rgba(73,194,126,.09)}.saw-status.warn{color:#ffe09a;background:rgba(255,190,55,.09)}.saw-status.bad{color:#ffb0b0;background:rgba(255,75,75,.09)}.saw-status.off{color:rgba(255,255,255,.45);background:rgba(255,255,255,.05)}
.saw-list{max-height:440px;overflow:auto;padding-right:2px}.saw-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.saw-webhook{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.55rem;word-break:break-all;color:#ffe07a;background:rgba(255,210,70,.05);border:1px dashed rgba(255,210,70,.16);padding:8px 9px;border-radius:10px}.saw-table{width:100%;border-collapse:collapse;font-size:.57rem}.saw-table th,.saw-table td{padding:7px 6px;border-top:1px solid rgba(255,255,255,.06);text-align:left;vertical-align:top}.saw-table th{color:rgba(255,255,255,.35);font-weight:800}.saw-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.54rem;color:rgba(255,255,255,.57)}.saw-empty{padding:18px;text-align:center;border:1px dashed rgba(255,255,255,.07);border-radius:11px;color:rgba(255,255,255,.33);font-size:.6rem}.saw-provider{border:1px solid rgba(255,210,70,.12);border-radius:12px;padding:11px;background:linear-gradient(135deg,rgba(255,210,70,.05),rgba(255,255,255,.02));}.saw-provider strong{font-size:.67rem}.saw-provider p{margin:5px 0 0;color:rgba(255,255,255,.46);font-size:.57rem;line-height:1.55}.saw-provider a{color:#ffe07a;text-decoration:none}.saw-provider-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}.saw-cap{padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.03);font-size:.52rem;color:rgba(255,255,255,.48)}.saw-cap.on{color:#a8e6c2;background:rgba(73,194,126,.07)}.saw-note{font-size:.57rem;line-height:1.6;color:#ffe09a;border-left:2px solid rgba(255,210,70,.4);padding:7px 9px;background:rgba(255,210,70,.035);border-radius:0 8px 8px 0}
@media(max-width:1050px){.saw-grid{grid-template-columns:1fr}.saw-pane{border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.saw-two,.saw-three,.saw-provider-grid{grid-template-columns:1fr}}
`;

const eur = (c: number | null) => c == null ? "—" : new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(c/100);
const date = (s: string | null) => s ? new Date(s).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "jamais";

function statusClass(status: string) {
  if (status === "healthy" || status === "confirmed" || status === "submitted" || status === "processing" || status === "shipped" || status === "delivered") return "ok";
  if (status === "disabled") return "off";
  if (status === "failed" || status === "unknown") return "bad";
  return "warn";
}

function ProviderSummary({ providerKey }: { providerKey: string }) {
  const p = getSupplierProvider(providerKey);
  return <div className="saw-provider">
    <strong>{p.name} · {p.short}</strong>
    <p>{p.notes}</p>
    <div className="saw-provider-grid">
      {Object.entries(p.capabilities).slice(0, 8).map(([key, enabled]) => <span key={key} className={"saw-cap"+(enabled ? " on":"")}>{enabled ? "✓ " : "— "}{key}</span>)}
    </div>
    {p.docsUrl ? <div className="saw-meta"><a href={p.docsUrl} target="_blank" rel="noreferrer">Documentation officielle</a> · mode <span className="saw-code">{p.integrationMode}</span> · accès {p.verificationStatus}</div> : null}
  </div>;
}

function ConnectionForm({ c }: { c?: Connection }) {
  const [providerKey, setProviderKey] = useState(c?.provider_key ?? "custom_rest");
  const provider = useMemo(() => getSupplierProvider(providerKey), [providerKey]);
  const requiresRestMapping = provider.integrationMode === "generic_rest";
  const template = c?.order_payload_template ? JSON.stringify(c.order_payload_template, null, 2) : JSON.stringify({
    reference: "{{order.order_number}}",
    email: "{{customer.email}}",
    shipping: {
      name: "{{shipping.name}}",
      address1: "{{shipping.address.line1}}",
      city: "{{shipping.address.city}}",
      postal_code: "{{shipping.address.postal_code}}",
      country: "{{shipping.address.country}}"
    },
    items: "{{items}}"
  }, null, 2);

  return <form action={saveSupplierConnection} className="saw-form">
    {c ? <input type="hidden" name="id" value={c.id}/> : null}
    <div className="saw-two">
      <label><div className="saw-label">Profil fournisseur</div>
        <select className="saw-select" name="provider_key" value={providerKey} onChange={(e) => setProviderKey(e.target.value)}>
          {SUPPLIER_PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.name} · {p.short}</option>)}
        </select>
      </label>
      <label><div className="saw-label">Nom de la connexion</div><input className="saw-input" name="name" defaultValue={c?.name ?? ""} placeholder="Ex. CJ Europe" required/></label>
    </div>
    <ProviderSummary providerKey={providerKey}/>

    <div className="saw-note">Le profil décrit le mode d’intégration réel du fournisseur. Une API partenaire ou une plateforme gérée n’est pas transformée artificiellement en API directe : Assavendo conserve le bon statut et exige l’autorisation nécessaire avant l’automatisation.</div>

    <div className="saw-two">
      {provider.key === "cj_dropshipping" ? (
        <div className="saw-note" style={{marginBottom:0}}>CJ utilise son API 2.0 officielle. L’URL, l’en-tête <span className="saw-code">CJ-Access-Token</span>, le renouvellement des tokens et la signature webhook sont gérés par l’adaptateur natif.</div>
      ) : provider.integrationMode === "generic_rest" ? (
        <label><div className="saw-label">Base API HTTPS</div><input className="saw-input" name="base_url" defaultValue={c?.base_url ?? ""} placeholder="https://api.fournisseur.com" required={requiresRestMapping}/></label>
      ) : <div className="saw-help">Ce profil ne nécessite pas d’URL REST générique. La connexion dépend du protocole officiel du fournisseur.</div>}
      <label><div className="saw-label">Intervalle de sync (s)</div><input className="saw-input" type="number" name="sync_interval_seconds" defaultValue={c?.sync_interval_seconds ?? 900} min={60} max={86400}/></label>
    </div>

    <div className="saw-two">
      <label><div className="saw-label">{provider.credentialFields[0] ?? "Identifiant principal"} {c ? "(laisser vide = conserver)" : ""}</div><input className="saw-input" type="password" name="credential_1" autoComplete="new-password" placeholder={c ? "••••••••••••" : "Identifiant / secret"} /></label>
      <label><div className="saw-label">{provider.credentialFields[1] ?? "Identifiant secondaire"}</div><input className="saw-input" type="password" name="credential_2" autoComplete="new-password" placeholder="Optionnel"/></label>
    </div>
    <div className="saw-two">
      <label><div className="saw-label">{provider.credentialFields[2] ?? "Identifiant complémentaire"}</div><input className="saw-input" type="password" name="credential_3" autoComplete="new-password" placeholder="Optionnel"/></label>
      <label><div className="saw-label">{provider.credentialFields[3] ?? "Identifiant complémentaire"}</div><input className="saw-input" type="password" name="credential_4" autoComplete="new-password" placeholder="Optionnel"/></label>
    </div>

    {provider.key === "cj_dropshipping" ? (
      <div className="saw-section" style={{padding:"12px 0"}}>
        <div className="saw-title"><h3>Configuration CJdropshipping</h3><span className="saw-pill">API 2.0</span></div>
        <div className="saw-three">
          <label><div className="saw-label">Nom du transporteur CJ</div><input className="saw-input" name="cj_logistic_name" defaultValue={String(c?.config?.cj_logistic_name ?? "")} placeholder="Nom exact retourné par CJ"/></label>
          <label><div className="saw-label">Pays d’expédition</div><input className="saw-input" name="cj_from_country_code" defaultValue={String(c?.config?.cj_from_country_code ?? "CN")} maxLength={2}/></label>
          <label><div className="saw-label">Shop Logistics Type</div><select className="saw-select" name="cj_shop_logistics_type" defaultValue={String(c?.config?.cj_shop_logistics_type ?? 3)}><option value="1">1 · CJ Logistics</option><option value="2">2 · Third-party Logistics</option><option value="3">3 · Other Logistics</option></select></label>
        </div>
        <div className="saw-three">
          <label><div className="saw-label">Platform</div><input className="saw-input" name="cj_platform" defaultValue={String(c?.config?.cj_platform ?? "Api")}/></label>
          <label><div className="saw-label">Store name (optionnel)</div><input className="saw-input" name="cj_store_name" defaultValue={String(c?.config?.cj_store_name ?? "")}/></label>
          <label><div className="saw-label">Paiement CJ</div><select className="saw-select" name="cj_pay_type" defaultValue={String(c?.config?.cj_pay_type ?? 2)}><option value="2">2 · Solde CJ</option><option value="3">3 · Créer seulement</option></select></label>
        </div>
        <div className="saw-two">
          <label><div className="saw-label">Referer API (optionnel)</div><input className="saw-input" name="cj_referer" defaultValue={String(c?.config?.cj_referer ?? "")}/></label>
          <label className="saw-check" style={{paddingTop:20}}><input type="checkbox" name="sandbox_enabled" defaultChecked={c?.sandbox_enabled ?? false}/><span>Mode sandbox CJ pour les tests de commande</span></label>
        </div>
        <div className="saw-help">Le premier test valide le token et l’accès API. L’auto-commande reste bloquée tant que la connexion n’est pas validée.</div>
      </div>
    ) : null}

    {provider.integrationMode === "generic_rest" ? (
    <details>
      <summary style={{fontSize:".6rem",color:"rgba(255,255,255,.45)",cursor:"pointer"}}>Configuration avancée REST / feed</summary>
      <div className="saw-form" style={{marginTop:10}}>
        <div className="saw-two"><label><div className="saw-label">Inventaire — méthode</div><select className="saw-select" name="inventory_method" defaultValue={c?.inventory_method ?? "GET"}><option>GET</option><option>POST</option></select></label><label><div className="saw-label">Inventaire — chemin</div><input className="saw-input" name="inventory_path" defaultValue={c?.inventory_path ?? "/inventory"} required={requiresRestMapping}/></label></div>
        <div className="saw-three">
          <label><div className="saw-label">Liste JSON</div><input className="saw-input" name="inventory_response_path" defaultValue={c?.inventory_response_path ?? "items"} required={requiresRestMapping}/></label>
          <label><div className="saw-label">SKU fournisseur</div><input className="saw-input" name="inventory_sku_path" defaultValue={c?.inventory_sku_path ?? "sku"} required={requiresRestMapping}/></label>
          <label><div className="saw-label">Stock</div><input className="saw-input" name="inventory_qty_path" defaultValue={c?.inventory_qty_path ?? "quantity"} required={requiresRestMapping}/></label>
        </div>
        <div className="saw-three"><label><div className="saw-label">Prix</div><input className="saw-input" name="inventory_price_path" defaultValue={c?.inventory_price_path ?? ""} placeholder="price"/></label><label><div className="saw-label">Devise</div><input className="saw-input" name="inventory_currency_path" defaultValue={c?.inventory_currency_path ?? ""} placeholder="currency"/></label><label><div className="saw-label">Disponible</div><input className="saw-input" name="inventory_available_path" defaultValue={c?.inventory_available_path ?? ""} placeholder="available"/></label></div>
        <div className="saw-two"><label><div className="saw-label">Commande — méthode</div><select className="saw-select" name="order_method" defaultValue={c?.order_method ?? "POST"}><option>POST</option><option>PUT</option></select></label><label><div className="saw-label">Commande — chemin</div><input className="saw-input" name="order_path" defaultValue={c?.order_path ?? "/orders"} required={requiresRestMapping}/></label></div>
        <div className="saw-three"><label><div className="saw-label">ID externe retour</div><input className="saw-input" name="order_response_id_path" defaultValue={c?.order_response_id_path ?? ""}/></label><label><div className="saw-label">Statut retour</div><input className="saw-input" name="order_status_path" defaultValue={c?.order_status_path ?? ""}/></label><label><div className="saw-label">Suivi retour</div><input className="saw-input" name="order_tracking_number_path" defaultValue={c?.order_tracking_number_path ?? ""}/></label></div>
        <div className="saw-two"><label><div className="saw-label">URL suivi retour</div><input className="saw-input" name="order_tracking_url_path" defaultValue={c?.order_tracking_url_path ?? ""}/></label><label><div className="saw-label">Endpoint statut</div><input className="saw-input" name="order_status_endpoint_template" defaultValue={String(c?.config?.order_status_endpoint_template ?? "")} placeholder="/orders/{{external_order_id}}"/></label></div>
        <label><div className="saw-label">Template JSON de commande</div><textarea className="saw-textarea" name="order_payload_template" defaultValue={template}/></label>
      </div>
    </details>
    ) : null

    <div className="saw-three">
      <label><div className="saw-label">Plafond achat fournisseur (€)</div><input className="saw-input" type="number" step="0.01" name="max_supplier_order_eur" defaultValue={Number(c?.config?.max_supplier_order_cents ?? 100000)/100}/></label>
      <div style={{paddingTop:23}}><label className="saw-check"><input type="checkbox" name="auto_order_enabled" defaultChecked={c?.auto_order_enabled}/><span>Autoriser les commandes automatiques après validation</span></label></div>
      <div style={{paddingTop:23}}>{c?.docs_url || provider.docsUrl ? <a className="saw-help" href={c?.docs_url || provider.docsUrl || undefined} target="_blank" rel="noreferrer">Voir la documentation fournisseur ↗</a> : null}</div>
    </div>

    {c ? <div className="saw-webhook">Webhook : https://assavendo.vercel.app/api/dropship/webhook/{c.id}</div> : null}
    <button className="saw-btn saw-btn-primary" type="submit">{c ? "Enregistrer la connexion" : "Créer le profil fournisseur"}</button>
  </form>;
}

export function SupplierAutomationPanel({ connections, mappings, orders, products, variants, providers }: { connections: Connection[]; mappings: Mapping[]; orders: SupplierOrder[]; products: ProductOption[]; variants: VariantOption[]; providers: any[] }) {
  return <section className="saw"><style>{css}</style>
    <header className="saw-head"><div className="saw-k">Supplier Control Plane · multi-fournisseurs</div><h2>Réseau fournisseurs mondial · stock · prix · commandes</h2><p>Un seul contrôle central pour plusieurs fournisseurs, avec profils d’intégration, capacités, mapping SKU, priorités de routage par pays, synchronisation du stock/prix et exécution des commandes. Les fournisseurs sans API publique sont conservés en mode feed, partenaire ou plateforme gérée au lieu d’une fausse API directe.</p></header>
    <div className="saw-grid">
      <div className="saw-pane">
        <div className="saw-section"><div className="saw-title"><h3>Profils fournisseurs disponibles</h3><span className="saw-pill">{providers.length}</span></div>
          <div className="saw-list">
            {providers.map((p: any) => <article className="saw-card" key={p.provider_key}><div className="saw-card-top"><div><h4>{p.name}</h4><div className="saw-meta">{p.integration_mode} · {p.verification_status}</div></div><span className={"saw-status "+(p.verification_status === "documented" ? "ok" : "warn")}>{p.verification_status}</span></div><div className="saw-meta">{p.notes}</div></article>)}
          </div>
        </div>
        <div className="saw-section"><div className="saw-title"><h3>Nouvelle connexion fournisseur</h3><span className="saw-pill">universel</span></div><ConnectionForm/></div>
        <div className="saw-section"><div className="saw-title"><h3>Connecteurs déjà enregistrés</h3><span className="saw-pill">{connections.length}</span></div>
          {connections.length ? connections.map((c) => <article className="saw-card" key={c.id}>
            <div className="saw-card-top"><div><h4>{c.name}</h4><div className="saw-meta">{getSupplierProvider(c.provider_key ?? "custom_rest").name} · {c.integration_mode} · sync {c.sync_interval_seconds}s · dernier succès {date(c.last_success_at)}</div></div><span className={"saw-status "+statusClass(c.status)}>{c.status}</span></div>
            {c.last_error ? <div className="saw-meta" style={{color:"#ffb0b0"}}>{c.last_error}</div> : null}
            <div className="saw-actions">
              <form action={toggleSupplierConnection}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="enabled" value={String(!c.enabled)}/><button className="saw-btn">{c.enabled ? "Désactiver" : "Activer"}</button></form>
              <form action={testSupplierConnection}><input type="hidden" name="id" value={c.id}/><button className="saw-btn">Tester</button></form>
              <form action={syncSupplierNow}><input type="hidden" name="id" value={c.id}/><button className="saw-btn">Synchroniser</button></form>
            </div>
            <details style={{marginTop:10}}><summary style={{fontSize:".58rem",color:"rgba(255,255,255,.36)",cursor:"pointer"}}>Modifier</summary><div style={{marginTop:10}}><ConnectionForm c={c}/></div></details>
            <div className="saw-meta" style={{marginTop:9}}>Webhook : <span className="saw-code">/api/dropship/webhook/{c.id}</span></div>
          </article>) : <div className="saw-empty">Aucune connexion fournisseur.</div>}
        </div>
      </div>
      <div className="saw-pane">
        <div className="saw-section"><div className="saw-title"><h3>Routage SKU / variantes</h3><span className="saw-pill">{mappings.length}</span></div>
          <form action={saveSupplierMapping} className="saw-form">
            <div className="saw-two"><label><div className="saw-label">Fournisseur</div><select className="saw-select" name="supplier_connection_id" required>{connections.map((c) => <option key={c.id} value={c.id}>{c.name} · {getSupplierProvider(c.provider_key ?? "custom_rest").name}</option>)}</select></label><label><div className="saw-label">SKU fournisseur</div><input className="saw-input" name="external_sku" required placeholder="SKU-123"/></label></div>
            <div className="saw-two"><label><div className="saw-label">Produit</div><select className="saw-select" name="product_id" required>{products.map((p) => <option key={p.id} value={p.id}>{p.title}{p.sku ? " · "+p.sku : ""}</option>)}</select></label><label><div className="saw-label">Variante</div><select className="saw-select" name="variant_id" defaultValue=""><option value="">Produit principal</option>{variants.map((v)=><option key={v.id} value={v.id}>{v.label}{v.sku ? " · "+v.sku : ""}</option>)}</select></label></div>
            <div className="saw-three"><label><div className="saw-label">Priorité de routage</div><input className="saw-input" name="priority" type="number" min="1" max="10000" defaultValue={100}/></label><label><div className="saw-label">Pays autorisés</div><input className="saw-input" name="destination_countries" placeholder="TZ,KE,FR,DE"/></label><label><div className="saw-label">Politique prix</div><select className="saw-select" name="reprice_mode" defaultValue="cost_plus_margin"><option value="cost_only">Ne pas toucher</option><option value="cost_plus_margin">Marge cible</option><option value="cost_plus_markup">Marge fixe</option><option value="supplier_price">Prix fournisseur</option></select></label></div>
            <div className="saw-three"><label><div className="saw-label">Marge cible</div><input className="saw-input" name="margin_percent" type="number" step="0.1" defaultValue={30}/></label><label><div className="saw-label">Markup (€)</div><input className="saw-input" name="markup_eur" type="number" step="0.01" defaultValue={0}/></label><label><div className="saw-label">Prix min (€)</div><input className="saw-input" name="min_retail_eur" type="number" step="0.01" defaultValue={0.50}/></label></div>
            <div className="saw-two"><label><div className="saw-label">Prix max (€)</div><input className="saw-input" name="max_retail_eur" type="number" step="0.01"/></label><label className="saw-check" style={{paddingTop:20}}><input type="checkbox" name="auto_reprice"/><span>Autoriser le repricing automatique</span></label></div>
            <button className="saw-btn saw-btn-primary" type="submit">Enregistrer le routage</button>
          </form>
          <div className="saw-list" style={{marginTop:12}}>
            {mappings.length ? mappings.map((m) => <article className="saw-card" key={m.id}><div className="saw-card-top"><div><h4>{m.products?.title ?? "Produit"}</h4><div className="saw-meta">{m.product_variants?.label ? m.product_variants.label+" · " : ""}{m.external_sku} · {eur(m.supplier_cost_cents)} · stock {m.supplier_qty} · priorité {m.priority ?? 100}{m.destination_countries?.length ? " · "+m.destination_countries.join(", ") : " · monde"}</div></div><span className={"saw-status "+(m.available ? "ok":"bad")}>{m.available ? "Disponible":"Épuisé"}</span></div><div className="saw-meta">{connections.find((c) => c.id === m.supplier_connection_id)?.name ?? "Fournisseur"} · {getSupplierProvider(connections.find((c) => c.id === m.supplier_connection_id)?.provider_key ?? "custom_rest").name}</div><div className="saw-actions"><form action={deleteSupplierMapping}><input type="hidden" name="id" value={m.id}/><button className="saw-btn saw-btn-danger">Supprimer</button></form></div></article>) : <div className="saw-empty">Aucun routage fournisseur.</div>}
          </div>
        </div>
        <div className="saw-section"><div className="saw-title"><h3>Commandes fournisseur</h3><span className="saw-pill">{orders.length}</span></div>
          <div className="saw-list">{orders.length ? orders.map((o)=><article className="saw-card" key={o.id}><div className="saw-card-top"><div><h4>{o.orders?.order_number ?? o.client_reference} · {o.supplier_connections?.name ?? "Fournisseur"}</h4><div className="saw-meta">Coût {eur(o.supplier_total_cents)} · {date(o.created_at)}{o.external_order_id ? " · ID externe "+o.external_order_id : ""}</div></div><span className={"saw-status "+statusClass(o.status)}>{o.status}</span></div>{o.last_error ? <div className="saw-meta" style={{color:"#ffb0b0"}}>{o.last_error}</div> : null}{o.tracking_number ? <div className="saw-meta">Suivi : {o.tracking_number}</div> : null}<div className="saw-actions">{["failed","needs_review"].includes(o.status) ? <form action={retrySupplierOrder}><input type="hidden" name="id" value={o.id}/><button className="saw-btn">Réessayer</button></form>:null}</div></article>) : <div className="saw-empty">Aucune commande fournisseur.</div>}</div>
        </div>
      </div>
    </div>
  </section>;
}
