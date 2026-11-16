begin;

alter table public.product_supplier_mappings
  add column if not exists external_variant_id text;

alter table public.supplier_order_items
  add column if not exists external_variant_id text;

create index if not exists product_supplier_mappings_external_variant_idx
  on public.product_supplier_mappings(supplier_connection_id, external_variant_id);

create index if not exists supplier_order_items_external_variant_idx
  on public.supplier_order_items(external_variant_id);

commit;
