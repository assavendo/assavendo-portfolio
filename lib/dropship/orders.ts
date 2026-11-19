import { supabaseAdmin } from "@/lib/supabase/server";
import { callSupplierOrder, checkSupplierOrderStatus, getSupplierBalanceUsd, loadSupplierConnection } from "./connector";
import { getRatesToEur } from "./fx";

type Item = {
  id: string; product_id: string; variant_id: string | null; title: string; variant_label: string | null;
  sku: string | null; qty: number; unit_price_cents: number; kind: string;
};

type Mapping = {
  id: string; supplier_connection_id: string; product_id: string; variant_id: string | null; external_sku: string;
  external_product_id: string | null; external_variant_id: string | null; enabled: boolean; available: boolean;
  supplier_qty: number; supplier_cost_cents: number | null; supplier_currency: string | null; last_synced_at: string | null;
  priority: number; destination_countries: string[]; logistics_properties?: string[];
};

function isFresh(mapping: Mapping, intervalSeconds: number): boolean {
  if (!mapping.last_synced_at) return false;
  const age = Date.now() - new Date(mapping.last_synced_at).getTime();
  return age <= Math.max(intervalSeconds * 3, 1800) * 1000;
}

async function connectionMap(ids: string[]) {
  if (!ids.length) return new Map<string, Awaited<ReturnType<typeof loadSupplierConnection>>>();
  const rows = await Promise.all(ids.map(async (id) => {
    try { return [id, await loadSupplierConnection(id)] as const; } catch { return null; }
  }));
  return new Map(rows.filter(Boolean) as [string, Awaited<ReturnType<typeof loadSupplierConnection>>][]);
}

function modeFor(connection: Awaited<ReturnType<typeof loadSupplierConnection>>): "manual" | "auto" {
  return connection.fulfillment_mode === "auto" && connection.auto_order_enabled ? "auto" : "manual";
}

async function markOrderNeedsReview(orderId: string, message: string) {
  const db = supabaseAdmin();
  const [order, group] = await Promise.all([
    db.from("orders").update({ needs_review: true, review_note: message }).eq("id", orderId),
    db.from("supplier_order_groups").update({ status: "needs_review" }).eq("order_id", orderId),
  ]);
  if (order.error) throw order.error;
  if (group.error) throw group.error;
}

export async function queueSupplierOrders(orderId: string) {
  const db = supabaseAdmin();
  const { data: order, error: orderError } = await db.from("orders")
    .select("id,order_number,created_at,status,customer_email,shipping,billing,currency,amount_cents,subtotal_cents,fulfilment,shipping_method_code,shipping_method_label,shipping_quote")
    .eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error(orderError?.message || "Commande introuvable.");
  if (order.status !== "paid") return { queued: 0, manual: 0, needsReview: false };

  const { data: items, error: itemsError } = await db.from("order_items")
    .select("id,product_id,variant_id,title,variant_label,sku,qty,unit_price_cents,kind")
    .eq("order_id", orderId).eq("kind", "physical");
  if (itemsError) throw itemsError;
  if (!(items ?? []).length) return { queued: 0, manual: 0, needsReview: false };

  const { data: mappings, error: mappingError } = await db.from("product_supplier_mappings")
    .select("id,supplier_connection_id,product_id,variant_id,external_sku,external_product_id,external_variant_id,enabled,available,supplier_qty,supplier_cost_cents,supplier_currency,last_synced_at,priority,destination_countries,logistics_properties")
    .eq("enabled", true);
  if (mappingError) throw mappingError;

  const connections = await connectionMap([...new Set((mappings ?? []).map((m: Mapping) => m.supplier_connection_id))]);
  const country = String((order.shipping as { country?: string; countryCode?: string } | null)?.countryCode ?? (order.shipping as { country?: string } | null)?.country ?? "").trim().toUpperCase();
  const supportsCountry = (m: Mapping) => !m.destination_countries?.length || !country || m.destination_countries.includes(country);

  const selected = new Map<string, { connectionId: string; mapping: Mapping; items: Item[]; ready: boolean }>();
  let needsReview = false;

  for (const item of (items ?? []) as Item[]) {
    const candidates = (mappings ?? []).filter((m: Mapping) =>
      m.product_id === item.product_id &&
      m.enabled &&
      (m.variant_id === item.variant_id || (!m.variant_id && !item.variant_id)) &&
      supportsCountry(m) &&
      connections.has(m.supplier_connection_id)
    );

    const ranked = candidates.sort((a, b) => {
      const ca = connections.get(a.supplier_connection_id)!;
      const cb = connections.get(b.supplier_connection_id)!;
      const aReady = a.available && a.supplier_qty >= item.qty && a.supplier_cost_cents != null &&
        String(a.supplier_currency).toLowerCase() === "eur" &&
        isFresh(a, Number(ca.sync_interval_seconds ?? 900));
      const bReady = b.available && b.supplier_qty >= item.qty && b.supplier_cost_cents != null &&
        String(b.supplier_currency).toLowerCase() === "eur" &&
        isFresh(b, Number(cb.sync_interval_seconds ?? 900));
      if (aReady !== bReady) return aReady ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.supplier_cost_cents ?? Number.MAX_SAFE_INTEGER) - (b.supplier_cost_cents ?? Number.MAX_SAFE_INTEGER);
    });

    const chosen = ranked[0];
    if (!chosen) {
      needsReview = true;
      continue;
    }

    const connection = connections.get(chosen.supplier_connection_id)!;
    const ready = Boolean(
      chosen.available &&
      chosen.supplier_qty >= item.qty &&
      chosen.supplier_cost_cents != null &&
      String(chosen.supplier_currency).toLowerCase() === "eur" &&
      isFresh(chosen, Number(connection.sync_interval_seconds ?? 900))
    );
    if (!ready) needsReview = true;

    const key = chosen.supplier_connection_id + ":" + chosen.id;
    const group = selected.get(key);
    if (group) group.items.push(item);
    else selected.set(key, {
      connectionId: chosen.supplier_connection_id,
      mapping: chosen,
      items: [item],
      ready,
    });
  }

  if (needsReview) {
    await markOrderNeedsReview(orderId, "La commande physique est bloquée : au moins une ligne fournisseur n'est pas entièrement routable, disponible et fraîche. Aucun fournisseur ne sera sollicité partiellement.");
    return { queued: 0, manual: 0, needsReview: true };
  }

  for (const [, group] of selected) {
    const connection = connections.get(group.connectionId);
    if (!connection) {
      await markOrderNeedsReview(orderId, "Connexion fournisseur introuvable avant création de la commande fournisseur.");
      return { queued: 0, manual: 0, needsReview: true };
    }
    const subtotalSupplierCost = group.items.reduce((sum, item) => sum + Number(group.mapping.supplier_cost_cents ?? 0) * item.qty, 0);
    const maxOrder = Number(connection.config?.max_supplier_order_cents ?? 100000);
    if (subtotalSupplierCost > maxOrder) {
      await markOrderNeedsReview(orderId, "Le plafond de commande fournisseur est dépassé; aucune commande fournisseur partielle ne sera créée.");
      return { queued: 0, manual: 0, needsReview: true };
    }
  }

  let queued = 0;
  let manual = 0;
  for (const [, group] of selected) {
    const connectionId = group.connectionId;
    const connection = connections.get(connectionId);
    if (!connection) { needsReview = true; continue; }
    const fulfillmentMode = modeFor(connection);
    const subtotalSupplierCost = group.items.reduce((sum, item) => sum + Number(group.mapping.supplier_cost_cents ?? 0) * item.qty, 0);
    const maxOrder = Number(connection.config?.max_supplier_order_cents ?? 100000);
    const groupReady = group.ready && subtotalSupplierCost <= maxOrder;

    const { data: existingGroup, error: groupReadError } = await db.from("supplier_order_groups").select("id").eq("order_id", orderId).maybeSingle();
    if (groupReadError) throw groupReadError;
    const orderGroupId = existingGroup?.id ? String(existingGroup.id) : null;
    let groupId = orderGroupId;
    if (!groupId) {
      const created = await db.from("supplier_order_groups").insert({ order_id: orderId, status: groupReady ? (fulfillmentMode === "auto" ? "processing" : "pending") : "needs_review" }).select("id").single();
      if (created.error || !created.data) throw created.error ?? new Error("Impossible de créer le groupe fournisseur.");
      groupId = String(created.data.id);
    } else if (!groupReady) {
      const { error } = await db.from("supplier_order_groups").update({ status: "needs_review" }).eq("id", groupId);
      if (error) throw error;
    }

    const idempotencyKey = orderId + ":" + connectionId;
    const { data: existingOrder, error: existingOrderError } = await db.from("supplier_orders")
      .select("id,status,fulfillment_mode").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existingOrderError) throw existingOrderError;
    if (existingOrder) continue;

    const supplierStatus = !groupReady ? "needs_review" : fulfillmentMode === "manual" ? "manual_pending" : "queued";
    const { data: supplierOrder, error: supplierOrderError } = await db.from("supplier_orders").insert({
      order_group_id: groupId,
      supplier_connection_id: connectionId,
      order_id: orderId,
      status: supplierStatus,
      fulfillment_mode: fulfillmentMode,
      logistics_name: typeof (order.shipping_quote as { providerOption?: { logisticsName?: unknown } } | null)?.providerOption?.logisticsName === "string"
        ? String((order.shipping_quote as { providerOption?: { logisticsName?: unknown } }).providerOption?.logisticsName) : null,
      client_reference: String(order.order_number || orderId),
      currency: "eur",
      supplier_total_cents: subtotalSupplierCost,
      idempotency_key: idempotencyKey,
      next_attempt_at: fulfillmentMode === "auto" && groupReady ? new Date().toISOString() : null,
    }).select("id").single();
    if (supplierOrderError || !supplierOrder) throw supplierOrderError ?? new Error("Impossible de créer la commande fournisseur.");

    const { error: deleteItemError } = await db.from("supplier_order_items").delete().eq("supplier_order_id", supplierOrder.id);
    if (deleteItemError) throw deleteItemError;
    const itemStatus = groupReady ? "queued" : "failed";
    for (const item of group.items) {
      const { error } = await db.from("supplier_order_items").insert({
        supplier_order_id: supplierOrder.id, order_item_id: item.id, mapping_id: group.mapping.id,
        external_sku: group.mapping.external_sku, external_product_id: group.mapping.external_product_id,
        external_variant_id: group.mapping.external_variant_id, quantity: item.qty,
        supplier_unit_cost_cents: Number(group.mapping.supplier_cost_cents ?? 0),
        currency: String(group.mapping.supplier_currency ?? "eur").toLowerCase(), status: itemStatus,
      });
      if (error) throw error;
    }
    if (groupReady) {
      if (fulfillmentMode === "auto") queued += 1; else manual += 1;
    } else needsReview = true;
  }

  if (needsReview) await markOrderNeedsReview(orderId, "La commande physique nécessite une vérification du routage, du stock ou de la configuration fournisseur.");
  else {
    const { error } = await db.from("orders").update({ needs_review: false, review_note: null, fulfilment: "to_prepare" }).eq("id", orderId).eq("status", "paid");
    if (error) throw error;
  }
  return { queued, manual, needsReview };
}

function orderContext(order: Record<string, unknown>, supplierItems: Array<Record<string, unknown>>) {
  return {
    order: {
      id: order.id, order_number: order.order_number, created_at: order.created_at, currency: order.currency,
      amount_cents: order.amount_cents, subtotal_cents: order.subtotal_cents,
      shipping_method_code: order.shipping_method_code ?? null,
    },
    customer: { email: order.customer_email },
    shipping: order.shipping ?? {}, billing: order.billing ?? {},
    shipping_quote: order.shipping_quote ?? null,
    items: supplierItems.map((item) => ({
      sku: item.external_sku, external_product_id: item.external_product_id ?? null, external_variant_id: item.external_variant_id ?? null,
      store_line_item_id: item.id, quantity: item.quantity, unit_cost_cents: item.supplier_unit_cost_cents, currency: item.currency,
      title: item.order_items && typeof item.order_items === "object" ? (item.order_items as Record<string, unknown>).title ?? null : null,
      variant_label: item.order_items && typeof item.order_items === "object" ? (item.order_items as Record<string, unknown>).variant_label ?? null : null,
    })),
  };
}

function statusClass(status: string | null): string {
  const value = String(status ?? "").toLowerCase();
  if (value.includes("cancel")) return "canceled";
  if (value.includes("deliver")) return "delivered";
  if (value.includes("ship")) return "shipped";
  if (value.includes("process")) return "processing";
  if (value.includes("confirm")) return "confirmed";
  if (value.includes("unknown")) return "unknown";
  return "submitted";
}

async function dispatchOne(supplierOrderId: string) {
  const db = supabaseAdmin();
  const { data: row, error: readError } = await db.from("supplier_orders").select("id,order_id,supplier_connection_id,attempts,fulfillment_mode,supplier_total_cents").eq("id", supplierOrderId).maybeSingle();
  if (readError || !row) return { skipped: true };
  if (row.fulfillment_mode !== "auto") return { skipped: true, manual: true };

  const claim = await db.from("supplier_orders").update({
    status: "submitting", attempts: Number(row.attempts ?? 0) + 1, last_attempt_at: new Date().toISOString(),
  }).eq("id", supplierOrderId).eq("fulfillment_mode","auto").in("status",["queued","failed"])
    .select("id,order_id,supplier_connection_id,attempts,fulfillment_mode,supplier_total_cents").maybeSingle();
  if (claim.error || !claim.data) return { skipped: true };
  const current = claim.data;

  const { data: order, error: orderError } = await db.from("orders")
    .select("id,order_number,created_at,status,customer_email,shipping,billing,currency,amount_cents,subtotal_cents,fulfilment,shipping_method_code,shipping_method_label,shipping_quote")
    .eq("id", current.order_id).maybeSingle();
  const { data: items, error: itemError } = await db.from("supplier_order_items")
    .select("id,mapping_id,external_sku,external_product_id,external_variant_id,quantity,supplier_unit_cost_cents,currency,order_items(title,variant_label)")
    .eq("supplier_order_id", supplierOrderId);
  if (orderError || itemError || !order || !items?.length) throw new Error(orderError?.message ?? itemError?.message ?? "Commande fournisseur incomplète.");

  const connection = await loadSupplierConnection(current.supplier_connection_id);
  if (!connection.enabled || modeFor(connection) !== "auto") {
    await db.from("supplier_orders").update({ status: "needs_review", last_error: "La connexion fournisseur n'est plus en mode automatique." }).eq("id", supplierOrderId);
    throw new Error("Mode automatique désactivé.");
  }

  const quote = order.shipping_quote && typeof order.shipping_quote === "object" ? order.shipping_quote as Record<string, unknown> : {};
  const providerOption = quote.providerOption && typeof quote.providerOption === "object" ? quote.providerOption as Record<string, unknown> : {};
  const quotedAt = typeof quote.quotedAt === "string" ? Date.parse(quote.quotedAt) : 0;
  const logisticsName = String(providerOption.logisticsName ?? "").trim();
  if (!order.shipping_method_code || !logisticsName || !quotedAt || Date.now() - quotedAt > 30 * 60 * 1000) {
    await markOrderNeedsReview(current.order_id, "Le devis logistique sélectionné est absent ou expiré avant l'envoi fournisseur.");
    await db.from("supplier_orders").update({ status: "needs_review", last_error: "Devis logistique absent ou expiré." }).eq("id", supplierOrderId);
    return { needsReview: true };
  }

  const mappingIds = [...new Set(items.map((item: any) => String(item.mapping_id)).filter(Boolean))];
  const { data: liveMappings, error: liveMappingError } = await db.from("product_supplier_mappings")
    .select("id,available,supplier_qty,last_synced_at,supplier_cost_cents,supplier_currency")
    .in("id", mappingIds);
  if (liveMappingError || !liveMappings?.length) throw new Error("Impossible de revalider le stock fournisseur.");
  for (const mapping of liveMappings) {
    const item = items.find((x: any) => String(x.mapping_id) === String(mapping.id));
    const connectionInterval = Number(connection.sync_interval_seconds ?? 900);
    if (!mapping.available || Number(mapping.supplier_qty ?? 0) < Number(item?.quantity ?? 0) || !mapping.last_synced_at || Date.now() - new Date(mapping.last_synced_at).getTime() > Math.max(connectionInterval * 3,1800) * 1000) {
      const msg = "Le stock fournisseur ou sa fraîcheur ne permet plus l'envoi automatique.";
      await markOrderNeedsReview(current.order_id, msg);
      await db.from("supplier_orders").update({ status: "needs_review", last_error: msg }).eq("id", supplierOrderId);
      return { needsReview: true };
    }
  }

  const payType = Number(connection.config?.cj_pay_type ?? 2);
  if (String(connection.provider_key ?? "").toLowerCase() === "cj_dropshipping" && payType !== 2) {
    const msg = "Le paiement automatique CJ doit utiliser le solde fournisseur (payType=2).";
    await markOrderNeedsReview(current.order_id, msg);
    await db.from("supplier_orders").update({ status: "needs_review", last_error: msg }).eq("id", supplierOrderId);
    return { needsReview: true };
  }
  if (payType === 2) {
    const balance = await getSupplierBalanceUsd(current.supplier_connection_id);
    const rates = await getRatesToEur(["USD"]);
    const quoteUsd = Number(providerOption.totalUsd);
    const productUsd = Number(current.supplier_total_cents ?? 0) / 100 * rates.USD.rate;
    const requiredUsd = productUsd + (Number.isFinite(quoteUsd) ? quoteUsd : 0);
    if (balance === null || balance + 0.01 < requiredUsd) {
      const msg = "Solde fournisseur insuffisant pour le coût produit et le transport sélectionné.";
      await markOrderNeedsReview(current.order_id, msg);
      await db.from("supplier_orders").update({ status: "needs_review", last_error: msg }).eq("id", supplierOrderId);
      return { needsReview: true, balanceUsd: balance, requiredUsd };
    }
  }

  const context = orderContext(order as Record<string, unknown>, items as Array<Record<string, unknown>>);
  const result = await callSupplierOrder(current.supplier_connection_id, context, current.id);
  const now = new Date().toISOString();
  const status = statusClass(result.external_status);
  const { error: supplierUpdateError } = await db.from("supplier_orders").update({
    status: result.external_order_id ? status : "unknown",
    external_order_id: result.external_order_id, external_status: result.external_status,
    tracking_number: result.tracking_number, tracking_url: result.tracking_url,
    request_payload: context, response_payload: result.raw && typeof result.raw === "object" ? result.raw : {},
    submitted_at: now, last_error: result.external_order_id ? null : "Le fournisseur n'a pas confirmé la création de la commande.",
    next_attempt_at: null,
  }).eq("id", supplierOrderId);
  if (supplierUpdateError) throw supplierUpdateError;

  const { error: itemUpdateError } = await db.from("supplier_order_items")
    .update({ status: result.external_order_id ? "submitted" : "failed", response_payload: result.raw ?? {} }).eq("supplier_order_id", supplierOrderId);
  if (itemUpdateError) throw itemUpdateError;

  if (result.external_order_id && ["submitted","confirmed","processing"].includes(status)) {
    const { error: orderUpdateError } = await db.from("orders").update({ fulfilment: "preparing" }).eq("id", current.order_id).eq("status","paid").in("fulfilment",["none","to_prepare"]);
    if (orderUpdateError) throw orderUpdateError;
    const { error: groupUpdateError } = await db.from("supplier_order_groups").update({ status: "processing" }).eq("order_id", current.order_id);
    if (groupUpdateError) throw groupUpdateError;
  } else if (!result.external_order_id) {
    await markOrderNeedsReview(current.order_id, "Le fournisseur n'a pas confirmé la création de la commande; intervention humaine obligatoire.");
  }
  return { submitted: Boolean(result.external_order_id), externalOrderId: result.external_order_id };
}

export async function dispatchSupplierOrders(limit = 10) {
  const db = supabaseAdmin();
  const { data: queued, error } = await db.from("supplier_orders")
    .select("id").eq("fulfillment_mode","auto").in("status",["queued","failed"])
    .or("next_attempt_at.is.null,next_attempt_at.lte." + new Date().toISOString()).order("created_at").limit(limit);
  if (error) throw error;
  const results: unknown[] = [];
  for (const row of queued ?? []) {
    try { results.push(await dispatchOne(String(row.id))); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Échec de l'envoi fournisseur automatique.";
      const { error: oe } = await db.from("supplier_orders").update({ status: "unknown", last_error: message.slice(0,1000), next_attempt_at: null }).eq("id", row.id).eq("fulfillment_mode","auto");
      const { data: failedOrder } = await db.from("supplier_orders").select("order_id").eq("id", row.id).maybeSingle();
      if (oe) results.push({ id: row.id, error: oe.message }); else if (failedOrder?.order_id) {
        await markOrderNeedsReview(failedOrder.order_id, "L'envoi automatique au fournisseur a échoué. Aucune nouvelle tentative automatique ne sera effectuée sans revue.");
        results.push({ id: row.id, error: message });
      } else results.push({ id: row.id, error: message });
    }
  }
  return results;
}

export async function refreshSupplierOrders(limit = 10) {
  const db = supabaseAdmin();
  const { data: orders, error } = await db.from("supplier_orders")
    .select("id,supplier_connection_id,external_order_id,order_id,tracking_number,tracking_url,fulfillment_mode")
    .eq("fulfillment_mode","auto").in("status",["submitted","confirmed","processing","shipped"]).not("external_order_id","is",null).limit(limit);
  if (error) throw error;
  const results: unknown[] = [];
  for (const row of orders ?? []) {
    try {
      const status = await checkSupplierOrderStatus(row.supplier_connection_id, String(row.external_order_id), { external_order_id: row.external_order_id });
      const klass = statusClass(status.external_status);
      const { error: supplierUpdateError } = await db.from("supplier_orders").update({
        status: klass, external_status: status.external_status, tracking_number: status.tracking_number ?? row.tracking_number, tracking_url: status.tracking_url ?? row.tracking_url,
      }).eq("id", row.id);
      if (supplierUpdateError) throw supplierUpdateError;
      if (klass === "shipped" || klass === "delivered") {
        const { error: orderUpdateError } = await db.from("orders").update({
          fulfilment: klass === "delivered" ? "delivered" : "shipped",
          tracking_number: status.tracking_number ?? row.tracking_number, tracking_url: status.tracking_url ?? row.tracking_url,
          delivered_at: klass === "delivered" ? new Date().toISOString() : undefined,
        }).eq("id", row.order_id);
        if (orderUpdateError) throw orderUpdateError;
      }
      if (klass === "delivered") {
        const { error } = await db.from("supplier_order_groups").update({ status: "complete" }).eq("order_id", row.order_id); if (error) throw error;
      } else if (klass === "shipped") {
        const { error } = await db.from("supplier_order_groups").update({ status: "processing" }).eq("order_id", row.order_id); if (error) throw error;
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
