import { supabaseAdmin } from "@/lib/supabase/server";
import { getByPath, renderTemplate } from "./template";
export { getByPath } from "./template";

import { decryptSupplierSecret } from "./crypto";
import { getSupplierAdapter } from "./adapters";
import type { AdapterConnection } from "./adapters/types";

type Connection = {
  id: string;
  name: string;
  base_url: string | null;
  enabled: boolean;
  auto_order_enabled: boolean;
  fulfillment_mode: "manual" | "auto";
  webhook_enabled: boolean;
  sync_interval_seconds: number;
  inventory_method: "GET" | "POST";
  inventory_path: string | null;
  inventory_response_path: string | null;
  inventory_sku_path: string | null;
  inventory_qty_path: string | null;
  inventory_price_path: string | null;
  inventory_currency_path: string | null;
  inventory_available_path: string | null;
  order_method: "POST" | "PUT";
  order_path: string | null;
  order_response_id_path: string | null;
  order_status_path: string | null;
  order_tracking_number_path: string | null;
  order_tracking_url_path: string | null;
  order_payload_template: unknown;
  auth_header: string;
  auth_prefix: string;
  secret_ciphertext: string | null;
  webhook_secret_ciphertext: string | null;
  config: Record<string, unknown>;
  status: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  provider_key: string | null;
  integration_mode: string | null;
  adapter: string;
  credentials_ciphertext: string | null;
  sandbox_enabled: boolean;
};

export type SupplierInventoryRecord = {
  external_sku: string;
  external_product_id?: string | null;
  external_variant_id?: string | null;
  supplier_qty: number | null;
  supplier_price_cents: number | null;
  supplier_currency: string | null;
  available: boolean | null;
  raw: unknown;
};

const CONNECTION_SELECT = "id,name,base_url,enabled,auto_order_enabled,fulfillment_mode,webhook_enabled,sync_interval_seconds,provider_key,integration_mode,adapter,credentials_ciphertext,sandbox_enabled,inventory_method,inventory_path,inventory_response_path,inventory_sku_path,inventory_qty_path,inventory_price_path,inventory_currency_path,inventory_available_path,order_method,order_path,order_response_id_path,order_status_path,order_tracking_number_path,order_tracking_url_path,order_payload_template,auth_header,auth_prefix,secret_ciphertext,webhook_secret_ciphertext,config,status,last_sync_at,last_success_at";


function stringValue(value: unknown, max = 500): string | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const out = String(value).trim();
    return out ? out.slice(0, max) : null;
  }
  return null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(1_000_000_000, Math.trunc(value)));
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? Math.max(0, Math.min(1_000_000_000, Math.trunc(n))) : null;
  }
  return null;
}

function priceCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(10_000_000_00, Math.round(value * 100)));
  if (typeof value === "string" && value.trim() !== "") {
    const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.max(0, Math.min(10_000_000_00, Math.round(n * 100))) : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    if (/^(true|1|yes|available|in_stock|instock)$/i.test(value.trim())) return true;
    if (/^(false|0|no|unavailable|out_of_stock|outofstock)$/i.test(value.trim())) return false;
  }
  return null;
}

function safeEndpoint(baseUrl: string, path: string, params?: Record<string, unknown>): URL {
  const base = new URL(baseUrl);
  if (!path.startsWith("/") || path.startsWith("//") || /:\/\//.test(path)) throw new Error("Supplier endpoint path must be relative to the configured HTTPS base URL.");
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("Supplier endpoint changed origin.");
  if (params) for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  return url;
}

async function getConnection(id: string): Promise<Connection> {
  const { data, error } = await supabaseAdmin().from("supplier_connections").select(CONNECTION_SELECT).eq("id", id).maybeSingle();
  if (error || !data) throw new Error(error?.message || "Supplier connection not found.");
  return data as Connection;
}

async function requestJson(connection: Connection, url: URL, method: "GET" | "POST" | "PUT", body: unknown, idempotencyKey?: string): Promise<unknown> {
  const secret = decryptSupplierSecret(connection.secret_ciphertext);
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  if (secret) headers[connection.auth_header] = connection.auth_prefix ? connection.auth_prefix + " " + secret : secret;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supplier HTTP ${response.status}: ${text.slice(0, 600)}`);
    try { return text ? JSON.parse(text) : {}; } catch { throw new Error("Supplier response was not valid JSON."); }
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadSupplierConnection(id: string): Promise<Connection> {
  return getConnection(id);
}

export async function fetchInventory(connectionId: string, context: Record<string, unknown> = {}, externalSkus: string[] = []): Promise<{ connection: Connection; records: SupplierInventoryRecord[] }> {
  const connection = await getConnection(connectionId);
  if (!connection.enabled) throw new Error("Supplier connection is disabled.");
  const adapter = getSupplierAdapter(connection.adapter);
  if (adapter) {
    const adapterConnection: AdapterConnection = {
      ...(connection as AdapterConnection),
      config: {
        ...connection.config,
        ...(Array.isArray((context as Record<string, unknown>).mapping_hints)
          ? { __supplier_inventory_hints: (context as Record<string, unknown>).mapping_hints }
          : {}),
      },
    };
    const records = await adapter.fetchInventory(adapterConnection, externalSkus);
    return { connection, records };
  }
  if (connection.integration_mode && connection.integration_mode !== "generic_rest") {
    throw new Error(`Le fournisseur ${connection.name} utilise le profil ${connection.integration_mode}. Son adaptateur natif/partenaire doit être activé avant la synchronisation REST.`);
  }
  if (!connection.base_url || !connection.inventory_path || !connection.inventory_response_path || !connection.inventory_sku_path || !connection.inventory_qty_path) {
    throw new Error("Configuration REST fournisseur incomplète.");
  }
  const query = (connection.config.inventory_query && typeof connection.config.inventory_query === "object")
    ? renderTemplate(connection.config.inventory_query, context) as Record<string, unknown>
    : undefined;
  const body = connection.config.inventory_body_template
    ? renderTemplate(connection.config.inventory_body_template, context)
    : {};
  const url = safeEndpoint(connection.base_url, connection.inventory_path, query);
  const payload = await requestJson(connection, url, connection.inventory_method, body);
  const { inventory_response_path, inventory_sku_path, inventory_qty_path, inventory_price_path, inventory_currency_path, inventory_available_path } = connection;
  if (!inventory_response_path || !inventory_sku_path || !inventory_qty_path) throw new Error("Configuration REST fournisseur incomplète.");
  const items = getByPath(payload, inventory_response_path);
  if (!Array.isArray(items)) throw new Error("Supplier inventory response path did not resolve to an array.");
  const records = items.slice(0, 5000).map((raw) => ({
    external_sku: stringValue(getByPath(raw, inventory_sku_path), 160) ?? "",
    supplier_qty: integerValue(getByPath(raw, inventory_qty_path)),
    supplier_price_cents: inventory_price_path ? priceCents(getByPath(raw, inventory_price_path)) : null,
    supplier_currency: inventory_currency_path ? stringValue(getByPath(raw, inventory_currency_path), 8)?.toLowerCase() ?? null : null,
    available: inventory_available_path ? booleanValue(getByPath(raw, inventory_available_path)) : null,
    raw,
  })).filter((record) => record.external_sku.length > 0);
  return { connection, records };
}

export async function quoteSupplierShipping(connectionId: string, context: import("./adapters/types").AdapterShippingContext): Promise<import("./adapters/types").AdapterShippingOption[]> {
  const connection = await getConnection(connectionId);
  if (!connection.enabled) throw new Error("Supplier connection is disabled.");
  const adapter = getSupplierAdapter(connection.adapter);
  if (!adapter?.getShippingOptions) throw new Error("Ce fournisseur ne fournit pas de calcul logistique dynamique.");
  return adapter.getShippingOptions(connection as AdapterConnection, context);
}

export async function callSupplierOrder(connectionId: string, orderContext: Record<string, unknown>, idempotencyKey: string): Promise<{
  external_order_id: string | null;
  external_status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  raw: unknown;
}> {
  const connection = await getConnection(connectionId);
  if (!connection.enabled || connection.fulfillment_mode !== "auto" || !connection.auto_order_enabled) throw new Error("Supplier auto-order is disabled or this connection is in manual mode.");
  const adapter = getSupplierAdapter(connection.adapter);
  if (adapter) return adapter.submitOrder(connection as AdapterConnection, orderContext, idempotencyKey);
  if (connection.integration_mode && connection.integration_mode !== "generic_rest") {
    throw new Error("Le fournisseur " + connection.name + " utilise le profil " + connection.integration_mode + " sans adaptateur actif.");
  }
  if (!connection.base_url || !connection.order_path) throw new Error("Configuration REST de commande fournisseur incomplète.");
  const payload = renderTemplate(connection.order_payload_template, orderContext);
  const url = safeEndpoint(connection.base_url, String(renderTemplate(connection.order_path, orderContext)));
  const raw = await requestJson(connection, url, connection.order_method, payload, idempotencyKey);
  return {
    external_order_id: connection.order_response_id_path ? stringValue(getByPath(raw, connection.order_response_id_path), 180) : null,
    external_status: connection.order_status_path ? stringValue(getByPath(raw, connection.order_status_path), 120) : null,
    tracking_number: connection.order_tracking_number_path ? stringValue(getByPath(raw, connection.order_tracking_number_path), 120) : null,
    tracking_url: connection.order_tracking_url_path ? stringValue(getByPath(raw, connection.order_tracking_url_path), 600) : null,
    raw,
  };
}

export async function checkSupplierOrderStatus(connectionId: string, externalOrderId: string, context: Record<string, unknown>): Promise<{
  external_status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  raw: unknown;
}> {
  const connection = await getConnection(connectionId);
  const adapter = getSupplierAdapter(connection.adapter);
  if (adapter) return adapter.getOrderStatus(connection as AdapterConnection, externalOrderId, context);
  const baseUrl = connection.base_url;
  if (!baseUrl) throw new Error("Configuration REST fournisseur incomplète.");
  const endpointTemplate = typeof connection.config?.order_status_endpoint_template === "string" ? connection.config.order_status_endpoint_template : null;
  if (!endpointTemplate) throw new Error("Supplier status endpoint is not configured.");
  const path = String(renderTemplate(endpointTemplate, { ...context, external_order_id: externalOrderId }));
  const url = safeEndpoint(baseUrl, path);
  const raw = await requestJson(connection, url, "GET", {});
  return {
    external_status: connection.order_status_path ? stringValue(getByPath(raw, connection.order_status_path) ?? getByPath(raw, "status"), 120) : stringValue(getByPath(raw, "status"), 120),
    tracking_number: connection.order_tracking_number_path ? stringValue(getByPath(raw, connection.order_tracking_number_path), 120) : null,
    tracking_url: connection.order_tracking_url_path ? stringValue(getByPath(raw, connection.order_tracking_url_path), 600) : null,
    raw,
  };
}
