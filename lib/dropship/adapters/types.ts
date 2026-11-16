export type AdapterConnection = {
  id: string;
  name: string;
  provider_key: string | null;
  integration_mode: string | null;
  base_url: string | null;
  enabled: boolean;
  auto_order_enabled: boolean;
  webhook_enabled: boolean;
  sync_interval_seconds: number;
  credentials_ciphertext: string | null;
  secret_ciphertext: string | null;
  webhook_secret_ciphertext: string | null;
  sandbox_enabled: boolean;
  config: Record<string, unknown>;
};

export type AdapterInventoryRecord = {
  external_sku: string;
  external_product_id?: string | null;
  supplier_qty: number | null;
  supplier_price_cents: number | null;
  supplier_currency: string | null;
  available: boolean | null;
  raw: unknown;
};

export type AdapterOrderResult = {
  external_order_id: string | null;
  external_status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  raw: unknown;
};

export type SupplierAdapter = {
  key: string;
  testConnection: (connection: AdapterConnection) => Promise<{ ok: true; detail?: string }>;
  fetchInventory: (connection: AdapterConnection, externalSkus: string[]) => Promise<AdapterInventoryRecord[]>;
  submitOrder: (connection: AdapterConnection, orderContext: Record<string, unknown>, idempotencyKey: string) => Promise<AdapterOrderResult>;
  getOrderStatus: (connection: AdapterConnection, externalOrderId: string, context: Record<string, unknown>) => Promise<AdapterOrderResult>;
};
