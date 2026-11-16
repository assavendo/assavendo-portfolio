"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { encryptSupplierSecret } from "@/lib/dropship/crypto";
import { fetchInventory } from "@/lib/dropship/connector";
import { dispatchSupplierOrders } from "@/lib/dropship/orders";
import { syncSupplierConnection } from "@/lib/dropship/sync";
import { getSupplierProvider } from "@/lib/dropship/providers";

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
  auth_header: z.string().trim().min(2).max(100),
  auth_prefix: z.string().trim().max(60),
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
  cj_logistic_name: z.string().trim().max(180).optional().or(z.literal("")),
  cj_from_country_code: z.string().trim().length(2).optional().or(z.literal("")),
  cj_shop_logistics_type: z.coerce.number().int().min(1).max(3).optional(),
  cj_platform: z.string().trim().max(80).optional().or(z.literal("")),
  cj_store_name: z.string().trim().max(180).optional().or(z.literal("")),
  cj_pay_type: z.coerce.number().int().min(2).max(3).optional(),
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
  const cjCredentials = isCj ? {
    apiKey: parsed.data.credential_1 || undefined,
    accessToken: parsed.data.credential_2 || undefined,
    refreshToken: parsed.data.credential_3 || undefined,
    openId: parsed.data.credential_4 || undefined,
  } : null;
  const genericCredentials = [parsed.data.credential_1, parsed.data.credential_2, parsed.data.credential_3, parsed.data.credential_4].filter(Boolean);
  const credentialBundle = isCj ? cjCredentials : genericCredentials.length ? { credentials: genericCredentials } : null;
  const primarySecret = isCj
    ? (parsed.data.credential_2 || parsed.data.credential_1 || "")
    : (parsed.data.credential_1 || parsed.data.api_secret || "");
  const cjConfig = isCj ? {
    base_currency: "EUR",
    cj_logistic_name: parsed.data.cj_logistic_name || null,
    cj_from_country_code: (parsed.data.cj_from_country_code || "CN").toUpperCase(),
    cj_shop_logistics_type: parsed.data.cj_shop_logistics_type ?? 3,
    cj_platform: parsed.data.cj_platform || "Api",
    cj_store_name: parsed.data.cj_store_name || null,
    cj_pay_type: parsed.data.cj_pay_type ?? 2,
    cj_referer: parsed.data.cj_referer || null,
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
    auto_order_enabled: (provider.integrationMode === "generic_rest" || isCj) ? parsed.data.auto_order_enabled === "on" : false,
    webhook_enabled: parsed.data.webhook_enabled === "on",
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
    auth_header: parsed.data.auth_header,
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
  if (isCj && !parsed.data.cj_logistic_name && parsed.data.auto_order_enabled === "on") throw new Error("Configurez le transporteur CJ avant d'activer les commandes automatiques.");
  const { data, error } = await db.from("supplier_connections").insert({ ...row, enabled: false, status: "disabled" }).select("id").single();
  if (error || !data) throw new Error("Connexion fournisseur impossible : " + (error?.message ?? "inconnue"));
  return done("Connexion fournisseur créée. Testez-la avant d'activer la synchronisation.");
}

export async function toggleSupplierConnection(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const enabled = String(form.get("enabled") ?? "") === "true";
  const { error } = await supabaseAdmin().from("supplier_connections").update({ enabled, status: enabled ? "degraded" : "disabled" }).eq("id", id);
  if (error) throw new Error("Impossible de modifier l'état du connecteur : " + error.message);
  return done(enabled ? "Connecteur activé." : "Connecteur désactivé.");
}

export async function testSupplierConnection(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  try {
    const result = await fetchInventory(id, { test: true, timestamp: new Date().toISOString() });
    await supabaseAdmin().from("supplier_connections").update({ status: "healthy", last_success_at: new Date().toISOString(), last_error: null }).eq("id", id);
    return done("Test réussi : " + result.records.length + " référence(s) fournisseur lue(s).");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec du test fournisseur.";
    await supabaseAdmin().from("supplier_connections").update({ status: "degraded", last_error: message.slice(0,1000) }).eq("id", id);
    throw new Error("Test fournisseur échoué : " + message);
  }
}

export async function syncSupplierNow(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const result = await syncSupplierConnection(id, "manual");
  return done(`Synchronisation terminée : ${result.applied} référence(s) appliquée(s), ${result.changed} changement(s).`);
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
    destination_countries: (d.destination_countries || "").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean).slice(0, 100),
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

export async function retrySupplierOrder(form: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const { error } = await supabaseAdmin().from("supplier_orders").update({ status: "queued", last_error: null, next_attempt_at: new Date().toISOString() }).eq("id", id).in("status", ["failed","needs_review"]);
  if (error) throw new Error("Impossible de remettre la commande fournisseur dans la file : " + error.message);
  await dispatchSupplierOrders(1);
  return done("Commande fournisseur remise en traitement.");
}

export async function generateWebhookSecret() {
  await requireAdmin();
  return randomBytes(32).toString("hex");
}
