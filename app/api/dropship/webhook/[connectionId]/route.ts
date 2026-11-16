import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptSupplierSecret, verifySupplierWebhook } from "@/lib/dropship/crypto";
import { getByPath } from "@/lib/dropship/connector";
import { syncSupplierConnection } from "@/lib/dropship/sync";
import { refreshSupplierOrders } from "@/lib/dropship/orders";

export const runtime = "nodejs";

function statusFromExternal(value: string | null): string {
  const status = (value ?? "").toLowerCase();
  if (status.includes("cancel")) return "canceled";
  if (status.includes("deliver")) return "delivered";
  if (status.includes("ship")) return "shipped";
  if (status.includes("process")) return "processing";
  if (status.includes("confirm")) return "confirmed";
  return "submitted";
}

export async function POST(req: Request, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;
  const db = supabaseAdmin();
  const raw = await req.text();
  const { data: connection, error } = await db.from("supplier_connections")
    .select("id,enabled,webhook_enabled,webhook_secret_ciphertext,config,order_status_path,order_tracking_number_path,order_tracking_url_path")
    .eq("id", connectionId).maybeSingle();

  if (error || !connection || !connection.enabled || !connection.webhook_enabled) return NextResponse.json({ error: "Webhook disabled" }, { status: 404 });
  const secret = decryptSupplierSecret(connection.webhook_secret_ciphertext);
  const signature = req.headers.get("x-supplier-signature") ?? req.headers.get("x-webhook-signature") ?? "";
  if (!secret || !signature || !verifySupplierWebhook(raw, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const eventId = req.headers.get("x-event-id") ?? String(getByPath(payload, "id") ?? getByPath(payload, "event_id") ?? "");
  const eventType = req.headers.get("x-event-type") ?? String(getByPath(payload, "type") ?? getByPath(payload, "event_type") ?? "unknown");
  const stableId = eventId || Buffer.from(raw).toString("base64url").slice(0, 120);

  const { data: existing } = await db.from("supplier_webhook_events").select("id,status").eq("supplier_connection_id", connectionId).eq("event_id", stableId).maybeSingle();
  if (existing) return NextResponse.json({ received: true, duplicate: true });

  const { data: eventRow, error: insertError } = await db.from("supplier_webhook_events").insert({
    supplier_connection_id: connectionId, event_id: stableId, event_type: eventType, signature_valid: true,
    payload: payload && typeof payload === "object" ? payload : {}, status: "received",
  }).select("id").single();
  if (insertError || !eventRow) return NextResponse.json({ error: "Event could not be recorded" }, { status: 500 });

  try {
    if (/inventory|stock|product|price/i.test(eventType)) {
      await syncSupplierConnection(connectionId, "webhook");
    } else if (/order|shipment|fulfilment|fulfillment/i.test(eventType)) {
      const externalId = String(getByPath(payload, String(connection.config?.order_external_id_path ?? "order.id")) ?? getByPath(payload, "order_id") ?? "");
      if (externalId) {
        const { data: supplierOrder } = await db.from("supplier_orders").select("id,order_id").eq("supplier_connection_id", connectionId).eq("external_order_id", externalId).maybeSingle();
        if (supplierOrder) {
          const externalStatus = String(getByPath(payload, String(connection.config?.order_response_status_path ?? "status")) ?? "submitted");
          const trackingNumber = String(getByPath(payload, String(connection.config?.order_response_tracking_number_path ?? "tracking_number")) ?? "");
          const trackingUrl = String(getByPath(payload, String(connection.config?.order_response_tracking_url_path ?? "tracking_url")) ?? "");
          const klass = statusFromExternal(externalStatus);
          await db.from("supplier_orders").update({
            status: klass, external_status: externalStatus,
            tracking_number: trackingNumber || null, tracking_url: trackingUrl || null,
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
    await db.from("supplier_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", eventRow.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await db.from("supplier_webhook_events").update({ status: "failed", error: message.slice(0, 1000), processed_at: new Date().toISOString() }).eq("id", eventRow.id);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
