import { saveSupplierConnection, saveSupplierMapping, syncSupplierNow, testSupplierConnection, toggleSupplierConnection, deleteSupplierMapping, retrySupplierOrder } from "@/app/actions/supplier-automation";

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
.saw-k{font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.38)}.saw-head h2{margin:.4rem 0 .35rem;font-size:1.35rem}.saw-head p{margin:0;max-width:900px;color:rgba(255,255,255,.56);line-height:1.7;font-size:.8rem}
.saw-grid{display:grid;grid-template-columns:1.05fr .95fr}.saw-pane{padding:22px;border-right:1px solid rgba(255,255,255,.07)}.saw-pane:last-child{border-right:0;background:rgba(0,0,0,.1)}
.saw-section{padding:18px 0;border-top:1px solid rgba(255,255,255,.06)}.saw-section:first-child{border-top:0;padding-top:0}.saw-title{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.saw-title h3{margin:0;font-size:.88rem}.saw-pill{font-size:.54rem;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.54)}
.saw-form{display:grid;gap:9px}.saw-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.saw-three{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.saw-label{font-size:.58rem;font-weight:800;color:rgba(255,255,255,.7);margin-bottom:4px}.saw-input,.saw-select,.saw-textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);color:inherit;border-radius:10px;padding:9px 10px;font:inherit;font-size:.65rem;outline:none}.saw-textarea{min-height:105px;resize:vertical;line-height:1.45}.saw-input:focus,.saw-select:focus,.saw-textarea:focus{border-color:rgba(255,210,70,.3);box-shadow:0 0 0 4px rgba(255,210,70,.04)}
.saw-help{font-size:.56rem;color:rgba(255,255,255,.35);line-height:1.5}.saw-check{display:flex;gap:7px;align-items:flex-start;font-size:.59rem;color:rgba(255,255,255,.58);line-height:1.45}.saw-check input{margin-top:2px}
.saw-btn{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:rgba(255,255,255,.78);border-radius:10px;padding:8px 10px;font-size:.6rem;font-weight:800;cursor:pointer}.saw-btn:hover{border-color:rgba(255,210,70,.22);color:#fff}.saw-btn-primary{background:linear-gradient(135deg,#ffe07a,#ffc400);border-color:transparent;color:#17202a}.saw-btn-danger{color:#ffb9b9}
.saw-card{border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;background:rgba(255,255,255,.025);margin-bottom:8px}.saw-card-top{display:flex;justify-content:space-between;gap:10px}.saw-card h4{margin:0;font-size:.72rem}.saw-meta{font-size:.55rem;color:rgba(255,255,255,.34);line-height:1.5;margin-top:4px}.saw-status{font-size:.54rem;padding:4px 7px;border-radius:999px;white-space:nowrap}.saw-status.ok{color:#a8e6c2;background:rgba(73,194,126,.09)}.saw-status.warn{color:#ffe09a;background:rgba(255,190,55,.09)}.saw-status.bad{color:#ffb0b0;background:rgba(255,75,75,.09)}.saw-status.off{color:rgba(255,255,255,.45);background:rgba(255,255,255,.05)}
.saw-list{max-height:440px;overflow:auto;padding-right:2px}.saw-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.saw-webhook{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.55rem;word-break:break-all;color:#ffe07a;background:rgba(255,210,70,.05);border:1px dashed rgba(255,210,70,.16);padding:8px 9px;border-radius:10px}.saw-table{width:100%;border-collapse:collapse;font-size:.57rem}.saw-table th,.saw-table td{padding:7px 6px;border-top:1px solid rgba(255,255,255,.06);text-align:left;vertical-align:top}.saw-table th{color:rgba(255,255,255,.35);font-weight:800}.saw-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.54rem;color:rgba(255,255,255,.57)}.saw-empty{padding:18px;text-align:center;border:1px dashed rgba(255,255,255,.07);border-radius:11px;color:rgba(255,255,255,.33);font-size:.6rem}
@media(max-width:1050px){.saw-grid{grid-template-columns:1fr}.saw-pane{border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.saw-two,.saw-three{grid-template-columns:1fr}}
`;

const eur = (c: number | null) => c == null ? "—" : new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(c/100);
const date = (s: string | null) => s ? new Date(s).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "jamais";

function statusClass(status: string) {
  if (status === "healthy" || status === "confirmed" || status === "submitted" || status === "processing" || status === "shipped" || status === "delivered") return "ok";
  if (status === "disabled") return "off";
  if (status === "failed" || status === "unknown") return "bad";
  return "warn";
}

function ConnectionForm({ c, sampleOnly = false }: { c?: Connection; sampleOnly?: boolean }) {
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
    <div className="saw-two"><label><div className="saw-label">Nom du fournisseur</div><input className="saw-input" name="name" defaultValue={c?.name ?? ""} placeholder="Ex. Fournisseur principal" required/></label><label><div className="saw-label">Base API HTTPS</div><input className="saw-input" name="base_url" defaultValue={c?.base_url ?? ""} placeholder="https://api.fournisseur.com" required/></label></div>
    <div className="saw-two"><label><div className="saw-label">Méthode inventaire</div><select className="saw-select" name="inventory_method" defaultValue={c?.inventory_method ?? "GET"}><option>GET</option><option>POST</option></select></label><label><div className="saw-label">Chemin inventaire</div><input className="saw-input" name="inventory_path" defaultValue={c?.inventory_path ?? "/inventory"} required/></label></div>
    <div className="saw-three">
      <label><div className="saw-label">Liste JSON</div><input className="saw-input" name="inventory_response_path" defaultValue={c?.inventory_response_path ?? "items"} required/></label>
      <label><div className="saw-label">SKU fournisseur</div><input className="saw-input" name="inventory_sku_path" defaultValue={c?.inventory_sku_path ?? "sku"} required/></label>
      <label><div className="saw-label">Stock</div><input className="saw-input" name="inventory_qty_path" defaultValue={c?.inventory_qty_path ?? "quantity"} required/></label>
    </div>
    <div className="saw-three"><label><div className="saw-label">Prix</div><input className="saw-input" name="inventory_price_path" defaultValue={c?.inventory_price_path ?? ""} placeholder="price"/></label><label><div className="saw-label">Devise</div><input className="saw-input" name="inventory_currency_path" defaultValue={c?.inventory_currency_path ?? ""} placeholder="currency"/></label><label><div className="saw-label">Disponible</div><input className="saw-input" name="inventory_available_path" defaultValue={c?.inventory_available_path ?? ""} placeholder="available"/></label></div>
    <div className="saw-two"><label><div className="saw-label">Commande — méthode</div><select className="saw-select" name="order_method" defaultValue={c?.order_method ?? "POST"}><option>POST</option><option>PUT</option></select></label><label><div className="saw-label">Commande — chemin</div><input className="saw-input" name="order_path" defaultValue={c?.order_path ?? "/orders"} required/></label></div>
    <div className="saw-three"><label><div className="saw-label">ID externe retour</div><input className="saw-input" name="order_response_id_path" defaultValue={c?.order_response_id_path ?? "id"} /></label><label><div className="saw-label">Statut retour</div><input className="saw-input" name="order_status_path" defaultValue={c?.order_status_path ?? "status"} /></label><label><div className="saw-label">Suivi</div><input className="saw-input" name="order_tracking_number_path" defaultValue={c?.order_tracking_number_path ?? "tracking_number"} /></label></div>
    <div className="saw-two"><label><div className="saw-label">URL suivi retour</div><input className="saw-input" name="order_tracking_url_path" defaultValue={c?.order_tracking_url_path ?? "tracking_url"} /></label><label><div className="saw-label">Endpoint statut</div><input className="saw-input" name="order_status_endpoint_template" defaultValue={String(c?.config?.order_status_endpoint_template ?? "")} placeholder="/orders/{{external_order_id}}"/></label></div>
    <label><div className="saw-label">Template JSON de commande</div><textarea className="saw-textarea" name="order_payload_template" defaultValue={template}/></label>
    <div className="saw-two"><label><div className="saw-label">En-tête authentification</div><input className="saw-input" name="auth_header" defaultValue={c?.auth_header ?? "Authorization"}/></label><label><div className="saw-label">Préfixe secret</div><input className="saw-input" name="auth_prefix" defaultValue={c?.auth_prefix ?? "Bearer"}/></label></div>
    <div className="saw-two"><label><div className="saw-label">Secret API {c ? "(laisser vide = conserver)" : ""}</div><input className="saw-input" type="password" name="api_secret" autoComplete="new-password" placeholder={c ? "••••••••••••" : "Secret fournisseur"} /></label><label><div className="saw-label">Secret webhook</div><input className="saw-input" type="password" name="webhook_secret" autoComplete="new-password" placeholder={c ? "••••••••••••" : "Secret signé par le fournisseur"} /></label></div>
    <div className="saw-three"><label><div className="saw-label">Intervalle de sync (s)</div><input className="saw-input" type="number" name="sync_interval_seconds" defaultValue={c?.sync_interval_seconds ?? 900} min={60} max={86400}/></label><label><div className="saw-label">Plafond achat fournisseur (€)</div><input className="saw-input" type="number" step="0.01" name="max_supplier_order_eur" defaultValue={Number(c?.config?.max_supplier_order_cents ?? 100000)/100}/></label><div style={{paddingTop:22}}><label className="saw-check"><input type="checkbox" name="auto_order_enabled" defaultChecked={c?.auto_order_enabled}/><span>Envoi automatique des commandes</span></label><label className="saw-check"><input type="checkbox" name="webhook_enabled" defaultChecked={c?.webhook_enabled ?? true}/><span>Webhooks temps réel</span></label></div></div>
    <div className="saw-help">Les secrets sont chiffrés côté serveur. Le fournisseur ne reçoit jamais le prix de vente Assavendo. Le prix fournisseur n'est pas publié comme prix client sauf règle explicite de revalorisation.</div>
    {c ? <div className="saw-webhook">Webhook : https://assavendo.vercel.app/api/dropship/webhook/{c.id}</div> : null}
    <button className="saw-btn saw-btn-primary" type="submit">{sampleOnly ? "Créer le connecteur" : "Enregistrer le connecteur"}</button>
  </form>;
}

export function SupplierAutomationPanel({ connections, mappings, orders, products, variants }: { connections: Connection[]; mappings: Mapping[]; orders: SupplierOrder[]; products: ProductOption[]; variants: VariantOption[] }) {
  return <section className="saw"><style>{css}</style>
    <header className="saw-head"><div className="saw-k">Supplier Control Plane · synchronisation & exécution</div><h2>Stock fournisseur en direct · commandes automatiques</h2><p>Webhooks signés pour la mise à jour immédiate, polling de secours, historique des prix, règles de revalorisation et envoi des commandes payées avec idempotence. Une anomalie de mapping, de prix, de stock ou de sécurité bascule automatiquement en revue humaine.</p></header>
    <div className="saw-grid">
      <div className="saw-pane">
        <div className="saw-section"><div className="saw-title"><h3>Connecteurs fournisseurs</h3><span className="saw-pill">{connections.length}</span></div>
          {connections.length ? connections.map((c) => <article className="saw-card" key={c.id}>
            <div className="saw-card-top"><div><h4>{c.name}</h4><div className="saw-meta">{c.base_url} · sync {c.sync_interval_seconds}s · dernier succès {date(c.last_success_at)}</div></div><span className={"saw-status "+statusClass(c.status)}>{c.status}</span></div>
            {c.last_error ? <div className="saw-meta" style={{color:"#ffb0b0"}}>{c.last_error}</div> : null}
            <div className="saw-actions">
              <form action={toggleSupplierConnection}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="enabled" value={String(!c.enabled)}/><button className="saw-btn">{c.enabled ? "Désactiver" : "Activer"}</button></form>
              <form action={testSupplierConnection}><input type="hidden" name="id" value={c.id}/><button className="saw-btn">Tester</button></form>
              <form action={syncSupplierNow}><input type="hidden" name="id" value={c.id}/><button className="saw-btn">Synchroniser maintenant</button></form>
            </div>
            <details className="saw-details" style={{marginTop:10}}><summary style={{fontSize:".58rem",color:"rgba(255,255,255,.36)",cursor:"pointer"}}>Modifier la connexion</summary><div style={{marginTop:10}}><ConnectionForm c={c}/></div></details>
            <div className="saw-meta" style={{marginTop:9}}>Webhook : <span className="saw-code">/api/dropship/webhook/{c.id}</span></div>
          </article>) : <div className="saw-empty">Aucun connecteur. Le centre d’automatisation reste inactif tant qu’un fournisseur réel n’est pas configuré.</div>}
        </div>
        <div className="saw-section"><div className="saw-title"><h3>Nouveau connecteur REST</h3><span className="saw-pill">sécurisé</span></div><ConnectionForm sampleOnly/></div>
      </div>
      <div className="saw-pane">
        <div className="saw-section"><div className="saw-title"><h3>Mappings SKU / variantes</h3><span className="saw-pill">{mappings.length}</span></div>
          <form action={saveSupplierMapping} className="saw-form">
            <div className="saw-two"><label><div className="saw-label">Fournisseur</div><select className="saw-select" name="supplier_connection_id" required>{connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><div className="saw-label">SKU fournisseur</div><input className="saw-input" name="external_sku" required placeholder="SKU-123"/></label></div>
            <div className="saw-two"><label><div className="saw-label">Produit</div><select className="saw-select" name="product_id" required>{products.map((p) => <option key={p.id} value={p.id}>{p.title}{p.sku ? " · "+p.sku : ""}</option>)}</select></label><label><div className="saw-label">Variante (optionnel)</div><select className="saw-select" name="variant_id" defaultValue="">{[<option key="none" value="">Produit principal</option>,...variants.map((v)=><option key={v.id} value={v.id}>{v.label}{v.sku ? " · "+v.sku : ""}</option>)]}</select></label></div>
            <div className="saw-three"><label><div className="saw-label">Politique prix</div><select className="saw-select" name="reprice_mode" defaultValue="cost_plus_margin"><option value="cost_only">Ne pas toucher le prix</option><option value="cost_plus_margin">Marge cible</option><option value="cost_plus_markup">Marge fixe</option><option value="supplier_price">Prix fournisseur (strict)</option></select></label><label><div className="saw-label">Marge cible</div><input className="saw-input" name="margin_percent" type="number" step="0.1" defaultValue={30}/></label><label><div className="saw-label">Markup</div><input className="saw-input" name="markup_eur" type="number" step="0.01" defaultValue={0}/></label></div>
            <div className="saw-two"><label><div className="saw-label">Prix client minimum (€)</div><input className="saw-input" name="min_retail_eur" type="number" step="0.01" defaultValue={0.50}/></label><label><div className="saw-label">Prix client maximum (€)</div><input className="saw-input" name="max_retail_eur" type="number" step="0.01"/></label></div>
            <label className="saw-check"><input type="checkbox" name="auto_reprice"/><span>Autoriser la revalorisation automatique à partir du coût fournisseur.</span></label>
            <button className="saw-btn saw-btn-primary" type="submit">Enregistrer le mapping</button>
          </form>
          <div className="saw-list" style={{marginTop:12}}>
            {mappings.length ? mappings.map((m) => <article className="saw-card" key={m.id}><div className="saw-card-top"><div><h4>{m.products?.title ?? "Produit"}</h4><div className="saw-meta">{m.product_variants?.label ? m.product_variants.label+" · " : ""}{m.external_sku} · {eur(m.supplier_cost_cents)} · stock fournisseur {m.supplier_qty}</div></div><span className={"saw-status "+(m.available ? "ok":"bad")}>{m.available ? "Disponible":"Épuisé"}</span></div><div className="saw-actions"><form action={deleteSupplierMapping}><input type="hidden" name="id" value={m.id}/><button className="saw-btn saw-btn-danger">Supprimer</button></form></div></article>) : <div className="saw-empty">Aucun mapping fournisseur.</div>}
          </div>
        </div>
        <div className="saw-section"><div className="saw-title"><h3>Commandes fournisseur</h3><span className="saw-pill">{orders.length}</span></div>
          <div className="saw-list">{orders.length ? orders.map((o)=><article className="saw-card" key={o.id}><div className="saw-card-top"><div><h4>{o.orders?.order_number ?? o.client_reference} · {o.supplier_connections?.name ?? "Fournisseur"}</h4><div className="saw-meta">Coût fournisseur {eur(o.supplier_total_cents)} · {date(o.created_at)}{o.external_order_id ? " · ID externe "+o.external_order_id : ""}</div></div><span className={"saw-status "+statusClass(o.status)}>{o.status}</span></div>{o.last_error ? <div className="saw-meta" style={{color:"#ffb0b0"}}>{o.last_error}</div> : null}{o.tracking_number ? <div className="saw-meta">Suivi : {o.tracking_number}</div> : null}<div className="saw-actions">{["failed","unknown","needs_review"].includes(o.status) ? <form action={retrySupplierOrder}><input type="hidden" name="id" value={o.id}/><button className="saw-btn">Réessayer</button></form>:null}</div></article>) : <div className="saw-empty">Aucune commande fournisseur.</div>}</div>
        </div>
      </div>
    </div>
  </section>;
}
