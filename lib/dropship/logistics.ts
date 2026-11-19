import type { CartLine } from "@/lib/cart";
import { loadCart } from "@/lib/cart";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getRatesToEur, toEurCents } from "@/lib/dropship/fx";
import { quoteSupplierShipping } from "@/lib/dropship/connector";
import type { AdapterShippingOption } from "@/lib/dropship/adapters/types";

export type CheckoutShippingOption = {
  code: string;
  label: string;
  priceCents: number;
  minDays: number | null;
  maxDays: number | null;
  requirements: string[];
  connectionId: string;
  logisticsName: string;
  snapshot: {
    sourceCountry: string;
    destinationCountry: string;
    weightG: number;
    wrapWeightG: number;
    totalGoodsAmountEur: number;
    quotedAt: string;
    providerOption: AdapterShippingOption;
  };
};

type ShippingAddress = Record<string, unknown>;

function requirementLabel(type: string): string {
  const labels: Record<string, string> = {
    phone: "numéro de téléphone", zip: "code postal", province: "région", town: "commune",
    houseNumber: "numéro de maison", email: "adresse e-mail", recipientName: "nom du destinataire",
    recipientAddress: "adresse", city: "ville", iossNumber: "donnée fiscale d’importation",
    dutyNo: "numéro fiscal/douanier", recipientId: "identifiant du destinataire",
  };
  return labels[type] ?? type;
}

function optionKey(connectionId: string, option: AdapterShippingOption): string {
  return connectionId + ":" + option.code;
}

async function resolveShippingContext(lines: CartLine[], destinationCountry: string, shipping?: ShippingAddress) {
  const cart = await loadCart(lines);
  if (cart.blocked) throw new Error("Le panier doit être valide avant de calculer la livraison.");
  const physical = cart.items.filter((item) => item.product.kind === "physical");
  if (!physical.length) return null;

  const db = supabaseAdmin();
  const productIds = [...new Set(physical.map((item) => item.product.id))];
  const variantIds = physical.map((item) => item.variant?.id).filter((v): v is string => Boolean(v));
  const [mappingResult, connectionResult, variantResult] = await Promise.all([
    db.from("product_supplier_mappings").select("id,product_id,variant_id,external_sku,external_variant_id,enabled,available,supplier_qty,last_synced_at,destination_countries,logistics_properties,supplier_weight_g,supplier_connection_id,priority").in("product_id", productIds).eq("enabled", true),
    db.from("supplier_connections").select("id,enabled,fulfillment_mode,auto_order_enabled,sync_interval_seconds,config,adapter,provider_key").eq("enabled", true),
    db.from("product_variants").select("id,product_id,weight_g").in("id", variantIds),
  ]);
  if (mappingResult.error) throw new Error("Impossible de lire le routage fournisseur.");
  if (connectionResult.error) throw new Error("Impossible de lire les connexions fournisseur.");
  if (variantResult.error) throw new Error("Impossible de lire les poids des variantes.");

  const connectionById = new Map((connectionResult.data ?? []).map((x) => [x.id, x]));
  const variantById = new Map((variantResult.data ?? []).map((x) => [x.id, x]));
  const now = Date.now();
  const contexts = new Map<string, { connection: any; skuLines: Array<{ sku: string; variantId?: string | null; quantity: number; weightG?: number | null }>; props: Set<string>; weightG: number }>();

  for (const item of physical) {
    const matches = (mappingResult.data ?? []).filter((m) =>
      m.product_id === item.product.id &&
      (m.variant_id ? m.variant_id === item.variant?.id : !item.variant) &&
      (!Array.isArray(m.destination_countries) || !m.destination_countries.length || m.destination_countries.includes(destinationCountry))
    ).sort((a, b) => Number(b.priority ?? 100) - Number(a.priority ?? 100));
    const mapping = matches[0];
    if (!mapping) throw new Error("Aucun routage fournisseur disponible pour « " + item.product.title + " ».");
    const connection = connectionById.get(mapping.supplier_connection_id);
    if (!connection) throw new Error("La connexion fournisseur de « " + item.product.title + " » est indisponible.");
    const syncedAt = mapping.last_synced_at ? Date.parse(mapping.last_synced_at) : 0;
    const freshness = Math.max(Number(connection.sync_interval_seconds ?? 900), 60) * 3 * 1000;
    if (!mapping.available || Number(mapping.supplier_qty ?? 0) < item.line.q) throw new Error("Le stock fournisseur de « " + item.product.title + " » n’est plus disponible.");
    if (!syncedAt || now - syncedAt > freshness) throw new Error("Le stock fournisseur de « " + item.product.title + " » doit être resynchronisé avant le paiement.");

    const variantWeight = item.variant?.id ? variantById.get(item.variant.id)?.weight_g : null;
    const weightG = Number(mapping.supplier_weight_g ?? variantWeight ?? item.product.weight_g ?? 0);
    if (!Number.isFinite(weightG) || weightG <= 0) throw new Error("Le poids logistique de « " + item.product.title + " » n’est pas configuré.");
    if (!contexts.has(mapping.supplier_connection_id)) contexts.set(mapping.supplier_connection_id, { connection, skuLines: [], props: new Set<string>(), weightG: 0 });
    const ctx = contexts.get(mapping.supplier_connection_id)!;
    const existing = ctx.skuLines.find((x) => x.sku === mapping.external_sku && x.variantId === mapping.external_variant_id);
    if (existing) existing.quantity += item.line.q;
    else ctx.skuLines.push({ sku: mapping.external_sku, variantId: mapping.external_variant_id, quantity: item.line.q, weightG });
    ctx.weightG += weightG * item.line.q;
    for (const prop of Array.isArray(mapping.logistics_properties) ? mapping.logistics_properties : []) {
      if (typeof prop === "string" && prop.trim()) ctx.props.add(prop.trim().toUpperCase());
    }
  }

  if (contexts.size !== 1) throw new Error("Ce panier combine plusieurs fournisseurs physiques. La sélection de livraison multi-fournisseur doit être configurée avant la vente.");
  const [ctx] = contexts.values();
  const wrapWeightG = Math.max(0, Math.round(Number(ctx.connection.config?.logistics_wrap_weight_g ?? 60)));
  const totalGoodsAmountEur = cart.subtotal / 100;
  if (!ctx.props.size) ctx.props.add("COMMON");
  return {
    cart, connection: ctx.connection, skuLines: ctx.skuLines, productProperties: [...ctx.props],
    weightG: Math.max(1, Math.round(ctx.weightG)), wrapWeightG, totalGoodsAmountEur, shipping: shipping ?? {},
  };
}

async function normalizeOptions(
  connectionId: string,
  destinationCountry: string,
  base: { connection: any; weightG: number; wrapWeightG: number; totalGoodsAmountEur: number },
  rows: AdapterShippingOption[],
): Promise<CheckoutShippingOption[]> {
  const rates = await getRatesToEur(["USD"]);
  return rows.map((row) => ({
    code: optionKey(connectionId, row), label: row.label,
    priceCents: Math.max(1, toEurCents(Math.round(row.totalUsd * 100), "USD", rates)),
    minDays: row.minDays, maxDays: row.maxDays,
    requirements: [...new Set(row.requirements.map((r) => requirementLabel(r.type)))],
    connectionId, logisticsName: row.logisticsName,
    snapshot: {
      sourceCountry: String(base.connection.config?.cj_from_country_code ?? "CN").toUpperCase(),
      destinationCountry, weightG: base.weightG, wrapWeightG: base.wrapWeightG,
      totalGoodsAmountEur: base.totalGoodsAmountEur, quotedAt: new Date().toISOString(),
      providerOption: row,
    },
  }));
}

export async function quoteCartShippingOptions(
  lines: CartLine[], destinationCountry = "FR", shipping?: ShippingAddress,
): Promise<CheckoutShippingOption[]> {
  const country = destinationCountry.trim().toUpperCase();
  const base = await resolveShippingContext(lines, country, shipping);
  if (!base) return [];
  const adapter = String(base.connection.adapter ?? "").toLowerCase();
  const provider = String(base.connection.provider_key ?? "").toLowerCase();
  if (!adapter.includes("cj") && provider !== "cj_dropshipping") {
    throw new Error("Le calcul logistique dynamique n’est pas disponible pour le fournisseur de ce panier.");
  }
  const rows = await quoteSupplierShipping(base.connection.id, {
    destinationCountry: country,
    sourceCountry: String(base.connection.config?.cj_from_country_code ?? "CN").toUpperCase(),
    weightG: base.weightG,
    wrapWeightG: base.wrapWeightG,
    totalGoodsAmountEur: base.totalGoodsAmountEur,
    skuLines: base.skuLines,
    productProperties: base.productProperties,
    shipping: base.shipping,
  });
  const options = await normalizeOptions(base.connection.id, country, base, rows);
  if (!options.length) throw new Error("Aucune méthode de livraison valide n’est disponible pour cette destination et ce panier.");
  return options;
}

export async function revalidateCartShippingSelection(
  lines: CartLine[], destinationCountry: string, selectedCode: string, shipping: ShippingAddress,
): Promise<CheckoutShippingOption> {
  const options = await quoteCartShippingOptions(lines, destinationCountry, shipping);
  const selected = options.find((x) => x.code === selectedCode);
  if (!selected) throw new Error("La méthode de livraison choisie n’est plus disponible. Rechargez la page et choisissez une option proposée.");
  const ruleError = validateShippingRules(selected, shipping);
  if (ruleError) throw new Error(ruleError);
  return selected;
}