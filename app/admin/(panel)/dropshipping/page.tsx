import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SupplierImportForm } from "@/components/admin/SupplierImportForm";
import { SupplierAutomationPanel } from "@/components/admin/SupplierAutomationPanel";

export const dynamic = "force-dynamic";

export default async function Dropshipping({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = supabaseAdmin();

  const [
    importsResult,
    connectionsResult,
    mappingsResult,
    supplierOrdersResult,
    productsResult,
    variantsResult,
    providersResult,
  ] = await Promise.all([
    db.from("dropship_imports")
      .select("id,supplier_url,product_query,operator_prompt,status,images,extracted,error,product_id,created_at,updated_at,archived_at,decided_at")
      .order("created_at", { ascending: false })
      .limit(60),
    db.from("supplier_connections")
      .select("id,name,base_url,enabled,auto_order_enabled,webhook_enabled,sync_interval_seconds,status,last_sync_at,last_success_at,last_error,config,inventory_method,inventory_path,inventory_response_path,inventory_sku_path,inventory_qty_path,inventory_price_path,inventory_currency_path,inventory_available_path,order_method,order_path,order_response_id_path,order_status_path,order_tracking_number_path,order_tracking_url_path,order_payload_template,auth_header,auth_prefix,provider_key,integration_mode,docs_url,provider_capabilities,sandbox_enabled")
      .order("created_at", { ascending: false }),
    db.from("product_supplier_mappings")
      .select("id,supplier_connection_id,product_id,variant_id,external_sku,auto_reprice,reprice_mode,supplier_cost_cents,supplier_qty,available,last_synced_at,priority,destination_countries,products(title,sku),product_variants(label,sku)")
      .order("updated_at", { ascending: false })
      .limit(500),
    db.from("supplier_orders")
      .select("id,status,client_reference,external_order_id,supplier_total_cents,tracking_number,tracking_url,last_error,created_at,supplier_connections(name),orders(order_number)")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("products")
      .select("id,title,sku")
      .eq("kind", "physical")
      .eq("status", "published")
      .order("title")
      .limit(300),
    db.from("product_variants")
      .select("id,product_id,label,sku")
      .eq("active", true)
      .order("sort")
      .limit(500),
    db.from("supplier_provider_catalog")
      .select("provider_key,name,integration_mode,adapter_key,verification_status,official_url,docs_url,capabilities,config_schema,notes")
      .eq("enabled", true)
      .order("name"),
  ]);

  const panelError = connectionsResult.error || mappingsResult.error || supplierOrdersResult.error || productsResult.error || variantsResult.error || providersResult.error;
  return <div>
    {sp.ok ? <p className="alert alert-ok" role="status">{sp.ok}</p> : null}
    {sp.erreur ? <p className="alert alert-err" role="alert">{sp.erreur}</p> : null}
    {importsResult.error ? <p className="alert alert-err" role="alert">Lecture des imports fournisseur impossible.</p> : null}
    {panelError ? <p className="alert alert-err" role="alert">Lecture du centre d'automatisation fournisseur partiellement indisponible.</p> : null}
    <SupplierAutomationPanel
      connections={(connectionsResult.data ?? []) as never}
      mappings={(mappingsResult.data ?? []) as never}
      orders={(supplierOrdersResult.data ?? []) as never}
      products={(productsResult.data ?? []) as never}
      variants={(variantsResult.data ?? []) as never}
      providers={(providersResult.data ?? []) as never}
    />
    <SupplierImportForm imports={(importsResult.data ?? []) as never} />
  </div>;
}
