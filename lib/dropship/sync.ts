import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchInventory, type SupplierInventoryRecord } from "./connector";
import { getRatesToEur, toEurCents } from "./fx";
import { isAllowedImageUrl } from "@/lib/images";

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
  supplier_weight_g: number | null;
  supplier_volume_cm3: number | null;
  supplier_qty: number;
  available: boolean;
  source_cost_cents: number | null;
  source_currency: string | null;
  fx_rate_to_eur: number | null;
  external_product_id: string | null;
  external_variant_id: string | null;
};

async function assertDb<T>(operation: PromiseLike<{ data?: T; error: { message?: string } | null }>, label: string): Promise<T | undefined> {
  const result = await operation;
  if (result.error) throw new Error(label + ": " + (result.error.message ?? "erreur Supabase"));
  return result.data;
}

type SyncProductRow = {
  kind: string;
  status: string;
  price_cents: number | null;
  shipping_cents: number | null;
  delivery_min_days: number | null;
  delivery_max_days: number | null;
  images: unknown;
  stock_qty: number | null;
  category_id: string | null;
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

async function refreshSyncedProducts(
  db: ReturnType<typeof supabaseAdmin>,
  connection: { config?: Record<string, unknown> | null },
  productIds: string[],
): Promise<number> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return 0;
  const config = connection.config ?? {};
  const deliveryMin = Number(config.delivery_min_days ?? 0);
  const deliveryMax = Number(config.delivery_max_days ?? 0);
  const autoPublish = config.auto_publish_after_sync === true;
  let published = 0;

  for (const productId of ids) {
    const productResult = await db.from("products").select("id,kind,status,price_cents,shipping_cents,delivery_min_days,delivery_max_days,images,stock_qty,category_id").eq("id", productId).maybeSingle();
    if (productResult.error) throw new Error("Lecture produit: " + productResult.error.message);
    const product = productResult.data as SyncProductRow | null;
    if (!product || product.kind !== "physical") continue;

    const variants = await assertDb(db.from("product_variants").select("price_cents,stock_qty,active").eq("product_id", productId).eq("active", true).order("sort"), "Lecture variantes") ?? [];

    const pricedVariants = (variants ?? []).filter((v) => Number(v.price_cents ?? 0) > 0);
    const prices = pricedVariants.map((v) => Number(v.price_cents));
    const stock = (variants ?? []).length
      ? (variants ?? []).reduce((sum, v) => sum + Math.max(0, Number(v.stock_qty ?? 0)), 0)
      : Math.max(0, Number(product.stock_qty ?? 0));
    const minPrice = prices.length ? Math.min(...prices) : Number(product.price_cents ?? 0);
    const hasStock = (variants ?? []).length
      ? (variants ?? []).some((v) => Number(v.stock_qty ?? 0) > 0 && Number(v.price_cents ?? 0) > 0)
      : Number(product.stock_qty ?? 0) > 0 && Number(product.price_cents ?? 0) > 0;

    const update: Record<string, unknown> = {
      price_cents: Math.max(0, Math.round(minPrice)),
      stock_qty: stock,
    };
    if ((!product.delivery_min_days || !product.delivery_max_days) && deliveryMin > 0 && deliveryMax >= deliveryMin) {
      update.delivery_min_days = deliveryMin;
      update.delivery_max_days = deliveryMax;
    }
    await assertDb(db.from("products").update(update).eq("id", productId), "Mise à jour produit");

    if (!autoPublish || product.status !== "draft" || !hasStock || !product.category_id) continue;
    const images = Array.isArray(product.images) ? product.images as Array<{ url?: string; alt?: string }> : [];
    const hasPublishableImage = images.some((image) => typeof image?.url === "string" && typeof image?.alt === "string" && image.alt.trim() && isAllowedImageUrl(image.url));
    const minDelivery = Number(update.delivery_min_days ?? product.delivery_min_days ?? 0);
    const maxDelivery = Number(update.delivery_max_days ?? product.delivery_max_days ?? 0);
    if (minPrice < 50 || !hasPublishableImage || minDelivery <= 0 || maxDelivery < minDelivery) continue;

    const { error: publishError } = await db.from("products").update({
      status: "published",
      published_at: new Date().toISOString(),
      price_cents: Math.round(minPrice),
      stock_qty: stock,
      ...(update.delivery_min_days ? { delivery_min_days: update.delivery_min_days, delivery_max_days: update.delivery_max_days } : {}),
    }).eq("id", productId).eq("status", "draft");
    if (publishError) throw new Error("Publication produit: " + publishError.message);
    published += 1;
  }
  return published;
}



async function acquireSupplierJobLock(jobKey: string, ttlSeconds = 300): Promise<string | null> {
  const db = supabaseAdmin();
  const now = new Date();
  const until = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const lockedBy = randomUUID();

  const { data: refreshed } = await db.from("supplier_job_locks")
    .update({ locked_until: until, locked_by: lockedBy })
    .eq("job_key", jobKey)
    .lt("locked_until", now.toISOString())
    .select("job_key")
    .maybeSingle();
  if (refreshed) return lockedBy;

  const { error } = await db.from("supplier_job_locks").insert({
    job_key: jobKey,
    locked_until: until,
    locked_by: lockedBy,
  });
  if (!error) return lockedBy;
  if (error.code !== "23505") throw error;
  return null;
}

async function releaseSupplierJobLock(jobKey: string, lockedBy: string): Promise<void> {
  await supabaseAdmin().from("supplier_job_locks").delete().eq("job_key", jobKey).eq("locked_by", lockedBy);
}

async function applyRecord(mapping: Mapping, record: SupplierInventoryRecord, connectionId: string): Promise<{ changed: boolean; priceChanged: boolean; stockChanged: boolean }> {
  const db = supabaseAdmin();
  const qty = Math.max(0, record.supplier_qty ?? 0);
  const available = record.available ?? qty > 0;
  const cost = record.supplier_price_cents;
  const normalizedMeta = record.raw && typeof record.raw === "object"
    ? ((record.raw as Record<string, unknown>).normalized as Record<string, unknown> | undefined)
    : undefined;
  const sourceCost = Number.isFinite(Number(normalizedMeta?.source_cost_cents))
    ? Number(normalizedMeta?.source_cost_cents)
    : cost;
  const sourceCurrency = typeof normalizedMeta?.source_currency === "string"
    ? String(normalizedMeta.source_currency).toUpperCase()
    : (record.supplier_currency ?? "EUR").toUpperCase();
  const fxRate = Number.isFinite(Number(normalizedMeta?.fx_rate_to_eur))
    ? Number(normalizedMeta?.fx_rate_to_eur)
    : 1;
  const oldCost = mapping.supplier_cost_cents;
  const oldQty = mapping.supplier_qty;
  const oldAvailable = mapping.available;
  const priceChanged = cost !== null && cost !== oldCost;
  const stockChanged = qty !== oldQty;
  const availabilityChanged = available !== oldAvailable;
  const changed = priceChanged || stockChanged || availabilityChanged;

  if (mapping.variant_id) {
    const variant = await assertDb(
      db.from("product_variants").select("price_cents").eq("id", mapping.variant_id).maybeSingle(),
      "Lecture variante synchronisée",
    );
    const retail = cost === null ? null : retailFromCost(mapping, cost);
    if (retail !== null && retail !== variant?.price_cents) {
      await assertDb(db.from("product_variants").update({ price_cents: retail, stock_qty: qty, active: available || qty > 0 }).eq("id", mapping.variant_id).eq("product_id", mapping.product_id), "Mise à jour variante");
      await assertDb(db.from("supplier_price_history").insert({
        mapping_id: mapping.id, old_cost_cents: oldCost, new_cost_cents: cost, currency: "eur", source_cost_cents: sourceCost, source_currency: sourceCurrency, fx_rate_to_eur: fxRate,
        retail_price_cents: retail, change_percent: percentChange(oldCost, cost), source: "sync",
      }), "Historique prix");
    } else {
      await assertDb(db.from("product_variants").update({ stock_qty: qty, active: available || qty > 0 }).eq("id", mapping.variant_id).eq("product_id", mapping.product_id), "Mise à jour stock variante");
      if (priceChanged) {
        await assertDb(db.from("supplier_price_history").insert({
          mapping_id: mapping.id, old_cost_cents: oldCost, new_cost_cents: cost, currency: "eur", source_cost_cents: sourceCost, source_currency: sourceCurrency, fx_rate_to_eur: fxRate,
          retail_price_cents: variant?.price_cents ?? null, change_percent: percentChange(oldCost, cost), source: "sync",
        }), "Historique prix");
      }
    }
  } else {
    const product = await assertDb(
      db.from("products").select("price_cents").eq("id", mapping.product_id).maybeSingle(),
      "Lecture produit synchronisé",
    );
    const retail = cost === null ? null : retailFromCost(mapping, cost);
    const productUpdate: Record<string, unknown> = { stock_qty: qty };
    if (retail !== null) productUpdate.price_cents = retail;
    await assertDb(db.from("products").update(productUpdate).eq("id", mapping.product_id), "Mise à jour produit");
    if (priceChanged) {
      await assertDb(db.from("supplier_price_history").insert({
        mapping_id: mapping.id, old_cost_cents: oldCost, new_cost_cents: cost, currency: "eur", source_cost_cents: sourceCost, source_currency: sourceCurrency, fx_rate_to_eur: fxRate,
        retail_price_cents: retail ?? product?.price_cents ?? null, change_percent: percentChange(oldCost, cost), source: "sync",
      }), "Historique prix");
    }
  }

  await assertDb(db.from("supplier_inventory_snapshots").insert({
    supplier_connection_id: connectionId,
    mapping_id: mapping.id,
    external_sku: record.external_sku,
    supplier_qty: record.supplier_qty,
    supplier_price_cents: cost,
    supplier_currency: "eur",
    source_price_cents: sourceCost,
    source_currency: sourceCurrency,
    fx_rate_to_eur: fxRate,
    available,
    raw_payload: record.raw && typeof record.raw === "object" ? record.raw : {},
  }), "Snapshot inventaire");

  const now = new Date().toISOString();
  await assertDb(db.from("product_supplier_mappings").update({
    supplier_cost_cents: cost,
    supplier_currency: "eur",
    supplier_weight_g: record.supplier_weight_g ?? mapping.supplier_weight_g ?? null,
    supplier_volume_cm3: record.supplier_volume_cm3 ?? mapping.supplier_volume_cm3 ?? null,
    source_cost_cents: sourceCost,
    source_currency: sourceCurrency,
    fx_rate_to_eur: fxRate,
    external_product_id: record.external_product_id ?? mapping.external_product_id ?? null,
    external_variant_id: record.external_variant_id ?? mapping.external_variant_id ?? null,
    supplier_qty: qty,
    available,
    last_synced_at: now,
    last_price_change_at: priceChanged ? now : undefined,
    last_stock_change_at: stockChanged ? now : undefined,
    last_error: null,
  }).eq("id", mapping.id), "Mise à jour mapping");

  return { changed, priceChanged, stockChanged };
}

export async function syncSupplierConnection(connectionId: string, trigger: "schedule" | "manual" | "webhook" = "schedule") {
  const lockKey = `supplier-sync:${connectionId}`;
  const lockedBy = await acquireSupplierJobLock(lockKey);
  if (!lockedBy) {
    return { connectionId, fetched: 0, applied: 0, changed: 0, priceChanges: 0, stockChanges: 0, published: 0, skipped: true };
  }

  const db = supabaseAdmin();
  const { data: run, error: runError } = await db.from("supplier_sync_runs").insert({ supplier_connection_id: connectionId, trigger, status: "running" }).select("id").single();
  if (runError || !run) {
    await releaseSupplierJobLock(lockKey, lockedBy);
    throw new Error(runError?.message ?? "Impossible de créer le run de synchronisation.");
  }

  try {
    const { data: mappings, error: mappingError } = await db.from("product_supplier_mappings")
      .select("id,supplier_connection_id,product_id,variant_id,external_sku,enabled,auto_reprice,reprice_mode,margin_bps,markup_cents,min_retail_cents,max_retail_cents,supplier_cost_cents,supplier_currency,supplier_qty,available,source_cost_cents,source_currency,fx_rate_to_eur,external_product_id,external_variant_id,supplier_weight_g,supplier_volume_cm3")
      .eq("supplier_connection_id", connectionId)
      .eq("enabled", true);
    if (mappingError) throw mappingError;

    const externalSkus = (mappings ?? []).map((mapping) => mapping.external_sku).filter(Boolean);
    const { records, connection } = await fetchInventory(
      connectionId,
      {
        timestamp: new Date().toISOString(),
        mapping_hints: (mappings ?? []).map((mapping) => ({
          external_sku: mapping.external_sku,
          external_product_id: mapping.external_product_id,
        })),
      },
      externalSkus,
    );
    const sourceCurrencies = [...new Set(records.map((record) => String(record.supplier_currency ?? "EUR").toUpperCase()).filter((currency) => currency !== "EUR"))];
    const fxRates = sourceCurrencies.length ? await getRatesToEur(sourceCurrencies) : {};
    const normalizedRecords = records.map((record) => {
      const sourceCurrency = String(record.supplier_currency ?? "EUR").toUpperCase();
      const sourceCost = record.supplier_price_cents;
      if (sourceCurrency === "EUR" || sourceCost == null) return record;
      const normalizedCost = toEurCents(sourceCost, sourceCurrency, fxRates);
      return {
        ...record,
        supplier_price_cents: normalizedCost,
        supplier_currency: "EUR",
        raw: {
          ...(record.raw && typeof record.raw === "object" ? record.raw : {}),
          normalized: {
            source_currency: sourceCurrency,
            source_cost_cents: sourceCost,
            fx_rate_to_eur: 1 / fxRates[sourceCurrency].rate,
            cost_cents: normalizedCost,
            currency: "EUR",
          },
        },
      };
    });
    const bySku = new Map(normalizedRecords.map((record) => [record.external_sku, record]));
    let applied = 0;
    let changed = 0;
    let priceChanges = 0;
    let stockChanges = 0;
    const syncedProductIds = (mappings ?? []).map((mapping) => mapping.product_id);

    for (const mapping of (mappings ?? []) as Mapping[]) {
      const record = bySku.get(mapping.external_sku);
      if (!record) continue;
      const result = await applyRecord(mapping, record, connectionId);
      applied += 1;
      if (result.changed) changed += 1;
      if (result.priceChanged) priceChanges += 1;
      if (result.stockChanged) stockChanges += 1;
    }

    const published = await refreshSyncedProducts(db, connection, syncedProductIds);
    const now = new Date().toISOString();
    await assertDb(db.from("supplier_connections").update({
      status: "healthy", last_sync_at: now, last_success_at: now, last_error: null,
    }).eq("id", connectionId), "Mise à jour état connexion");
    await assertDb(db.from("supplier_sync_runs").update({
      status: "success", finished_at: now, fetched_count: records.length, applied_count: applied,
      changed_count: changed, error_count: 0, metadata: { price_changes: priceChanges, stock_changes: stockChanges, published_products: published, provider: connection.name },
    }).eq("id", run.id), "Mise à jour résultat synchronisation");
    return { connectionId, fetched: records.length, applied, changed, priceChanges, stockChanges, published, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supplier synchronization failed.";
    const rateLimited = /CJ HTTP 429|1600200|QPS limit/i.test(message);
    const failedAt = new Date().toISOString();
    const [connectionWrite, runWrite] = await Promise.all([
      db.from("supplier_connections").update({
        status: rateLimited ? "rate_limited" : "degraded",
        last_sync_at: failedAt,
        last_error: message.slice(0, 1000),
      }).eq("id", connectionId),
      db.from("supplier_sync_runs").update({
        status: "failed", finished_at: failedAt, error_count: 1, error: message.slice(0, 2000)
      }).eq("id", run.id),
    ]);
    const persistenceErrors = [connectionWrite.error, runWrite.error].filter(Boolean).map((e) => e?.message ?? "erreur de journalisation");
    if (persistenceErrors.length) throw new Error(message + " | Échec de journalisation de l'état : " + persistenceErrors.join(" ; "));
    throw error;
  } finally {
    await releaseSupplierJobLock(lockKey, lockedBy);
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
