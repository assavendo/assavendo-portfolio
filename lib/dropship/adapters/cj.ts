import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptSupplierSecret, encryptSupplierSecret } from "@/lib/dropship/crypto";
import type { AdapterConnection, AdapterInventoryRecord, AdapterOrderResult, SupplierAdapter } from "./types";

type CjCredentials = {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  openId?: string;
  accessTokenExpiryDate?: string;
  refreshTokenExpiryDate?: string;
};

type CjResponse<T> = {
  code?: number;
  success?: boolean;
  message?: string;
  data?: T;
  requestId?: string;
};

type CjVariant = {
  vid?: string;
  pid?: string;
  variantSku?: string;
  variantSellPrice?: number | string;
  inventories?: Array<{ countryCode?: string; totalInventory?: number; cjInventory?: number; factoryInventory?: number }>;
};

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

function credentials(connection: AdapterConnection): CjCredentials {
  const raw = decryptSupplierSecret(connection.credentials_ciphertext);
  if (!raw) throw new Error("Les identifiants CJ ne sont pas configurés.");
  const parsed = JSON.parse(raw) as CjCredentials;
  if (!parsed.apiKey && !parsed.accessToken) throw new Error("Ajoutez au minimum la clé API CJ ou un access token CJ.");
  return parsed;
}

function validResponse<T>(response: CjResponse<T>): T {
  if (response.success === false || (typeof response.code === "number" && response.code !== 200)) {
    const detail = response.requestId ? " (requestId " + response.requestId + ")" : "";
    throw new Error("CJ " + (response.code ?? "API") + ": " + String(response.message ?? "Erreur fournisseur") + detail);
  }
  return response.data as T;
}

async function cjFetch<T>(
  connection: AdapterConnection,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  query?: Record<string, string | number | boolean | undefined>,
  accessToken?: string,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = new URL(CJ_BASE + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json", ...extraHeaders };
  if (accessToken) headers["CJ-Access-Token"] = accessToken;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    const text = await response.text();
    if (!response.ok) throw new Error("CJ HTTP " + response.status + ": " + text.slice(0, 600));
    let payload: CjResponse<T>;
    try { payload = text ? JSON.parse(text) as CjResponse<T> : {}; } catch { throw new Error("Réponse CJ non JSON."); }
    return validResponse(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function saveCredentials(connection: AdapterConnection, next: CjCredentials) {
  await supabaseAdmin().from("supplier_connections").update({
    credentials_ciphertext: encryptSupplierSecret(JSON.stringify(next)),
    secret_ciphertext: next.accessToken ? encryptSupplierSecret(next.accessToken) : null,
    webhook_secret_ciphertext: next.openId ? encryptSupplierSecret(String(next.openId)) : null,
  }).eq("id", connection.id);
}

async function ensureAccessToken(connection: AdapterConnection): Promise<{ token: string; credentials: CjCredentials }> {
  const current = credentials(connection);
  const expiresAt = current.accessTokenExpiryDate ? Date.parse(current.accessTokenExpiryDate) : 0;
  if (current.accessToken && Number.isFinite(expiresAt) && expiresAt > Date.now() + 5 * 60 * 1000) {
    return { token: current.accessToken, credentials: current };
  }

  let next: CjCredentials | null = null;
  if (current.refreshToken) {
    try {
      next = await cjFetch<CjCredentials>(
        connection,
        "/authentication/refreshAccessToken",
        "POST",
        { refreshToken: current.refreshToken },
      );
    } catch {
      next = null;
    }
  }
  if (!next?.accessToken && current.apiKey) {
    next = await cjFetch<CjCredentials>(
      connection,
      "/authentication/getAccessToken",
      "POST",
      { apiKey: current.apiKey },
    );
  }
  if (!next?.accessToken) throw new Error("Impossible d'obtenir un access token CJ.");
  const merged = { ...current, ...next };
  await saveCredentials(connection, merged);
  return { token: next.accessToken, credentials: merged };
}

function parseMoney(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function configString(connection: AdapterConnection, key: string, fallback = ""): string {
  const value = connection.config?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function fetchVariant(connection: AdapterConnection, accessToken: string, sku: string) {
  const rows = await cjFetch<CjVariant[]>(
    connection,
    "/product/variant/query",
    "GET",
    undefined,
    { variantSku: sku },
    accessToken,
  );
  const variant = Array.isArray(rows)
    ? rows.find((row) => String(row.variantSku ?? "").toUpperCase() === sku.toUpperCase()) ?? rows[0]
    : null;
  if (!variant?.vid) throw new Error("SKU CJ introuvable: " + sku);
  return variant;
}

async function testConnection(connection: AdapterConnection) {
  const { token } = await ensureAccessToken(connection);
  const data = await cjFetch<{ amount?: number }>(
    connection,
    "/shopping/pay/getBalance",
    "GET",
    undefined,
    undefined,
    token,
  );
  const balance = Number(data?.amount);
  return {
    ok: true as const,
    detail: Number.isFinite(balance) ? "CJ connecté · solde " + balance.toFixed(2) + " USD" : "CJ connecté.",
  };
}

async function fetchInventory(connection: AdapterConnection, externalSkus: string[]): Promise<AdapterInventoryRecord[]> {
  const { token } = await ensureAccessToken(connection);
  const uniqueSkus = [...new Set(externalSkus.map((sku) => sku.trim()).filter(Boolean))].slice(0, 100);
  const rawRows: AdapterInventoryRecord[] = [];

  for (const sku of uniqueSkus) {
    const variant = await fetchVariant(connection, token, sku);
    const detailed = await cjFetch<CjVariant>(
      connection,
      "/product/variant/queryByVid",
      "GET",
      undefined,
      { vid: variant.vid, features: "enable_inventory" },
      token,
    );
    const resolved = detailed?.vid ? detailed : variant;
    const sourcePrice = parseMoney(resolved.variantSellPrice);
    const inventories = Array.isArray(resolved.inventories) ? resolved.inventories : [];
    const qty = inventories.reduce(
      (sum, inventory) => sum + Math.max(0, Number(inventory.totalInventory ?? 0)),
      0,
    );
    rawRows.push({
      external_sku: String(resolved.variantSku ?? sku),
      external_product_id: String(resolved.vid),
      supplier_qty: qty,
      supplier_price_cents: sourcePrice,
      supplier_currency: "USD",
      available: qty > 0,
      raw: { variant: resolved, sku, inventories },
    });
  }

  return rawRows;
}

function buildOrderPayload(connection: AdapterConnection, orderContext: Record<string, unknown>) {
  const shipping = (orderContext.shipping ?? {}) as Record<string, unknown>;
  const items = Array.isArray(orderContext.items) ? orderContext.items as Record<string, unknown>[] : [];
  if (!items.length) throw new Error("Aucun article CJ à commander.");

  const fromCountryCode = configString(connection, "cj_from_country_code", "CN").toUpperCase();
  const logisticName = configString(connection, "cj_logistic_name");
  const shopLogisticsType = Number(connection.config?.cj_shop_logistics_type ?? 3);
  const payType = Number(connection.config?.cj_pay_type ?? 2);
  const platform = configString(connection, "cj_platform", "Api");
  const country = destinationCountry(orderContext);

  if (!country) throw new Error("Pays de livraison manquant pour CJ.");
  if (!logisticName) throw new Error("Configurez cj_logistic_name avant l'automatisation CJ.");
  if (![1, 2, 3].includes(shopLogisticsType)) throw new Error("cj_shop_logistics_type doit être 1, 2 ou 3.");

  return {
    orderNumber: String((orderContext.order as Record<string, unknown> | undefined)?.order_number ?? (orderContext.order as Record<string, unknown> | undefined)?.id),
    shippingZip: String(shipping.postal_code ?? shipping.postalCode ?? ""),
    shippingCountry: String(shipping.country ?? country),
    shippingCountryCode: country,
    shippingProvince: String(shipping.state ?? shipping.province ?? ""),
    shippingCity: String(shipping.city ?? ""),
    shippingCounty: String(shipping.county ?? ""),
    shippingPhone: String(shipping.phone ?? ""),
    shippingCustomerName: String(shipping.name ?? shipping.full_name ?? ""),
    shippingAddress: String(shipping.line1 ?? shipping.address1 ?? shipping.address ?? ""),
    shippingAddress2: String(shipping.line2 ?? shipping.address2 ?? ""),
    email: String((orderContext.customer as Record<string, unknown> | undefined)?.email ?? ""),
    remark: String((orderContext.order as Record<string, unknown> | undefined)?.order_number ?? ""),
    payType,
    isSandbox: connection.sandbox_enabled ? 1 : 0,
    logisticName,
    fromCountryCode,
    platform,
    shopLogisticsType,
    storeName: configString(connection, "cj_store_name") || undefined,
    storeOrderTime: Math.floor(Date.now() / 1000),
    orderFlow: 1,
    products: items.map((item) => ({
      vid: String(item.external_product_id ?? ""),
      sku: item.sku ? String(item.sku) : undefined,
      quantity: Number(item.quantity ?? 0),
      storeLineItemId: String(item.store_line_item_id ?? item.id ?? ""),
    })),
  };
}

async function submitOrder(
  connection: AdapterConnection,
  orderContext: Record<string, unknown>,
  idempotencyKey: string,
): Promise<AdapterOrderResult> {
  void idempotencyKey;
  const { token } = await ensureAccessToken(connection);
  const payload = buildOrderPayload(connection, orderContext);
  const referer = configString(connection, "cj_referer");
  const data = await cjFetch<Record<string, unknown>>(
    connection,
    "/shopping/order/createOrderV3",
    "POST",
    payload,
    undefined,
    token,
    referer ? { Referer: referer } : undefined,
  );

  const orderId = String(data.orderId ?? "");
  const orderNumber = String(data.orderNumber ?? "");
  return {
    external_order_id: orderId || orderNumber || null,
    external_status: String(data.orderStatus ?? "CREATED"),
    tracking_number: null,
    tracking_url: null,
    raw: data,
  };
}

async function getOrderStatus(
  connection: AdapterConnection,
  externalOrderId: string,
  _context: Record<string, unknown>,
): Promise<AdapterOrderResult> {
  const { token } = await ensureAccessToken(connection);
  const data = await cjFetch<Record<string, unknown>>(
    connection,
    "/shopping/order/getOrderDetail",
    "GET",
    undefined,
    { orderId: externalOrderId },
    token,
  );
  return {
    external_order_id: externalOrderId,
    external_status: String(data.orderStatus ?? "CREATED"),
    tracking_number: data.trackNumber ? String(data.trackNumber) : null,
    tracking_url: data.trackingUrl ? String(data.trackingUrl) : null,
    raw: data,
  };
}

export const cjAdapter: SupplierAdapter = {
  key: "cj",
  testConnection,
  fetchInventory,
  submitOrder,
  getOrderStatus,
};
