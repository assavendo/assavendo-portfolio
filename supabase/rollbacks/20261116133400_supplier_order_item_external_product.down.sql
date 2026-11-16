begin;

drop index if exists public.supplier_order_items_external_product_idx;
alter table public.supplier_order_items
  drop column if exists external_product_id;

commit;
