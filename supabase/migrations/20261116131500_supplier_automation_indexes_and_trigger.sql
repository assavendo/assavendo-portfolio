create index if not exists product_supplier_mappings_variant_idx
  on public.product_supplier_mappings(variant_id);

create index if not exists supplier_connections_created_by_idx
  on public.supplier_connections(created_by);

create index if not exists supplier_inventory_snapshots_connection_idx
  on public.supplier_inventory_snapshots(supplier_connection_id);

create index if not exists supplier_order_items_mapping_idx
  on public.supplier_order_items(mapping_id);

create index if not exists supplier_order_items_order_item_idx
  on public.supplier_order_items(order_item_id);

create index if not exists supplier_order_groups_order_idx
  on public.supplier_order_groups(order_id);

create index if not exists supplier_orders_order_group_idx
  on public.supplier_orders(order_group_id);

create or replace function public.supplier_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;