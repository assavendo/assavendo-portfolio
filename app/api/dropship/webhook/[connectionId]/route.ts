import { createHash } from "node:crypto";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  decryptSupplierSecret,
  verifySupplierWebhook,
  verifySupplierWebhookBase64,
} from "@/lib/dropship/crypto";
import { getByPath } from "@/lib/dropship/connector";
import { syncSupplierConnection } from "@/lib/dropship/sync";
import { refreshSupplierOrders } from "@/lib/dropship/orders";

export const runtime = "nodejs";

function statusFromExternal(value: string | null): string {
  const status = (value ?? "").toLowerCase();
  if (status.includes("cancel")) return "canceled";
  if (status.includes("deliver")) return "delivered";
  if (status.includes("ship")) return "shipped";
  if (status.includes("process") || status.includes("pending")) return "processing";
  if (status.includes("confirm")) return "confirmed";
  return "submitted";
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function processWebhookEvent(
  connectionId: string,
  eventRowId: string,
  providerKey: string | null,
  eventType: string,
  payload: unknown,
) {
  const db = supabaseAdmin();
  try {
    if (providerKey === "cj_dropshipping") {
      const params = parseJsonObject(getByPath(payload, "params"));
      if (/product|stock|inventory|price/i.test(eventType)) {
        await syncSupplierConnection(connectionId, "webhook");
      } else if (/order|logistics|fulfilment|fulfillment|shipment/i.test(eventType)) {
        const externalId = String(
          params.orderId ??
          params.cjOrderId ??
          params.orderNumber ??
          params.orderCode ??
          params.cjOrderCode ??
          getByPath(payload, "orderId") ??
          getByPath(payload, "cjOrderId") ??
          "",
        );
        const externalStatus = String(params.orderStatus ?? params.status ?? getByPath(payload, "orderStatus") ?? "submitted");
        const trackingNumber = String(params.trackNumber ?? params.trackingNumber ?? params.cjTrackingNumber ?? getByPath(payload, "trackNumber") ?? getByPath(payload, "trackingNumber") ?? "");
        const trackingUrl = String(params.trackingUrl ?? getByPath(payload, "trackingUrl") ?? "");
        if (externalId) {
          const { data: supplierOrder } = await db
            .from("supplier_orders")
            .select("id,order_id,external_order_id")
            .eq("supplier_connection_id", connectionId)
            .eq("external_order_id", externalId)
            .maybeSingle();
          const orderNumberFromEvent = String(params.orderNumber ?? params.orderNum ?? getByPath(payload, "orderNumber") ?? getByPath(payload, "orderNum") ?? "");
          const resolvedSupplierOrder = supplierOrder ?? (orderNumberFromEvent
            ? (await db.from("supplier_orders")
                .select("id,order_id,external_order_id")
                .eq("supplier_connection_id", connectionId)
                .eq("client_reference", orderNumberFromEvent)
                .maybeSingle()).data
            : null);
          if (resolvedSupplierOrder) {
            const klass = statusFromExternal(externalStatus);
            await db.from("supplier_orders").update({
              external_order_id: externalId || resolvedSupplierOrder.external_order_id || null,
              status: klass,
              external_status: externalStatus,
              tracking_number: trackingNumber || null,
              tracking_url: trackingUrl || null,
              response_payload: payload && typeof payload === "object" ? payload : {},
            }).eq("id", resolvedSupplierOrder.id);
            await db.from("orders").update({
              fulfilment: klass === "delivered" ? "delivered" : klass === "shipped" ? "shipped" : "preparing",
              tracking_number: trackingNumber || null,
              tracking_url: trackingUrl || null,
              delivered_at: klass === "delivered" ? new Date().toISOString() : null,
            }).eq("id", resolvedSupplierOrder.order_id).eq("status", "paid");
          }
        } else {
          await refreshSupplierOrders(5);
        }
      }
    } else if (/inventory|stock|product|price/i.test(eventType)) {
      await syncSupplierConnection(connectionId, "webhook");
    } else if (/order|shipment|fulfilment|fulfillment/i.test(eventType)) {
      const externalId = String(getByPath(payload, "order_id") ?? getByPath(payload, "order.id") ?? "");
      if (externalId) {
        const { data: supplierOrder } = await db.from("supplier_orders").select("id,order_id").eq("supplier_connection_id", connectionId).eq("external_order_id", externalId).maybeSingle();
        if (supplierOrder) {
          const externalStatus = String(getByPath(payload, "status") ?? "submitted");
          const trackingNumber = String(getByPath(payload, "tracking_number") ?? "");
          const trackingUrl = String(getByPath(payload, "tracking_url") ?? "");
          const klass = statusFromExternal(externalStatus);
          await db.from("supplier_orders").update({
            status: klass,
            external_status: externalStatus,
            tracking_number: trackingNumber || null,
            tracking_url: trackingUrl || null,
            response_payload: payload && typeof payload === "object" ? payload : {},
          }).eq("id", supplierOrder.id);
          await db.from("orders").update({
            fulfilment: klass === "delivered" ? "delivered" : klass === "shipped" ? "shipped" : "preparing",
            tracking_number: trackingNumber || null,
            tracking_url: trackingUrl || null,
            delivered_at: klass === "delivered" ? new Date().toISOString() : null,
          }).eq("id", supplierOrder.order_id).eq("status", "paid");
        }
      } else {
        await refreshSupplierOrders(5);
      }
    }

    await db.from("supplier_webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("id", eventRowId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await db.from("supplier_webhook_events").update({
      status: "failed",
      error: message.slice(0, 1000),
      processed_at: new Date().toISOString(),
    }).eq("id", eventRowId);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;
  const db = supabaseAdmin();
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const { data: connection, error } = await db.from("supplier_connections")
    .select("id,enabled,webhook_enabled,provider_key,webhook_secret_ciphertext,credentials_ciphertext,config")
    .eq("id", connectionId)
    .maybeSingle();

  if (error || !connection || !connection.enabled || !connection.webhook_enabled) {
    return NextResponse.json({ error: "Webhook disabled" }, { status: 404 });
  }

  const signature = connection.provider_key === "cj_dropshipping"
    ? (req.headers.get("sign") ?? "")
    : (req.headers.get("x-supplier-signature") ?? req.headers.get("x-webhook-signature") ?? "");

  let valid = false;
  if (connection.provider_key === "cj_dropshipping") {
    const credentialRaw = decryptSupplierSecret(connection.credentials_ciphertext);
    let openId = "";
    try {
      const credentials = credentialRaw ? JSON.parse(credentialRaw) as Record<string, unknown> : {};
      openId = credentials.openId !== undefined && credentials.openId !== null ? String(credentials.openId) : "";
    } catch {}
    valid = Boolean(openId && signature && verifySupplierWebhookBase64(raw, signature, openId));
  } else {
    const secret = decryptSupplierSecret(connection.webhook_secret_ciphertext);
    valid = Boolean(secret && signature && verifySupplierWebhook(raw, signature, secret));
  }

  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const providerEventId = connection.provider_key === "cj_dropshipping"
    ? String(req.headers.get("x-event-id") ?? getByPath(payload, "messageId") ?? "")
    : String(req.headers.get("x-event-id") ?? getByPath(payload, "id") ?? getByPath(payload, "event_id") ?? "");
  const providerEventType = connection.provider_key === "cj_dropshipping"
    ? String(req.headers.get("x-event-type") ?? [getByPath(payload, "type"), getByPath(payload, "messageType")].filter(Boolean).join(".") ?? "unknown")
    : String(req.headers.get("x-event-type") ?? getByPath(payload, "type") ?? getByPath(payload, "event_type") ?? "unknown");
  const stableId = providerEventId || createHash("sha256").update(raw, "utf8").digest("hex");

  const { data: existing } = await db.from("supplier_webhook_events")
    .select("id,status")
    .eq("supplier_connection_id", connectionId)
    .eq("event_id", stableId)
    .maybeSingle();
  if (existing) return NextResponse.json({ received: true, duplicate: true });

  const { data: eventRow, error: insertError } = await db.from("supplier_webhook_events").insert({
    supplier_connection_id: connectionId,
    event_id: stableId,
    event_type: providerEventType,
    signature_valid: true,
    payload: payload && typeof payload === "object" ? payload : {},
    status: "received",
  }).select("id").single();

  if (insertError || !eventRow) return NextResponse.json({ error: "Event could not be recorded" }, { status: 500 });

  after(async () => {
    await processWebhookEvent(
      connectionId,
      String(eventRow.id),
      connection.provider_key,
      providerEventType,
      payload,
    );
  });

  return NextResponse.json({ received: true });
}
