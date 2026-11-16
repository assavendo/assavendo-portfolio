import type { SupplierAdapter } from "./types";
import { cjAdapter } from "./cj";

const adapters = new Map<string, SupplierAdapter>([
  ["cj", cjAdapter],
]);

export function getSupplierAdapter(adapterKey: string | null | undefined): SupplierAdapter | null {
  return adapterKey ? adapters.get(adapterKey) ?? null : null;
}
