import { supabaseAdmin } from "@/lib/supabase/server";
import { callSupplierOrder, checkSupplierOrderStatus, loadSupplierConnection } from "./connector";

type Item = {
  id: string;
  product_id: string;
  variant_id: string | null;
  title: string;
  variant_label: string | null;
  sku: string | null;
  qty: number;
  unit_price_cents: number;
  kind: string;
};

type Mapping = {
  id: string;
  supplier_connection_id: string;
  product_id: string;
  variant_id: string | null;
  external_sku: string;
  enabled: boolean;
  available: boolean;
  supplier_qty: number;
  supplier_cost_cents: number | null;
  supplier_currency: string | null;
  last_synced_at: string | null;
};

function isFresh(mapping: Mapping, intervalSeconds: number): boolean {
  if (!mapping.last_synced_at) return false;
  return Date.now() - new Date(mapping.last_synced_at).getTime() <= Math.max(intervalSeconds * 3, 1800) * 1000;
}

async function connectionMap(ids: string[]) {
  if (!ids.length) return new Map<string, Awaited<ReturnType<typeof loadSupplierConnection>>>();
  const rows = await Promise.all(ids.map(async (id) => {
    try { return [id, await loadSupplierConnection(id)] as const; } catch { return null; }
  }));
  return new Map(rows.filter(Boolean) as [string, Awaited<ReturnType<typeof loadSupplierConnection>>][]);
}

export async function queueSupplierOrders(orderId: string) {
  const db = supabaseAdmin();
  const { data: order, error: orderError } = await db.from("orders").select("id,order_number,status,customer_email,shipping,billing,currency,amount_cents,fulfilment").eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error(orderError?.message || "Commande introuvable.");
  if (order.status !== "paid") return { queued: 0, needsReview: false };
  const { data: items, error: itemsError } = await db.from("order_items")
    .select("id,product_id,variant_id,title,variant_label,sku,qty,unit_price_cents,kind")
    .eq("order_id", orderId)
    .eq("kind", "physical");
  if (itemsError) throw itemsError;
  if (!(items ?? []).length) return { queued: 0, needsReview: false };

  const { data: mappings, error: mappingError } = await db.from("product_supplier_mappings")
    .select("id,supplier_connection_id,product_id,variant_id,external_sku,enabled,available,supplier_qty,supplier_cost_cents,supplier_currency,last_synced_at")
    .eq("enabled", true);
  if (mappingError) throw mappingError;

  const groups = new Map<string, { mapping: Mapping; items: Item[] }[]>();
  let needsReview = false;
  for (const item of (items ?? []) as Item[]) {
    const matching = (mappings ?? []).filter((m: Mapping) => m.product_id === item.product_id && m.enabled && (m.variant_id === item.variant_id || (!m.variant_id && !item.variant_id)));
    const chosen = matching.find((m) => m.available && m.supplier_qty >= item.qty && m.supplier_currency === "eur") ?? matching[0];
    if (!chosen) { needsReview = true; continue; }
    if (!chosen.available || chosen.supplier_qty < item.qty || !chosen.supplier_cost_cents || chosen.supplier_currency !== "eur") needsReview = true;
    const list = groups.get(chosen.supplier_connection_id) ?? [];
    const existing = list.find((group) => group.mapping.id === chosen.id);
    if (existing) existing.items.push(item);
    else list.push({ mapping: chosen, items: [item] });
    groups.set(chosen.supplier_connection_id, list);
  }

  const connectionIds = [...groups.keys()];
  const connections = await connectionMap(connectionIds);
  let queued = 0;
  for (const [connectionId, groupItems] of groups) {
    const connection = connections.get(connectionId);
    if (!connection || !connection.auto_order_enabled || !connection.enabled) { needsReview = true; continue; }
    for (const group of groupItems) {
      for (const item of group.items) {
        if (!isFresh(group.mapping, connection.config?.sync_interval_seconds ? Number(connection.config.sync_interval_seconds) : 900)) needsReview = true;
      }
    }
    const totalCost = groupItems.reduce((sum, group) => sum + group.items.reduce((s, item) => s + (group.mapping.supplier_cost_cents ?? 0) * item.qty, 0), 0);
    const maxOrder = Number(connection.config?.max_supplier_order_cents ?? 100000);
    if (totalCost > maxOrder) { needsReview = true; continue; }

    let { data: orderGroup } = await db.from("supplier_order_groups").select("id,status").eq("order_id", orderId).maybeSingle();
    if (!orderGroup) {
      const created = await db.from("supplier_order_groups").insert({ order_id: orderId, status: needsReview ? "needs_review" : "processing" }).select("id").single();
      if (created.error || !created.data) throw created.error ?? new Error("Unable to create supplier order group.");
      orderGroup = created.data;
    }

    const idempotencyKey = orderId + ":" + connectionId;
    const { data: supplierOrder, error: supplierOrderError } = await db.from("supplier_orders").upsert({
      order_group_id: orderGroup.id,
      supplier_connection_id: connectionId,
      order_id: orderId,
      status: needsReview ? "needs_review" : "queued",
      client_reference: String(order.order_number || orderId),
      currency: "eur",
      supplier_total_cents: totalCost,
      idempotency_key: idempotencyKey,
      next_attempt_at: needsReview ? null : new Date().toISOString(),
    }, { onConflict: "idempotency_key", ignoreDuplicates: false }).select("id").single();
    if (supplierOrderError || !supplierOrder) throw supplierOrderError ?? new Error("Unable to enqueue supplier order.");
    await db.from("supplier_order_items").delete().eq("supplier_order_id", supplierOrder.id);
    for (const group of groupItems) {
      for (const item of group.items) {
        await db.from("supplier_order_items").insert({
          supplier_order_id: supplierOrder.id,
          order_item_id: item.id,
          mapping_id: group.mapping.id,
          external_sku: group.mapping.external_sku,
          quantity: item.qty,
          supplier_unit_cost_cents: group.mapping.supplier_cost_cents ?? 0,
          currency: group.mapping.supplier_currency ?? "eur",
          status: needsReview ? "failed" : "queued",
        });
      }
    }
    if (!needsReview) queued += 1;
  }

  if (needsReview) {
    await db.from("orders").update({ needs_review: true, review_note: "La commande physique nécessite une vérification fournisseur avant l'envoi automatique." }).eq("id", orderId);
    await db.from("supplier_order_groups").update({ status: "needs_review" }).eq("order_id", orderId);
  }
  return { queued, needsReview };
}

function orderContext(order: any, supplierItems: any[]) {
  return {
    order: {
      id: order.id,
      order_number: order.order_number,
      currency: order.currency,
      amount_cents: order.amount_cents,
    },
    customer: { email: order.customer_email },
    shipping: order.shipping ?? {},
    billing: order.billing ?? {},
    items: supplierItems.map((item) => ({
      sku: item.external_sku,
      quantity: item.quantity,
      unit_cost_cents: item.supplier_unit_cost_cents,
      currency: item.currency,
      title: item.order_items?.title ?? null,
      variant_label: item.order_items?.variant_label ?? null,
    })),
  };
}

function statusClass(status: string | null): string {
  if (!status) return "submitted";
  const value = status.toLowerCase();
  if (value.includes("cancel")) return "canceled";
  if (value.includes("deliver")) return "delivered";
  if (value.includes("ship")) return "shipped";
  if (value.includes("process")) return "processing";
  if (value.includes("confirm")) return "confirmed";
  return "submitted";
}

async function dispatchOne(supplierOrderId: string) {
  const db = supabaseAdmin();
  const claim = await db.from("supplier_orders")
    .update({ status: "submitting", attempts: 1, last_attempt_at: new Date().toISOString() })
    .eq("id", supplierOrderId)
    .in("status", ["queued","failed"])
    .select("id,order_id,supplier_connection_id,client_reference,attempts");
  if (claim.error || !(claim.data ?? []).length) return { skipped: true };
  const current = claim.data[0];

  const { data: order } = await db.from("orders").select("id,order_number,status,customer_email,shipping,billing,currency,amount_cents,fulfilment").eq("id", current.order_id).maybeSingle();
  const { data: items } = await db.from("supplier_order_items").select("id,external_sku,quantity,supplier_unit_cost_cents,currency,order_items(title,variant_label)").eq("supplier_order_id", supplierOrderId);
  const connection = await loadSupplierConnection(current.supplier_connection_id);
  if (!order || order.status !== "paid" || !connection.enabled || !connection.auto_order_enabled || !items?.length) {
    await db.from("supplier_orders").update({ status: "needs_review", last_error: "Commande fournisseur non éligible à l'envoi automatique." }).eq("id", supplierOrderId);
    return { needsReview: true };
  }

  const result = await callSupplierOrder(current.supplier_connection_id, orderContext(order, items), current.id);
  const now = new Date().toISOString();
  const status = statusClass(result.external_status);
  await db.from("supplier_orders").update({
    status: result.external_order_id ? status : "unknown",
    external_order_id: result.external_order_id,
    external_status: result.external_status,
    tracking_number: result.tracking_number,
    tracking_url: result.tracking_url,
    request_payload: orderContext(order, items),
    response_payload: result.raw && typeof result.raw === "object" ? result.raw : {},
    submitted_at: now,
    last_error: result.external_order_id ? null : "Le fournisseur n'a pas retourné de référence de commande. Vérification manuelle obligatoire.",
    next_attempt_at: null,
  }).eq("id", supplierOrderId);
  await db.from("supplier_order_items").update({ status: result.external_order_id ? "submitted" : "failed", response_payload: result.raw ?? {} }).eq("supplier_order_id", supplierOrderId);

  if (result.external_order_id && (status === "submitted" || status === "confirmed" || status === "processing")) {
    await db.from("orders").update({ fulfilment: "preparing" }).eq("id", current.order_id).eq("status", "paid").in("fulfilment", ["none","to_prepare"]);
  }
  return { submitted: Boolean(result.external_order_id), externalOrderId: result.external_order_id };
}

export async function dispatchSupplierOrders(limit = 10) {
  const db = supabaseAdmin();
  const { data: queued, error } = await db.from("supplier_orders").select("id").in("status", ["queued","failed"]).or("next_attempt_at.is.null,next_attempt_at.lte." + new Date().toISOString()).order("created_at").limit(limit);
  if (error) throw error;
  const results: unknown[] = [];
  for (const row of queued ?? []) {
    try { results.push(await dispatchOne(row.id)); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Supplier order dispatch failed.";
      await db.from("supplier_orders").update({ status: "unknown", last_error: message.slice(0,1000), next_attempt_at: null }).eq("id", row.id);
      results.push({ id: row.id, error: message });
    }
  }
  return results;
}

export async function refreshSupplierOrders(limit = 10) {
  const db = supabaseAdmin();
  const { data: orders, error } = await db.from("supplier_orders").select("id,supplier_connection_id,external_order_id,order_id,tracking_number,tracking_url").in("status", ["submitted","confirmed","processing","shipped"]).not("external_order_id", "is", null).limit(limit);
  if (error) throw error;
  const results: unknown[] = [];
  for (const row of orders ?? []) {
    try {
      const status = await checkSupplierOrderStatus(row.supplier_connection_id, String(row.external_order_id), { external_order_id: row.external_order_id });
      const klass = statusClass(status.external_status);
      await db.from("supplier_orders").update({
        status: klass,
        external_status: status.external_status,
        tracking_number: status.tracking_number ?? row.tracking_number,
        tracking_url: status.tracking_url ?? row.tracking_url,
      }).eq("id", row.id);
      if (klass === "shipped" || klass === "delivered") {
        await db.from("orders").update({
          fulfilment: klass === "delivered" ? "delivered" : "shipped",
          tracking_number: status.tracking_number ?? row.tracking_number,
          tracking_url: status.tracking_url ?? row.tracking_url,
          delivered_at: klass === "delivered" ? new Date().toISOString() : undefined,
        }).eq("id", row.order_id);
      }
      results.push({ id: row.id, status: klass });
    } catch (error) {
      results.push({ id: row.id, error: error instanceof Error ? error.message : "status refresh failed" });
    }
  }
  return results;
}

export async function processSupplierAutomation() {
  const sync = await import("./sync");
  return {
    sync: await sync.syncDueSupplierConnections(5),
    dispatch: await dispatchSupplierOrders(10),
    status: await refreshSupplierOrders(10),
  };
}
