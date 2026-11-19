import { randomUUID } from "node:crypto";
import { decryptSupplierSecret, encryptSupplierSecret } from "../crypto.ts";
import type { AdapterConnection, AdapterInventoryRecord, AdapterOrderResult, AdapterShippingContext, AdapterShippingOption, ShippingRuleRequirement, SupplierAdapter } from "./types";

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
  result?: boolean;
  success?: boolean;
  message?: string;
  data?: T;
  requestId?: string;
};

type CjInventoryArea = {
  areaEn?: string;
  areaId?: number | string;
  countryCode?: string;
  totalInventoryNum?: number;
  cjInventoryNum?: number;
  factoryInventoryNum?: number;
  stock?: Array<{ stockId?: string; inventory?: number; factoryInventory?: number }> | null;
};

type CjVariant = {
  vid?: string;
  pid?: string;
  variantSku?: string;
  variantSellPrice?: number | string;
};

type CjProductInventory = {
  variantInventories?: Array<{
    vid?: string;
    inventory?: Array<{
      countryCode?: string;
      totalInventory?: number;
      cjInventory?: number;
      factoryInventory?: number;
    }> | null;
  }>;
};

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const CJ_RATE_INTERVAL_MS = 1200;
const CJ_MAX_RATE_RETRIES = 3;
function isCjTestMode(): boolean {
  return process.env.NODE_ENV === "test" || process.env.SUPPLIER_CREDENTIAL_KEY === "test-only-supplier-key";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireCjRateSlot(connectionId: string): Promise<void> {
  if (isCjTestMode()) return;
  const db = (await import("../../supabase/server.ts")).supabaseAdmin();
  const jobKey = "cj-rate:" + connectionId;

  while (true) {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + CJ_RATE_INTERVAL_MS).toISOString();
    const lockedBy = randomUUID();

    const { data: refreshed, error: refreshError } = await db.from("supplier_job_locks")
      .update({ locked_until: lockedUntil, locked_by: lockedBy })
      .eq("job_key", jobKey)
      .lte("locked_until", now.toISOString())
      .select("job_key")
      .maybeSingle();
    if (refreshError) throw new Error("Impossible de réserver la cadence CJ : " + refreshError.message);
    if (refreshed) return;

    const { error: insertError } = await db.from("supplier_job_locks").insert({
      job_key: jobKey,
      locked_until: lockedUntil,
      locked_by: lockedBy,
    });
    if (!insertError) return;
    if (insertError.code !== "23505") throw new Error("Impossible de réserver la cadence CJ : " + insertError.message);

    await sleep(100);
  }
}

function credentials(connection: AdapterConnection): CjCredentials {
  const raw = decryptSupplierSecret(connection.credentials_ciphertext);
  if (!raw) throw new Error("Les identifiants CJ ne sont pas configurés.");
  const parsed = JSON.parse(raw) as CjCredentials;
  if (!parsed.apiKey && !parsed.accessToken) throw new Error("Ajoutez au minimum la clé API CJ ou un access token CJ.");
  return parsed;
}

function validResponse<T>(response: CjResponse<T>): T {
  if (response.success === false || response.result === false || (typeof response.code === "number" && response.code !== 200)) {
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

  for (let attempt = 0; attempt <= CJ_MAX_RATE_RETRIES; attempt += 1) {
    await acquireCjRateSlot(connection.id);
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

      if (response.status === 429) {
        if (attempt < CJ_MAX_RATE_RETRIES) continue;
        throw new Error("CJ HTTP 429: " + text.slice(0, 900));
      }
      if (!response.ok) throw new Error("CJ HTTP " + response.status + ": " + text.slice(0, 600));

      let payload: CjResponse<T>;
      try { payload = text ? JSON.parse(text) as CjResponse<T> : {}; } catch { throw new Error("Réponse CJ non JSON."); }
      return validResponse(payload);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("CJ rate limit atteint après plusieurs tentatives.");
}

async function saveCredentials(connection: AdapterConnection, next: CjCredentials) {
  const { supabaseAdmin } = await import("../../supabase/server.ts");
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

function destinationCountry(orderContext: Record<string, unknown>): string {
  const shipping = (orderContext.shipping ?? {}) as Record<string, unknown>;
  return String(shipping.countryCode ?? shipping.country ?? "").trim().toUpperCase();
}

type CjProductQuery = {
  pid?: string;
  productSku?: string;
  variantSku?: string;
  vid?: string;
  variantNameEn?: string;
  variantImage?: string;
  variantSellPrice?: number | string;
  variants?: CjVariant[];
};

async function fetchVariant(connection: AdapterConnection, accessToken: string, sku: string): Promise<CjVariant> {
  // Product Details is the most reliable SKU lookup in CJ API 2.0. It accepts a
  // variantSku directly and returns the matching variant fields plus the parent PID.
  const data = await cjFetch<CjProductQuery>(
    connection,
    "/product/query",
    "GET",
    undefined,
    { variantSku: sku },
    accessToken,
  );

  const candidates = Array.isArray(data?.variants) ? data.variants : [];
  const candidate = candidates.find(
    (row) => String(row.variantSku ?? "").trim().toUpperCase() === sku.trim().toUpperCase(),
  );

  const direct: CjVariant | null =
    data?.vid || data?.variantSku
      ? {
          vid: data.vid,
          pid: data.pid,
          variantSku: data.variantSku,
          variantSellPrice: data.variantSellPrice,
        }
      : null;

  const variant = candidate ?? direct;
  if (!variant?.vid) throw new Error("SKU CJ introuvable: " + sku);

  return {
    ...variant,
    pid: variant.pid ?? data.pid,
    variantSku: variant.variantSku ?? sku,
  };
}

async function fetchInventoryByProductId(
  connection: AdapterConnection,
  accessToken: string,
  pid: string,
): Promise<Map<string, { qty: number; raw: unknown }>> {
  const variants = await cjFetch<CjVariant[]>(
    connection,
    "/product/variant/query",
    "GET",
    undefined,
    { pid },
    accessToken,
  );
  const inventory = await cjFetch<CjProductInventory>(
    connection,
    "/product/stock/getInventoryByPid",
    "GET",
    undefined,
    { pid },
    accessToken,
  );

  const quantityByVid = new Map(
    (inventory?.variantInventories ?? []).map((row) => [
      String(row.vid ?? ""),
      {
        qty: (Array.isArray(row.inventory) ? row.inventory : []).reduce(
          (sum, area) => sum + Math.max(0, Number(area.totalInventory ?? 0)),
          0,
        ),
        raw: row.inventory ?? [],
      },
    ] as const),
  );
  const result = new Map<string, { qty: number; raw: unknown }>();

  for (const variant of Array.isArray(variants) ? variants : []) {
    const sku = String(variant.variantSku ?? "").trim().toUpperCase();
    if (!sku) continue;
    const byVid = quantityByVid.get(String(variant.vid ?? ""));
    result.set(sku, {
      qty: byVid?.qty ?? 0,
      raw: {
        variant,
        inventories: byVid?.raw ?? [],
      },
    });
  }

  return result;
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

async function getBalanceUsd(connection: AdapterConnection): Promise<number> {
  const { token } = await ensureAccessToken(connection);
  const data = await cjFetch<{ amount?: number }>(connection, "/shopping/pay/getBalance", "GET", undefined, undefined, token);
  const balance = Number(data?.amount);
  if (!Number.isFinite(balance) || balance < 0) throw new Error("Le solde CJ retourné est invalide.");
  return balance;
}

async function fetchInventory(connection: AdapterConnection, externalSkus: string[]): Promise<AdapterInventoryRecord[]> {
  const { token } = await ensureAccessToken(connection);
  const uniqueSkus = [...new Set(externalSkus.map((sku) => sku.trim()).filter(Boolean))].slice(0, 100);
  const hints = Array.isArray(connection.config?.__supplier_inventory_hints)
    ? connection.config.__supplier_inventory_hints as Array<{ external_sku?: string; external_product_id?: string | null }>
    : [];

  const pidBySku = new Map(
    hints
      .map((hint) => [String(hint.external_sku ?? "").trim().toUpperCase(), String(hint.external_product_id ?? "").trim()] as const)
      .filter(([sku, pid]) => Boolean(sku && pid)),
  );
  const unresolved = new Set(uniqueSkus.map((sku) => sku.toUpperCase()));
  const records: AdapterInventoryRecord[] = [];

  const groupedByPid = new Map<string, string[]>();
  for (const sku of uniqueSkus) {
    const pid = pidBySku.get(sku.toUpperCase());
    if (!pid) continue;
    const list = groupedByPid.get(pid) ?? [];
    list.push(sku);
    groupedByPid.set(pid, list);
  }

  for (const [pid, skus] of groupedByPid) {
    try {
      const bySku = await fetchInventoryByProductId(connection, token, pid);
      for (const sku of skus) {
        const normalizedSku = sku.toUpperCase();
        const match = bySku.get(normalizedSku);
        if (!match) continue;

        const variant = bySku.get(normalizedSku)?.raw && typeof bySku.get(normalizedSku)?.raw === "object"
          ? (bySku.get(normalizedSku)?.raw as Record<string, unknown>).variant as CjVariant | undefined
          : undefined;
        if (!variant?.vid) continue;

        records.push({
          external_sku: String(variant.variantSku ?? sku),
          external_product_id: String(variant.pid ?? pid),
          external_variant_id: String(variant.vid ?? ""),
          supplier_qty: match.qty,
          supplier_price_cents: parseMoney(variant.variantSellPrice),
          supplier_currency: "USD",
          supplier_weight_g: Number(variant.variantWeight) > 0 ? Number(variant.variantWeight) : null,
      supplier_volume_cm3: Number(variant.variantVolume) > 0 ? Number(variant.variantVolume) / 1000 : null,
          supplier_volume_cm3: Number(variant.variantVolume) > 0 ? Number(variant.variantVolume) / 1000 : null,
          available: match.qty > 0,
          raw: { variant, inventories: match.raw, pid, batched: true },
        });
        unresolved.delete(normalizedSku);
      }
    } catch {
      // A stale/invalid PID must not break the whole sync. Unresolved SKUs use the
      // deterministic SKU fallback below, still protected by the global CJ rate gate.
    }
  }

  for (const sku of uniqueSkus) {
    const normalizedSku = sku.toUpperCase();
    if (!unresolved.has(normalizedSku)) continue;

    const variant = await fetchVariant(connection, token, sku);
    const inventories = await cjFetch<CjInventoryArea[]>(
      connection,
      "/product/stock/queryBySku",
      "GET",
      undefined,
      { sku },
      token,
    );
    const qty = (Array.isArray(inventories) ? inventories : []).reduce(
      (sum, inventory) => sum + Math.max(0, Number(inventory.totalInventoryNum ?? 0)),
      0,
    );
    records.push({
      external_sku: String(variant.variantSku ?? sku),
      external_product_id: String(variant.pid ?? ""),
      external_variant_id: String(variant.vid ?? ""),
      supplier_qty: qty,
      supplier_price_cents: parseMoney(variant.variantSellPrice),
      supplier_currency: "USD",
      supplier_weight_g: Number(variant.variantWeight) > 0 ? Number(variant.variantWeight) : null,
      available: qty > 0,
      raw: { variant, sku, inventories, batched: false },
    });
  }

  return records;
}

function buildOrderPayload(connection: AdapterConnection, orderContext: Record<string, unknown>) {
  const shipping = (orderContext.shipping ?? {}) as Record<string, unknown>;
  const items = Array.isArray(orderContext.items) ? orderContext.items as Record<string, unknown>[] : [];
  if (!items.length) throw new Error("Aucun article CJ à commander.");

  const fromCountryCode = configString(connection, "cj_from_country_code", "CN").toUpperCase();
  const shippingQuote = orderContext.shipping_quote && typeof orderContext.shipping_quote === "object"
    ? orderContext.shipping_quote as Record<string, unknown>
    : {};
  const providerOption = shippingQuote.providerOption && typeof shippingQuote.providerOption === "object"
    ? shippingQuote.providerOption as Record<string, unknown>
    : {};
  const logisticName = String(providerOption.logisticsName ?? configString(connection, "cj_logistic_name")).trim();
  const shopLogisticsType = Number(connection.config?.cj_shop_logistics_type ?? 2);
  const payType = Number(connection.config?.cj_pay_type ?? 2);
  const order = orderContext.order && typeof orderContext.order === "object" ? orderContext.order as Record<string, unknown> : {};
  const goodsValueCents = Number(order.subtotal_cents ?? order.amount_cents ?? 0);
  const configuredIossType = Number(connection.config?.cj_ioss_type ?? 3);
  const iossType = goodsValueCents > 15000 ? 1 : configuredIossType;
  const iossNumber = iossType === 1 ? "" : configString(connection, "cj_ioss_number", iossType === 3 ? "CJ-IOSS" : "");
  const platform = configString(connection, "cj_platform", "Api");
  const country = destinationCountry(orderContext);

  if (!country) throw new Error("Pays de livraison manquant pour CJ.");
  if (!logisticName) throw new Error("Configurez cj_logistic_name avant l'automatisation CJ.");
  if (![1, 2, 3].includes(shopLogisticsType)) throw new Error("cj_shop_logistics_type doit être 1, 2 ou 3.");
  if (![1, 2, 3].includes(iossType)) throw new Error("cj_ioss_type doit être 1, 2 ou 3.");
  if ((iossType === 2 || iossType === 3) && !iossNumber) throw new Error("Configurez cj_ioss_number pour ce mode IOSS.");

  return {
    orderNumber: String(order.order_number ?? order.id ?? ""),
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
    remark: String(order.order_number ?? ""),
    payType,
    iossType,
    ...(iossType === 1 ? {} : { iossNumber }),
    isSandbox: connection.sandbox_enabled ? 1 : 0,
    logisticName,
    fromCountryCode,
    platform,
    shopLogisticsType,
    storeName: configString(connection, "cj_store_name") || undefined,
    storeOrderTime: (() => {
      const createdAt = String(order.created_at ?? "");
      const timestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
      return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
    })(),
    orderFlow: 1,
    products: items.map((item) => {
      const variantId = String(item.external_variant_id ?? "").trim();
      const sku = String(item.sku ?? "").trim();
      if (!variantId) {
        throw new Error("VID CJ manquant pour le SKU " + (sku || "inconnu") + ". Synchronisez le mapping fournisseur avant toute commande.");
      }
      return {
        vid: variantId,
        ...(sku ? { sku } : {}),
        quantity: Number(item.quantity ?? 0),
        storeLineItemId: String(item.store_line_item_id ?? item.id ?? ""),
      };
    }),
  };
}

type CjOrderSummary = {
  orderId?: string;
  cjOrderId?: string;
  orderNum?: string;
  orderNumber?: string;
  orderStatus?: string;
  trackNumber?: string;
  trackingNumber?: string;
  trackingUrl?: string;
};

async function findRecentOrderByNumber(
  connection: AdapterConnection,
  accessToken: string,
  orderNumber: string,
  createdAt?: string,
): Promise<CjOrderSummary | null> {
  const trimmed = orderNumber.trim();
  if (!trimmed) return null;

  const anchor = createdAt ? Date.parse(createdAt) : Date.now();
  const safeAnchor = Number.isFinite(anchor) ? anchor : Date.now();
  const from = safeAnchor - 48 * 60 * 60 * 1000;
  const to = Math.max(Date.now(), safeAnchor) + 48 * 60 * 60 * 1000;

  const data = await cjFetch<
    | CjOrderSummary[]
    | { list?: CjOrderSummary[]; records?: CjOrderSummary[]; data?: CjOrderSummary[] }
  >(
    connection,
    "/shopping/order/list",
    "GET",
    undefined,
    {
      pageNum: 1,
      pageSize: 100,
      createDateFrom: from,
      createDateTo: to,
    },
    accessToken,
  );

  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.list)
      ? data.list
      : Array.isArray(data?.records)
        ? data.records
        : Array.isArray(data?.data)
          ? data.data
          : [];

  return rows.find((row) => {
    const candidate = String(row.orderNum ?? row.orderNumber ?? "").trim();
    return candidate === trimmed;
  }) ?? null;
}

function toAdapterOrderResult(order: CjOrderSummary, fallbackId?: string): AdapterOrderResult {
  const externalId = String(order.orderId ?? order.cjOrderId ?? order.orderNum ?? order.orderNumber ?? fallbackId ?? "");
  return {
    external_order_id: externalId || null,
    external_status: String(order.orderStatus ?? "CREATED"),
    tracking_number: String(order.trackNumber ?? order.trackingNumber ?? "") || null,
    tracking_url: String(order.trackingUrl ?? "") || null,
    raw: order,
  };
}


function parseArrival(value: unknown): { min: number | null; max: number | null } {
  const raw = String(value ?? "").trim();
  const m = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const one = raw.match(/\d+/);
  return one ? { min: Number(one[0]), max: Number(one[0]) } : { min: null, max: null };
}

function neutralShippingLabel(logisticsName: string, minDays: number | null, maxDays: number | null): string {
  const n = logisticsName.toLowerCase();
  const tier = /express|fast|speed/i.test(n) ? "Express" : /postal|ordinary|economic|economy|packet/i.test(n) ? "Économique" : "Standard";
  const eta = minDays !== null && maxDays !== null ? ` · ${minDays}–${maxDays} jours` : "";
  return tier + eta;
}

async function getShippingOptions(connection: AdapterConnection, context: AdapterShippingContext): Promise<AdapterShippingOption[]> {
  const { token } = await ensureAccessToken(connection);
  if (!context.destinationCountry || !context.sourceCountry) throw new Error("Pays d'origine et de destination requis pour le calcul logistique.");
  if (!Number.isFinite(context.weightG) || context.weightG <= 0) throw new Error("Poids produit invalide pour le calcul logistique.");
  if (!context.skuLines.length || context.skuLines.some((line) => !line.sku || line.quantity < 1)) throw new Error("Références fournisseur invalides pour le calcul logistique.");

  const shipping = context.shipping ?? {};
  const request = {
    reqDTOS: [{
      srcAreaCode: context.sourceCountry.toUpperCase(),
      destAreaCode: context.destinationCountry.toUpperCase(),
      weight: Math.max(1, Math.round(context.weightG)),
      volume: Math.max(0.001, Number(context.volumeCm3)),
      wrapWeight: Math.max(0, Math.round(context.wrapWeightG)),
      totalGoodsAmount: Math.max(0.01, Number(context.totalGoodsAmountEur)),
      productProp: context.productProperties.length ? context.productProperties : ["COMMON"],
      skuList: context.skuLines.map((line) => line.sku),
      freightTrialSkuList: context.skuLines.map((line) => ({
        skuQuantity: Math.max(1, Math.trunc(line.quantity)),
        sku: line.sku,
        ...(line.variantId ? { vid: line.variantId } : {}),
        ...(line.weightG ? { skuWeight: Math.max(1, Math.round(line.weightG)) },
        ...(line.volumeCm3 ? { skuVolume: Math.max(0.001, Number(line.volumeCm3)) } : {}) : {}),
      })),
      shippingMode: Number(connection.config?.cj_shop_logistics_type ?? 2),
      ...(typeof shipping.postal_code === "string" && shipping.postal_code ? { zip: shipping.postal_code } : {}),
      ...(typeof shipping.phone === "string" && shipping.phone ? { phone: shipping.phone } : {}),
      ...(typeof shipping.line1 === "string" && shipping.line1 ? { recipientAddress: shipping.line1 } : {}),
      ...(typeof shipping.city === "string" && shipping.city ? { city: shipping.city } : {}),
      ...(typeof shipping.name === "string" && shipping.name ? { recipientName: shipping.name } : {}),
      ...(typeof shipping.state === "string" && shipping.state ? { province: shipping.state } : {}),
      ...(typeof shipping.email === "string" && shipping.email ? { email: shipping.email } : {}),
      ...(
        context.totalGoodsAmountEur <= 150 &&
        configString(connection, "cj_ioss_number", "CJ-IOSS")
          ? { iossNumber: configString(connection, "cj_ioss_number", "CJ-IOSS") }
          : {}
      ),
    }],
  };

  const data = await cjFetch<unknown>(connection, "/logistic/freightCalculateTip", "POST", request, undefined, token);
  const rows = Array.isArray(data) ? data : [];
  const options: AdapterShippingOption[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const option = r.option && typeof r.option === "object" ? r.option as Record<string, unknown> : {};
    const channel = r.channel && typeof r.channel === "object" ? r.channel as Record<string, unknown> : {};
    const logisticsName = String(r.logisticsName ?? option.enName ?? channel.enName ?? "").trim();
    if (!logisticsName) continue;
    if (String(r.error ?? "").trim() || String(r.errorEn ?? "").trim()) continue;
    const arrival = parseArrival(r.arrivalTime ?? r.logisticAging ?? option.arrivalTime);
    const requirementRows = Array.isArray(r.allRuleTips)
      ? r.allRuleTips
      : (Array.isArray(r.ruleTips) ? r.ruleTips : []);
    const requirements: ShippingRuleRequirement[] = requirementRows
      .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
      .map((x) => ({
        type: String(x.type ?? "").trim(),
        message: typeof x.msgEn === "string" ? x.msgEn : (typeof x.msg === "string" ? x.msg : null),
        expression: typeof x.expression === "string" ? x.expression : null,
        interceptType: typeof x.interceptType === "string" ? x.interceptType : null,
      }))
      .filter((x) => x.type);

    const hasIossRequirement = requirements.some((x) => x.type === "iossNumber");
    if (context.totalGoodsAmountEur > 150 && hasIossRequirement) continue;
    if (context.totalGoodsAmountEur <= 150 && hasIossRequirement && !configString(connection, "cj_ioss_number", "CJ-IOSS")) continue;

    const postage = Number(r.postage);
    const taxes = Number(r.taxesFee);
    const clearance = Number(r.clearanceOperationFee);
    const tariff = Number(r.tariff);
    const total = Number(r.totalPostageFee);
    const fallbackTotal = [postage, taxes, clearance, tariff].every(Number.isFinite)
      ? postage + taxes + clearance + tariff
      : Number(r.wrapPostage);
    const totalUsd = Number.isFinite(total) && total > 0
      ? total
      : (Number.isFinite(fallbackTotal) && fallbackTotal > 0 ? fallbackTotal : postage);
    if (!Number.isFinite(totalUsd) || totalUsd <= 0) continue;

    options.push({
      code: String(r.optionId ?? option.id ?? logisticsName),
      logisticsName,
      label: neutralShippingLabel(logisticsName, arrival.min, arrival.max),
      channelId: r.channelId ? String(r.channelId) : (channel.id ? String(channel.id) : null),
      optionId: r.optionId ? String(r.optionId) : (option.id ? String(option.id) : null),
      priceUsd: Number.isFinite(postage) ? postage : totalUsd,
      taxesUsd: Number.isFinite(taxes) ? taxes : 0,
      clearanceUsd: Number.isFinite(clearance) ? clearance : 0,
      tariffUsd: Number.isFinite(tariff) ? tariff : 0,
      totalUsd,
      minDays: arrival.min,
      maxDays: arrival.max,
      requirements,
      raw: row,
    });
  }

  return options.sort((a, b) => a.totalUsd - b.totalUsd || (a.minDays ?? 999) - (b.minDays ?? 999));
}

async function submitOrder(
  connection: AdapterConnection,
  orderContext: Record<string, unknown>,
  idempotencyKey: string,
): Promise<AdapterOrderResult> {
  void idempotencyKey;
  const { token } = await ensureAccessToken(connection);
  const payload = buildOrderPayload(connection, orderContext);
  const orderNumber = String(payload.orderNumber ?? "").trim();
  if (!orderNumber) throw new Error("orderNumber CJ manquant.");

  const referer = configString(connection, "cj_referer");
  try {
    const data = await cjFetch<Record<string, unknown>>(
      connection,
      "/shopping/order/createOrderV2",
      "POST",
      payload,
      undefined,
      token,
      referer ? { Referer: referer } : undefined,
    );

    const orderId = String(data.orderId ?? data.cjOrderId ?? "");
    const orderNumberResponse = String(data.orderNumber ?? data.orderNum ?? "");
    return {
      external_order_id: orderId || orderNumberResponse || orderNumber || null,
      external_status: String(data.orderStatus ?? "CREATED"),
      tracking_number: String(data.trackNumber ?? data.trackingNumber ?? "") || null,
      tracking_url: String(data.trackingUrl ?? "") || null,
      raw: data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ambiguousCreateFailure = /(HTTP 5\d\d|timeout|aborted|abort|fetch failed|network|ORDER_CODE_EXIST|order.?code.?exist)/i.test(message);
    if (!ambiguousCreateFailure) throw error;

    const order = orderContext.order && typeof orderContext.order === "object"
      ? orderContext.order as Record<string, unknown>
      : {};
    const recovered = await findRecentOrderByNumber(
      connection,
      token,
      orderNumber,
      typeof order.created_at === "string" ? order.created_at : undefined,
    );

    if (recovered) {
      return {
        ...toAdapterOrderResult(recovered, orderNumber),
        raw: { reconciliation: true, create_error: message.slice(0, 600), supplier_order: recovered },
      };
    }

    throw error;
  }
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
    tracking_number: data.trackNumber ? String(data.trackNumber) : (data.trackingNumber ? String(data.trackingNumber) : null),
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
  getShippingOptions,
  getBalanceUsd,
};
