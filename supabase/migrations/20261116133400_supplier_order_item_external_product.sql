begin;

alter table public.supplier_order_items
  add column if not exists external_product_id text;

create index if not exists supplier_order_items_external_product_idx
  on public.supplier_order_items(external_product_id);

commit;
