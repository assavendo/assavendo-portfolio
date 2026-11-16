import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchInventory, type SupplierInventoryRecord } from "./connector";

type Mapping = {
  id: string;
  supplier_connection_id: string;
  product_id: string;
  variant_id: string | null;
  external_sku: string;
  enabled: boolean;
  auto_reprice: boolean;
  reprice_mode: "cost_only" | "cost_plus_margin" | "cost_plus_markup" | "supplier_price";
  margin_bps: number;
  markup_cents: number;
  min_retail_cents: number;
  max_retail_cents: number | null;
  supplier_cost_cents: number | null;
  supplier_currency: string | null;
  supplier_qty: number;
  available: boolean;
};

function retailFromCost(mapping: Mapping, costCents: number): number | null {
  if (!mapping.auto_reprice || mapping.reprice_mode === "cost_only") return null;
  let retail = costCents;
  if (mapping.reprice_mode === "cost_plus_margin") {
    const margin = Math.min(0.9, Math.max(0, mapping.margin_bps / 10_000));
    retail = Math.ceil(costCents / Math.max(0.1, 1 - margin));
  } else if (mapping.reprice_mode === "cost_plus_markup") {
    retail = costCents + mapping.markup_cents;
  } else if (mapping.reprice_mode === "supplier_price") {
    retail = costCents;
  }
  retail = Math.max(mapping.min_retail_cents, retail);
  if (mapping.max_retail_cents !== null) retail = Math.min(mapping.max_retail_cents, retail);
  return retail;
}

function percentChange(oldValue: number | null, nextValue: number | null): number | null {
  if (oldValue === null || nextValue === null || oldValue === 0) return null;
  return ((nextValue - oldValue) / oldValue) * 100;
}

async function applyRecord(mapping: Mapping, record: SupplierInventoryRecord, connectionId: string): Promise<{ changed: boolean; priceChanged: boolean; stockChanged: boolean }> {
  const db = supabaseAdmin();
  const qty = Math.max(0, record.supplier_qty ?? 0);
  const available = record.available ?? qty > 0;
  const cost = record.supplier_price_cents;
  const oldCost = mapping.supplier_cost_cents;
  const oldQty = mapping.supplier_qty;
  const oldAvailable = mapping.available;
  const priceChanged = cost !== null && cost !== oldCost;
  const stockChanged = qty !== oldQty;
  const availabilityChanged = available !== oldAvailable;
  const changed = priceChanged || stockChanged || availabilityChanged;

  if (mapping.variant_id) {
    const { data: variant } = await db.from("product_variants").select("price_cents").eq("id", mapping.variant_id).maybeSingle();
    const retail = cost === null ? null : retailFromCost(mapping, cost);
    if (retail !== null && retail !== variant?.price_cents) {
      await db.from("product_variants").update({ price_cents: retail, stock_qty: qty, active: available || qty > 0 }).eq("id", mapping.variant_id).eq("product_id", mapping.product_id);
      await db.from("supplier_price_history").insert({
        mapping_id: mapping.id, old_cost_cents: oldCost, new_cost_cents: cost, currency: record.supplier_currency ?? mapping.supplier_currency,
        retail_price_cents: retail, change_percent: percentChange(oldCost, cost), source: "sync",
      });
    } else {
      await db.from("product_variants").update({ stock_qty: qty, active: available || qty > 0 }).eq("id", mapping.variant_id).eq("product_id", mapping.product_id);
      if (priceChanged) {
        await db.from("supplier_price_history").insert({
          mapping_id: mapping.id, old_cost_cents: oldCost, new_cost_cents: cost, currency: record.supplier_currency ?? mapping.supplier_currency,
          retail_price_cents: variant?.price_cents ?? null, change_percent: percentChange(oldCost, cost), source: "sync",
        });
      }
    }
  } else {
    const { data: product } = await db.from("products").select("price_cents").eq("id", mapping.product_id).maybeSingle();
    const retail = cost === null ? null : retailFromCost(mapping, cost);
    const productUpdate: Record<string, unknown> = { stock_qty: qty };
    if (retail !== null) productUpdate.price_cents = retail;
    await db.from("products").update(productUpdate).eq("id", mapping.product_id);
    if (priceChanged) {
      await db.from("supplier_price_history").insert({
        mapping_id: mapping.id, old_cost_cents: oldCost, new_cost_cents: cost, currency: record.supplier_currency ?? mapping.supplier_currency,
        retail_price_cents: retail ?? product?.price_cents ?? null, change_percent: percentChange(oldCost, cost), source: "sync",
      });
    }
  }

  await db.from("supplier_inventory_snapshots").insert({
    supplier_connection_id: connectionId,
    mapping_id: mapping.id,
    external_sku: record.external_sku,
    supplier_qty: record.supplier_qty,
    supplier_price_cents: record.supplier_price_cents,
    supplier_currency: record.supplier_currency,
    available,
    raw_payload: record.raw && typeof record.raw === "object" ? record.raw : {},
  });

  const now = new Date().toISOString();
  await db.from("product_supplier_mappings").update({
    supplier_cost_cents: cost,
    supplier_currency: record.supplier_currency ?? mapping.supplier_currency ?? "eur",
    supplier_qty: qty,
    available,
    last_synced_at: now,
    last_price_change_at: priceChanged ? now : undefined,
    last_stock_change_at: stockChanged ? now : undefined,
    last_error: null,
  }).eq("id", mapping.id);

  return { changed, priceChanged, stockChanged };
}

export async function syncSupplierConnection(connectionId: string, trigger: "schedule" | "manual" | "webhook" = "schedule") {
  const db = supabaseAdmin();
  const { data: run, error: runError } = await db.from("supplier_sync_runs").insert({ supplier_connection_id: connectionId, trigger, status: "running" }).select("id").single();
  if (runError || !run) throw new Error(runError?.message ?? "Impossible de créer le run de synchronisation.");

  try {
    const { data: mappings, error: mappingError } = await db.from("product_supplier_mappings")
      .select("id,supplier_connection_id,product_id,variant_id,external_sku,enabled,auto_reprice,reprice_mode,margin_bps,markup_cents,min_retail_cents,max_retail_cents,supplier_cost_cents,supplier_currency,supplier_qty,available")
      .eq("supplier_connection_id", connectionId)
      .eq("enabled", true);
    if (mappingError) throw mappingError;

    const { records, connection } = await fetchInventory(connectionId, { timestamp: new Date().toISOString() });
    const bySku = new Map(records.map((record) => [record.external_sku, record]));
    let applied = 0;
    let changed = 0;
    let priceChanges = 0;
    let stockChanges = 0;

    for (const mapping of (mappings ?? []) as Mapping[]) {
      const record = bySku.get(mapping.external_sku);
      if (!record) continue;
      const result = await applyRecord(mapping, record, connectionId);
      applied += 1;
      if (result.changed) changed += 1;
      if (result.priceChanged) priceChanges += 1;
      if (result.stockChanged) stockChanges += 1;
    }

    const now = new Date().toISOString();
    await db.from("supplier_connections").update({
      status: "healthy", last_sync_at: now, last_success_at: now, last_error: null,
    }).eq("id", connectionId);
    await db.from("supplier_sync_runs").update({
      status: "success", finished_at: now, fetched_count: records.length, applied_count: applied,
      changed_count: changed, error_count: 0, metadata: { price_changes: priceChanges, stock_changes: stockChanges, provider: connection.name },
    }).eq("id", run.id);
    return { connectionId, fetched: records.length, applied, changed, priceChanges, stockChanges };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier synchronization failed.";
    await db.from("supplier_connections").update({ status: "degraded", last_sync_at: new Date().toISOString(), last_error: message.slice(0, 1000) }).eq("id", connectionId);
    await db.from("supplier_sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_count: 1, error: message.slice(0, 2000) }).eq("id", run.id);
    throw error;
  }
}

export async function syncDueSupplierConnections(limit = 5) {
  const db = supabaseAdmin();
  const { data: connections, error } = await db.from("supplier_connections")
    .select("id,sync_interval_seconds,last_sync_at")
    .eq("enabled", true)
    .in("status", ["healthy","degraded","rate_limited","unavailable"])
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  const due = (connections ?? []).filter((connection) => {
    if (!connection.last_sync_at) return true;
    return Date.now() - new Date(connection.last_sync_at).getTime() >= Number(connection.sync_interval_seconds) * 1000;
  });
  const results: unknown[] = [];
  for (const connection of due) {
    try { results.push(await syncSupplierConnection(connection.id, "schedule")); }
    catch (error) { results.push({ connectionId: connection.id, error: error instanceof Error ? error.message : "sync failed" }); }
  }
  return results;
}
