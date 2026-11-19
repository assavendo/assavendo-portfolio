"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptSupplierSecret, encryptSupplierSecret } from "@/lib/dropship/crypto";
import { fetchInventory } from "@/lib/dropship/connector";
import { dispatchSupplierOrders } from "@/lib/dropship/orders";
import { syncSupplierConnection } from "@/lib/dropship/sync";
import { getSupplierProvider } from "@/lib/dropship/providers";
import { getSupplierAdapter } from "@/lib/dropship/adapters";
import { loadSupplierConnection } from "@/lib/dropship/connector";

const connectionSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  base_url: z.string().trim().url().refine((v) => v.startsWith("https://"), "Le fournisseur doit utiliser HTTPS.").optional().or(z.literal("")),
  inventory_method: z.enum(["GET","POST"]),
  inventory_path: z.string().trim().startsWith("/").max(300).optional().or(z.literal("")),
  inventory_response_path: z.string().trim().max(200).optional().or(z.literal("")),
  inventory_sku_path: z.string().trim().max(200).optional().or(z.literal("")),
  inventory_qty_path: z.string().trim().max(200).optional().or(z.literal("")),
  inventory_price_path: z.string().trim().max(200).optional().or(z.literal("")),
  inventory_currency_path: z.string().trim().max(200).optional().or(z.literal("")),
  inventory_available_path: z.string().trim().max(200).optional().or(z.literal("")),
  order_method: z.enum(["POST","PUT"]),
  order_path: z.string().trim().startsWith("/").max(300).optional().or(z.literal("")),
  order_response_id_path: z.string().trim().max(200).optional().or(z.literal("")),
  order_status_path: z.string().trim().max(200).optional().or(z.literal("")),
  order_tracking_number_path: z.string().trim().max(200).optional().or(z.literal("")),
  order_tracking_url_path: z.string().trim().max(300).optional().or(z.literal("")),
  order_status_endpoint_template: z.string().trim().max(300).optional().or(z.literal("")),
  order_payload_template: z.string().trim().min(2).max(12000),
  auth_header: z.string().trim().min(2).max(100).default("Authorization"),
  auth_prefix: z.string().trim().max(60).default("Bearer"),
  provider_key: z.string().trim().min(2).max(80).default("custom_rest"),
  credential_1: z.string().max(8000).optional().or(z.literal("")),
  credential_2: z.string().max(8000).optional().or(z.literal("")),
  credential_3: z.string().max(8000).optional().or(z.literal("")),
  credential_4: z.string().max(8000).optional().or(z.literal("")),
  api_secret: z.string().max(8000).optional().or(z.literal("")),
  webhook_secret: z.string().max(8000).optional().or(z.literal("")),
  sync_interval_seconds: z.coerce.number().int().min(60).max(86400),
  auto_order_enabled: z.string().optional(),
  webhook_enabled: z.string().optional(),
  max_supplier_order_eur: z.coerce.number().min(0.5).max(100000),
  sandbox_enabled: z.string().optional(),
  fulfillment_mode: z.enum(["manual","auto"]).default("manual"),
  cj_logistic_name: z.string().trim().max(180).optional().or(z.literal("")),
  cj_from_country_code: z.string().trim().length(2).optional().or(z.literal("")),
  cj_shop_logistics_type: z.coerce.number().int().min(1).max(3).optional(),
  cj_platform: z.string().trim().max(80).optional().or(z.literal("")),
  cj_store_name: z.string().trim().max(180).optional().or(z.literal("")),
  cj_pay_type: z.coerce.number().int().min(2).max(3).optional(),
  cj_ioss_type: z.coerce.number().int().min(1).max(3).optional(),
  cj_ioss_number: z.string().trim().max(120).optional().or(z.literal("")),
  auto_publish_after_sync: z.string().optional(),
  default_delivery_min_days: z.coerce.number().int().min(0).max(365).optional(),
  default_delivery_max_days: z.coerce.number().int().min(0).max(365).optional(),
  cj_referer: z.string().trim().max(500).optional().or(z.literal("")),
});

const mappingSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  supplier_connection_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().or(z.literal("")),
  external_sku: z.string().trim().min(1).max(160),
  auto_reprice: z.string().optional(),
  reprice_mode: z.enum(["cost_only","cost_plus_margin","cost_plus_markup","supplier_price"]),
  margin_percent: z.coerce.number().min(0).max(90),
  markup_eur: z.coerce.number().min(0).max(100000),
  min_retail_eur: z.coerce.number().min(0.5).max(100000),
  max_retail_eur: z.preprocess((v) => v === "" || v === null || v === undefined ? undefined : Number(v), z.number().min(0.5).max(100000).optional()),
  priority: z.coerce.number().int().min(1).max(10000).default(100),
  destination_countries: z.string().optional().or(z.literal("")),
});

function done(message: string): never {
  revalidatePath("/admin/dropshipping");
  redirect("/admin/dropshipping?ok=" + encodeURIComponent(message));
}

function parseTemplate(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Le template JSON doit être un objet.");
  return parsed;
}

export async function saveSupplierConnection(form: FormData) {
  const { user } = await requireAdmin();
  const parsed = connectionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Configuration fournisseur invalide.");
  let template: unknown;
  try { template = parseTemplate(parsed.data.order_payload_template); } catch (error) { throw new Error(error instanceof Error ? error.message : "Template JSON invalide."); }

  const db = supabaseAdmin();
  const provider = getSupplierProvider(parsed.data.provider_key);
  const requiresRestMapping = provider.integrationMode === "generic_rest";
  if (requiresRestMapping) {
    if (!parsed.data.base_url) throw new Error("Une connexion REST personnalisée exige une Base API HTTPS.");
    if (!parsed.data.inventory_path || !parsed.data.inventory_response_path || !parsed.data.inventory_sku_path || !parsed.data.inventory_qty_path || !parsed.data.order_path) throw new Error("Complétez les endpoints REST d’inventaire et de commande pour le connecteur personnalisé.");
  }
  const isCj = provider.key === "cj_dropshipping";
  let existingCjCredentials: Record<string, unknown> = {};
  let existingCjConfig: Record<string, unknown> = {};
  if (isCj && parsed.data.id) {
    const { data: existingConnection, error: existingError } = await db
      .from("supplier_connections")
      .select("credentials_ciphertext,config")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (existingError) throw new Error("Impossible de lire la connexion CJ existante.");
    try {
      const raw = existingConnection?.credentials_ciphertext ? decryptSupplierSecret(existingConnection.credentials_ciphertext) : null;
      existingCjCredentials = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      throw new Error("Les identifiants CJ existants sont invalides.");
    }
    existingCjConfig = existingConnection?.config && typeof existingConnection.config === "object"
      ? existingConnection.config as Record<string, unknown>
      : {};
  }
  const cjCredentials = isCj ? {
    ...existingCjCredentials,
    ...(parsed.data.credential_1 ? { apiKey: parsed.data.credential_1 } : {}),
    ...(parsed.data.credential_2 ? { accessToken: parsed.data.credential_2 } : {}),
    ...(parsed.data.credential_3 ? { refreshToken: parsed.data.credential_3 } : {}),
    ...(parsed.data.credential_4 ? { openId: parsed.data.credential_4 } : {}),
  } : null;
  const genericCredentials = [parsed.data.credential_1, parsed.data.credential_2, parsed.data.credential_3, parsed.data.credential_4].filter(Boolean);
  const hasCjCredentials = Boolean(cjCredentials && Object.values(cjCredentials).some(Boolean));
  const credentialBundle = isCj
    ? (hasCjCredentials ? cjCredentials : null)
    : (genericCredentials.length ? { credentials: genericCredentials } : null);
  const primarySecret = isCj
    ? String(cjCredentials?.accessToken ?? cjCredentials?.apiKey ?? "")
    : (parsed.data.credential_1 || parsed.data.api_secret || "");
  const cjConfig: Record<string, unknown> = isCj ? {
    ...existingCjConfig,
    base_currency: "EUR",
    cj_logistic_name: parsed.data.cj_logistic_name || existingCjConfig.cj_logistic_name || null,
    cj_from_country_code: (parsed.data.cj_from_country_code || String(existingCjConfig.cj_from_country_code ?? "CN")).toUpperCase(),
    cj_shop_logistics_type: parsed.data.cj_shop_logistics_type ?? Number(existingCjConfig.cj_shop_logistics_type ?? 2),
    cj_platform: parsed.data.cj_platform || String(existingCjConfig.cj_platform ?? "Api"),
    cj_store_name: parsed.data.cj_store_name || existingCjConfig.cj_store_name || null,
    cj_pay_type: parsed.data.cj_pay_type ?? Number(existingCjConfig.cj_pay_type ?? 2),
    cj_ioss_type: parsed.data.cj_ioss_type ?? Number(existingCjConfig.cj_ioss_type ?? 3),
    cj_ioss_number: parsed.data.cj_ioss_number || existingCjConfig.cj_ioss_number || (Number(existingCjConfig.cj_ioss_type ?? 3) === 3 ? "CJ-IOSS" : null),
    cj_referer: parsed.data.cj_referer || existingCjConfig.cj_referer || null,
  } : {};
  const row = {
    name: parsed.data.name,
    adapter: provider.adapterKey,
    provider_key: provider.key,
    integration_mode: provider.integrationMode,
    provider_capabilities: provider.capabilities,
    docs_url: provider.docsUrl,
    credentials_ciphertext: credentialBundle ? encryptSupplierSecret(JSON.stringify(credentialBundle)) : undefined,
    base_url: parsed.data.base_url ? parsed.data.base_url.replace(/\/+$/, "") : null,
    enabled: Boolean(parsed.data.id) ? undefined : false,
    fulfillment_mode: (provider.integrationMode === "generic_rest" || isCj) ? parsed.data.fulfillment_mode : "manual",
    auto_order_enabled: (provider.integrationMode === "generic_rest" || isCj) ? (parsed.data.fulfillment_mode === "auto" && parsed.data.auto_order_enabled === "on") : false,
    webhook_enabled: parsed.data.webhook_enabled === "on",
    sandbox_enabled: isCj && parsed.data.sandbox_enabled === "on",
    sync_interval_seconds: parsed.data.sync_interval_seconds,
    inventory_method: parsed.data.inventory_method,
    inventory_path: parsed.data.inventory_path || null,
    inventory_response_path: parsed.data.inventory_response_path || null,
    inventory_sku_path: parsed.data.inventory_sku_path || null,
    inventory_qty_path: parsed.data.inventory_qty_path || null,
    inventory_price_path: parsed.data.inventory_price_path || null,
    inventory_currency_path: parsed.data.inventory_currency_path || null,
    inventory_available_path: parsed.data.inventory_available_path || null,
    order_method: parsed.data.order_method,
    order_path: parsed.data.order_path || null,
    order_response_id_path: parsed.data.order_response_id_path || null,
    order_status_path: parsed.data.order_status_path || null,
    order_tracking_number_path: parsed.data.order_tracking_number_path || null,
    order_tracking_url_path: parsed.data.order_tracking_url_path || null,
    order_payload_template: template,
    auth_header: isCj ? "CJ-Access-Token" : parsed.data.auth_header,
    auth_prefix: isCj ? "" : parsed.data.auth_prefix,
    secret_ciphertext: primarySecret ? encryptSupplierSecret(primarySecret) : undefined,
    webhook_secret_ciphertext: isCj
      ? (parsed.data.credential_4 ? encryptSupplierSecret(parsed.data.credential_4) : undefined)
      : (parsed.data.webhook_secret ? encryptSupplierSecret(parsed.data.webhook_secret) : undefined),
    config: {
      max_supplier_order_cents: Math.round(parsed.data.max_supplier_order_eur * 100),
      order_status_endpoint_template: parsed.data.order_status_endpoint_template || null,
      order_external_id_path: parsed.data.order_response_id_path || null,
      order_response_status_path: parsed.data.order_status_path || null,
      order_response_tracking_number_path: parsed.data.order_tracking_number_path || null,
      order_response_tracking_url_path: parsed.data.order_tracking_url_path || null,
      ...cjConfig,
      auto_publish_after_sync: parsed.data.auto_publish_after_sync === "on",
      delivery_min_days: parsed.data.default_delivery_min_days ?? (isCj ? Number(existingCjConfig.delivery_min_days ?? 0) : 0),
      delivery_max_days: parsed.data.default_delivery_max_days ?? (isCj ? Number(existingCjConfig.delivery_max_days ?? 0) : 0),
    },
    created_by: user.id,
  };

  if (parsed.data.id) {
    const update = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
    const { error } = await db.from("supplier_connections").update(update).eq("id", parsed.data.id);
    if (error) throw new Error("Connexion fournisseur non enregistrée : " + error.message);
    return done("Connexion fournisseur mise à jour.");
  }

  const requiresCredential = !["feed","managed_platform","directory"].includes(provider.integrationMode);
  if (requiresCredential && !primarySecret) throw new Error("Ajoutez le premier identifiant/secret demandé par le fournisseur pour créer la connexion.");
  if (isCj && parsed.data.webhook_enabled === "on" && !cjCredentials?.openId) {
    throw new Error("Un OpenId CJ est requis pour activer les webhooks signés.");
  }
  if (isCj && parsed.data.fulfillment_mode === "auto" && !cjConfig.cj_logistic_name) throw new Error("Configurez le transporteur CJ avant d'activer les commandes automatiques.");
  if (isCj && parsed.data.fulfillment_mode === "auto" && Number(cjConfig.cj_pay_type) !== 2) throw new Error("Les commandes CJ automatiques exigent le paiement par solde CJ (payType=2).");
  const { data, error } = await db.from("supplier_connections").insert({ ...row, enabled: false, status: "disabled" }).select("id").single();
  if (error || !data) throw new Error("Connexion fournisseur impossible : " + (error?.message ?? "inconnue"));
  return done("Connexion fournisseur créée. Testez-la avant d'activer la synchronisation.");
}

export async function toggleSupplierConnection(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const enabled = String(form.get("enabled") ?? "") === "true";
  const db = supabaseAdmin();
  const { data: connection, error: readError } = await db.from("supplier_connections")
    .select("status,adapter")
    .eq("id", id)
    .maybeSingle();
  if (readError || !connection) throw new Error("Connexion fournisseur introuvable.");
  if (enabled && connection.adapter && connection.status !== "healthy") {
    throw new Error("Testez et validez le connecteur avant son activation.");
  }
  const { error } = await db.from("supplier_connections")
    .update({ enabled, status: enabled ? "healthy" : "disabled" })
    .eq("id", id);
  if (error) throw new Error("Impossible de modifier l'état du connecteur : " + error.message);
  return done(enabled ? "Connecteur activé." : "Connecteur désactivé.");
}

export async function testSupplierConnection(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  let successMessage: string;
  try {
    const connection = await loadSupplierConnection(id);
    const adapter = getSupplierAdapter(connection.adapter);
    if (adapter) {
      const result = await adapter.testConnection(connection as never);
      await supabaseAdmin().from("supplier_connections").update({
        status: "healthy",
        last_success_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", id);
      successMessage = "Test réussi : " + (result.detail ?? "fournisseur connecté.");
    } else {
      const result = await fetchInventory(id, { test: true, timestamp: new Date().toISOString() });
      await supabaseAdmin().from("supplier_connections").update({
        status: "healthy",
        last_success_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", id);
      successMessage = "Test réussi : " + result.records.length + " référence(s) fournisseur lue(s).";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec du test fournisseur.";
    await supabaseAdmin().from("supplier_connections").update({
      status: "degraded",
      last_error: message.slice(0, 1000),
    }).eq("id", id);
    throw new Error("Test fournisseur échoué : " + message);
  }
  return done(successMessage);
}
export async function syncSupplierNow(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));

  let result: Awaited<ReturnType<typeof syncSupplierConnection>>;
  try {
    result = await syncSupplierConnection(id, "manual");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation fournisseur échouée.";
    revalidatePath("/admin/dropshipping");
    redirect("/admin/dropshipping?erreur=" + encodeURIComponent("Synchronisation CJ échouée : " + message));
  }

  return done("Synchronisation terminée : " + result.applied + " référence(s) appliquée(s), " + result.changed + " changement(s)." + (result.published ? " " + result.published + " produit(s) publié(s) automatiquement." : ""));
}

export async function saveSupplierMapping(form: FormData) {
  await requireAdmin();
  const parsed = mappingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Mapping fournisseur invalide.");
  const d = parsed.data;
  const db = supabaseAdmin();
  const { data: product } = await db.from("products").select("id,kind,status").eq("id", d.product_id).maybeSingle();
  if (!product || product.kind !== "physical" || product.status !== "published") throw new Error("Le mapping doit cibler un produit physique publié.");

  const variantId = d.variant_id || null;
  if (variantId) {
    const { data: variant } = await db.from("product_variants").select("id,product_id").eq("id", variantId).maybeSingle();
    if (!variant || variant.product_id !== d.product_id) throw new Error("La variante choisie n'appartient pas au produit.");
  }

  let destinationCountries = (d.destination_countries || "").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean).slice(0, 100);
  if (!destinationCountries.length) {
    const { data: markets, error: marketError } = await db.from("markets")
      .select("code")
      .eq("sell_enabled", true)
      .eq("ship_enabled", true)
      .in("tax_status", ["approved", "legacy"])
      .in("shipping_status", ["approved", "legacy"])
      .in("compliance_status", ["approved", "legacy"])
      .in("pricing_status", ["approved", "legacy"])
      .in("payment_status", ["approved", "legacy"]);
    if (marketError || !markets?.length) throw new Error("Aucun marché commercial autorisé n'est disponible pour ce routage.");
    destinationCountries = markets.map((market) => String(market.code).toUpperCase()).filter(Boolean);
  }

  const row = {
    supplier_connection_id: d.supplier_connection_id,
    product_id: d.product_id,
    variant_id: variantId,
    external_sku: d.external_sku,
    enabled: true,
    auto_reprice: d.auto_reprice === "on",
    reprice_mode: d.reprice_mode,
    margin_bps: Math.round(d.margin_percent * 100),
    markup_cents: Math.round(d.markup_eur * 100),
    min_retail_cents: Math.round(d.min_retail_eur * 100),
    max_retail_cents: d.max_retail_eur == null ? null : Math.round(d.max_retail_eur * 100),
    priority: d.priority,
    destination_countries: destinationCountries,
  };

  if (d.id) {
    const { error } = await db.from("product_supplier_mappings").update(row).eq("id", d.id);
    if (error) throw new Error("Mapping non enregistré : " + error.message);
  } else {
    const { error } = await db.from("product_supplier_mappings").insert(row);
    if (error) throw new Error(error.code === "23505" ? "Ce SKU fournisseur est déjà mappé à ce connecteur." : "Mapping impossible : " + error.message);
  }
  return done("Mapping fournisseur enregistré.");
}

export async function deleteSupplierMapping(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const { error } = await supabaseAdmin().from("product_supplier_mappings").delete().eq("id", id);
  if (error) throw new Error("Suppression du mapping impossible : " + error.message);
  return done("Mapping supprimé.");
}

export async function recordManualSupplierOrder(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const parsed = z.object({
    status: z.enum(["manual_pending","submitted","confirmed","processing","shipped","delivered","canceled","needs_review"]),
    external_order_id: z.string().trim().max(180).optional().or(z.literal("")),
    logistics_name: z.string().trim().max(180).optional().or(z.literal("")),
    tracking_number: z.string().trim().max(180).optional().or(z.literal("")),
    tracking_url: z.string().trim().url().max(500).optional().or(z.literal("")),
    manual_note: z.string().trim().max(2000).optional().or(z.literal("")),
  }).parse(Object.fromEntries(form));

  const db = supabaseAdmin();
  const { data: row, error: readError } = await db.from("supplier_orders")
    .select("id,order_id,fulfillment_mode,status,external_order_id,tracking_number,tracking_url")
    .eq("id", id).maybeSingle();
  if (readError || !row) throw new Error("Commande fournisseur introuvable.");
  if (row.fulfillment_mode !== "manual") throw new Error("Cette commande est en mode automatique et ne peut pas être traitée manuellement ici.");

  const now = new Date().toISOString();
  const supplierStatus = parsed.data.status;
  const { error } = await db.from("supplier_orders").update({
    status: supplierStatus,
    external_order_id: parsed.data.external_order_id || null,
    logistics_name: parsed.data.logistics_name || null,
    tracking_number: parsed.data.tracking_number || null,
    tracking_url: parsed.data.tracking_url || null,
    manual_note: parsed.data.manual_note || null,
    manual_processed_at: now,
    submitted_at: ["submitted","confirmed","processing","shipped","delivered"].includes(supplierStatus) ? now : undefined,
    last_error: supplierStatus === "needs_review" ? (parsed.data.manual_note || "Vérification manuelle requise.") : null,
    next_attempt_at: null,
  }).eq("id", id);
  if (error) throw new Error("Traitement manuel non enregistré : " + error.message);

  const itemStatus = supplierStatus === "delivered" ? "delivered" : supplierStatus === "canceled" ? "canceled" : ["submitted","confirmed","processing","shipped"].includes(supplierStatus) ? "submitted" : supplierStatus;
  const { error: itemError } = await db.from("supplier_order_items").update({ status: itemStatus }).eq("supplier_order_id", id);
  if (itemError) throw new Error("La commande fournisseur est enregistrée mais le statut de ses lignes n'a pas pu être synchronisé.");

  if (supplierStatus === "needs_review") {
    await db.from("orders").update({ needs_review: true, review_note: parsed.data.manual_note || "Traitement fournisseur manuel en revue." }).eq("id", row.order_id);
  } else if (supplierStatus === "shipped" || supplierStatus === "delivered") {
    const fulfilment = supplierStatus === "delivered" ? "delivered" : "shipped";
    const { error: orderError } = await db.from("orders").update({
      needs_review: false,
      review_note: null,
      fulfilment,
      tracking_number: parsed.data.tracking_number || null,
      tracking_url: parsed.data.tracking_url || null,
      delivered_at: supplierStatus === "delivered" ? now : undefined,
    }).eq("id", row.order_id).eq("status","paid");
    if (orderError) throw new Error("Le suivi est enregistré côté fournisseur mais le statut client n'a pas pu être synchronisé.");
    const { error: groupError } = await db.from("supplier_order_groups").update({ status: supplierStatus === "delivered" ? "complete" : "processing" }).eq("order_id", row.order_id);
    if (groupError) throw new Error("Le suivi est enregistré mais le groupe fournisseur n'a pas pu être synchronisé.");
  } else if (supplierStatus === "canceled") {
    const { error: orderError } = await db.from("orders").update({ needs_review: true, review_note: parsed.data.manual_note || "Commande fournisseur annulée; vérification humaine requise." }).eq("id", row.order_id);
    if (orderError) throw new Error("La commande fournisseur est annulée mais l'état client n'a pas pu être annoté.");
    const { error: groupError } = await db.from("supplier_order_groups").update({ status: "needs_review" }).eq("order_id", row.order_id);
    if (groupError) throw new Error("Le groupe fournisseur n'a pas pu être basculé en revue.");
  } else {
    const fulfilment = ["submitted","confirmed","processing"].includes(supplierStatus) ? "preparing" : "to_prepare";
    await db.from("orders").update({ fulfilment }).eq("id", row.order_id).eq("status","paid");
    await db.from("supplier_order_groups").update({ status: supplierStatus === "manual_pending" ? "manual_pending" : "processing" }).eq("order_id", row.order_id);
  }
  return done("Traitement fournisseur manuel enregistré.");
}

export async function retrySupplierOrder(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const db = supabaseAdmin();
  const { data: row, error: readError } = await db.from("supplier_orders").select("id,fulfillment_mode").eq("id", id).maybeSingle();
  if (readError || !row) throw new Error("Commande fournisseur introuvable.");
  if (row.fulfillment_mode !== "auto") throw new Error("Cette commande est en mode manuel : utilisez le traitement manuel.");
  const { error } = await db.from("supplier_orders").update({ status: "queued", last_error: null, next_attempt_at: new Date().toISOString() }).eq("id", id).in("status", ["failed","needs_review"]);
  if (error) throw new Error("Impossible de remettre la commande fournisseur dans la file : " + error.message);
  await dispatchSupplierOrders(1);
  return done("Commande fournisseur automatique remise en traitement.");

export async function generateWebhookSecret() {
  await requireAdmin();
  return randomBytes(32).toString("hex");
}
