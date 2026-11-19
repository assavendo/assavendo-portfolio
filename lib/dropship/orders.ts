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
  external_product_id: string | null;
  external_variant_id: string | null;
  enabled: boolean;
  available: boolean;
  supplier_qty: number;
  supplier_cost_cents: number | null;
  supplier_currency: string | null;
  last_synced_at: string | null;
  priority: number;
  destination_countries: string[];
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
  const { data: order, error: orderError } = await db.from("orders").select("id,order_number,created_at,status,customer_email,shipping,billing,currency,amount_cents,subtotal_cents,fulfilment").eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error(orderError?.message || "Commande introuvable.");
  if (order.status !== "paid") return { queued: 0, needsReview: false };
  const { data: items, error: itemsError } = await db.from("order_items")
    .select("id,product_id,variant_id,title,variant_label,sku,qty,unit_price_cents,kind")
    .eq("order_id", orderId)
    .eq("kind", "physical");
  if (itemsError) throw itemsError;
  if (!(items ?? []).length) return { queued: 0, needsReview: false };

  const { data: mappings, error: mappingError } = await db.from("product_supplier_mappings")
    .select("id,supplier_connection_id,product_id,variant_id,external_sku,external_product_id,external_variant_id,enabled,available,supplier_qty,supplier_cost_cents,supplier_currency,last_synced_at,priority,destination_countries")
    .eq("enabled", true);
  if (mappingError) throw mappingError;

  const allConnectionIds = [...new Set((mappings ?? []).map((m: Mapping) => m.supplier_connection_id))];
  const connections = await connectionMap(allConnectionIds);
  const country = String((order.shipping as any)?.countryCode ?? (order.shipping as any)?.country ?? "").trim().toUpperCase();
  const supportsCountry = (mapping: Mapping) => !mapping.destination_countries?.length || !country || mapping.destination_countries.includes(country);

  const groups = new Map<string, { mapping: Mapping; items: Item[] }[]>();
  let needsReview = false;
  for (const item of (items ?? []) as Item[]) {
    const matching = (mappings ?? []).filter((m: Mapping) => {
      if (m.product_id !== item.product_id || !m.enabled) return false;
      if (!(m.variant_id === item.variant_id || (!m.variant_id && !item.variant_id))) return false;
      const connection = connections.get(m.supplier_connection_id);
      return Boolean(connection?.enabled && supportsCountry(m));
    });
    const ranked = [...matching].sort((a, b) => {
      const aReady = a.available && a.supplier_qty >= item.qty && Boolean(a.supplier_cost_cents) && a.supplier_currency === "eur";
      const bReady = b.available && b.supplier_qty >= item.qty && Boolean(b.supplier_cost_cents) && b.supplier_currency === "eur";
      if (aReady !== bReady) return aReady ? -1 : 1;
      const aFresh = isFresh(a, Number(connections.get(a.supplier_connection_id)?.sync_interval_seconds ?? 900));
      const bFresh = isFresh(b, Number(connections.get(b.supplier_connection_id)?.sync_interval_seconds ?? 900));
      if (aFresh !== bFresh) return aFresh ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.supplier_cost_cents ?? Number.MAX_SAFE_INTEGER) - (b.supplier_cost_cents ?? Number.MAX_SAFE_INTEGER);
    });
    const chosen = ranked[0];
    if (!chosen) { needsReview = true; continue; }
    if (!chosen.available || chosen.supplier_qty < item.qty || !chosen.supplier_cost_cents || chosen.supplier_currency !== "eur" || !isFresh(chosen, Number(connections.get(chosen.supplier_connection_id)?.sync_interval_seconds ?? 900))) needsReview = true;
    const list = groups.get(chosen.supplier_connection_id) ?? [];
    const existing = list.find((group) => group.mapping.id === chosen.id);
    if (existing) existing.items.push(item);
    else list.push({ mapping: chosen, items: [item] });
    groups.set(chosen.supplier_connection_id, list);
  }

  let queued = 0;
  for (const [connectionId, groupItems] of groups) {
    const connection = connections.get(connectionId);
    if (!connection || !connection.enabled) { needsReview = true; continue; }
    const automaticMode = connection.auto_order_enabled === true;
    for (const group of groupItems) {
      if (!isFresh(group.mapping, Number(connection.sync_interval_seconds ?? 900))) needsReview = true;
    }
    const totalCost = groupItems.reduce((sum, group) => sum + group.items.reduce((s, item) => s + (group.mapping.supplier_cost_cents ?? 0) * item.qty, 0), 0);
    const maxOrder = Number(connection.config?.max_supplier_order_cents ?? 100000);
    if (totalCost > maxOrder) { needsReview = true; continue; }

    let orderGroupId: string | null = null;
    const { data: existingOrderGroup } = await db.from("supplier_order_groups")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();
    if (existingOrderGroup?.id) {
      orderGroupId = String(existingOrderGroup.id);
      if (needsReview) {
        await db.from("supplier_order_groups").update({ status: "needs_review" }).eq("id", orderGroupId);
      }
    } else {
      const created = await db.from("supplier_order_groups")
        .insert({ order_id: orderId, status: needsReview ? "needs_review" : (automaticMode ? "processing" : "pending") })
        .select("id")
        .single();
      if (created.error || !created.data) throw created.error ?? new Error("Unable to create supplier order group.");
      orderGroupId = String(created.data.id);
    }
    if (!orderGroupId) throw new Error("Supplier order group id missing.");

    const idempotencyKey = orderId + ":" + connectionId;
    const { data: existingSupplierOrder } = await db.from("supplier_orders")
      .select("id,status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingSupplierOrder) {
      // Idempotence forte : un deuxième appel de paiement/webhook ne réécrit jamais
      // une commande déjà soumise, confirmée ou mise en revue.
      continue;
    }

    if (totalCost > Number(order.subtotal_cents ?? order.amount_cents ?? 0)) {
      needsReview = true;
      continue;
    }

    const { data: supplierOrder, error: supplierOrderError } = await db.from("supplier_orders").insert({
      order_group_id: orderGroupId,
      supplier_connection_id: connectionId,
      order_id: orderId,
      status: needsReview ? "needs_review" : (automaticMode ? "queued" : "manual_pending"),
      fulfillment_mode: automaticMode ? "automatic" : "manual",
      client_reference: String(order.order_number || orderId),
      currency: "eur",
      supplier_total_cents: totalCost,
      idempotency_key: idempotencyKey,
      next_attempt_at: needsReview || !automaticMode ? null : new Date().toISOString(),
    }).select("id").single();
    if (supplierOrderError || !supplierOrder) throw supplierOrderError ?? new Error("Unable to enqueue supplier order.");
    await db.from("supplier_order_items").delete().eq("supplier_order_id", supplierOrder.id);
    for (const group of groupItems) {
      for (const item of group.items) {
        await db.from("supplier_order_items").insert({
          supplier_order_id: supplierOrder.id,
          order_item_id: item.id,
          mapping_id: group.mapping.id,
          external_sku: group.mapping.external_sku,
          external_product_id: group.mapping.external_product_id,
          external_variant_id: group.mapping.external_variant_id,
          quantity: item.qty,
          supplier_unit_cost_cents: group.mapping.supplier_cost_cents ?? 0,
          currency: group.mapping.supplier_currency ?? "eur",
          status: needsReview ? "failed" : "queued",
        });
      }
    }
    if (!needsReview && automaticMode) queued += 1;
  }

  if (needsReview) {
    await db.from("orders").update({ needs_review: true, review_note: "La commande physique nécessite une vérification fournisseur avant l'envoi automatique." }).eq("id", orderId);
    await db.from("supplier_order_groups").update({ status: "needs_review" }).eq("order_id", orderId);
  }
  return { queued, manualPending: [...groups.keys()].filter((id) => connections.get(id)?.auto_order_enabled === false).length, needsReview };
}

function orderContext(order: any, supplierItems: any[]) {
  return {
    order: {
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      currency: order.currency,
      amount_cents: order.amount_cents,
    },
    customer: { email: order.customer_email },
    shipping: order.shipping ?? {},
    billing: order.billing ?? {},
    items: supplierItems.map((item) => ({
      sku: item.external_sku,
      external_product_id: item.external_product_id ?? null,
      external_variant_id: item.external_variant_id ?? null,
      store_line_item_id: item.id,
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
  const { data: currentRow } = await db.from("supplier_orders").select("attempts").eq("id", supplierOrderId).maybeSingle();
  const nextAttempt = Number(currentRow?.attempts ?? 0) + 1;
  const claim = await db.from("supplier_orders")
    .update({ status: "submitting", attempts: nextAttempt, last_attempt_at: new Date().toISOString() })
    .eq("id", supplierOrderId)
    .in("status", ["queued","failed"])
    .select("id,order_id,supplier_connection_id,client_reference,attempts,fulfillment_mode");
  if (claim.error || !(claim.data ?? []).length) return { skipped: true };
  const current = claim.data[0];

  const { data: order } = await db.from("orders").select("id,order_number,created_at,status,customer_email,shipping,billing,currency,amount_cents,fulfilment").eq("id", current.order_id).maybeSingle();
  const { data: items } = await db.from("supplier_order_items").select("id,external_sku,external_product_id,external_variant_id,quantity,supplier_unit_cost_cents,currency,order_items(title,variant_label)").eq("supplier_order_id", supplierOrderId);
  const connection = await loadSupplierConnection(current.supplier_connection_id);
  if (!order || order.status !== "paid" || current.fulfillment_mode !== "automatic" || !connection.enabled || !connection.auto_order_enabled || !items?.length) {
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
    await db.from("supplier_order_groups").update({ status: "processing" }).eq("order_id", current.order_id);
  } else if (!result.external_order_id) {
    await db.from("supplier_order_groups").update({ status: "needs_review" }).eq("order_id", current.order_id);
    await db.from("orders").update({
      needs_review: true,
      review_note: "Le fournisseur n'a pas confirmé la création de la commande. Vérification manuelle obligatoire.",
    }).eq("id", current.order_id);
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
      const { data: failedOrder } = await db.from("supplier_orders").select("order_id").eq("id", row.id).maybeSingle();
      await db.from("supplier_orders").update({ status: "unknown", last_error: message.slice(0,1000), next_attempt_at: null }).eq("id", row.id);
      if (failedOrder?.order_id) {
        await db.from("orders").update({
          needs_review: true,
          review_note: "L'envoi automatique au fournisseur a échoué. Aucune nouvelle tentative automatique ne sera effectuée sans revue.",
        }).eq("id", failedOrder.order_id);
      }
      results.push({ id: row.id, error: message });
    }
  }
  return results;
}

export async function refreshSupplierOrders(limit = 10) {
  const db = supabaseAdmin();
  const { data: orders, error } = await db.from("supplier_orders").select("id,supplier_connection_id,external_order_id,order_id,tracking_number,tracking_url").in("status", ["submitted","confirmed","processing","shipped"]).eq("fulfillment_mode", "automatic").not("external_order_id", "is", null).limit(limit);
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
      if (klass === "delivered") await db.from("supplier_order_groups").update({ status: "complete" }).eq("order_id", row.order_id);
      else if (klass === "shipped") await db.from("supplier_order_groups").update({ status: "processing" }).eq("order_id", row.order_id);
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
