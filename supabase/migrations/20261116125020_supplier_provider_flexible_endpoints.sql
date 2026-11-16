begin;

alter table public.supplier_connections
  alter column base_url drop not null,
  alter column inventory_path drop not null,
  alter column inventory_response_path drop not null,
  alter column inventory_sku_path drop not null,
  alter column inventory_qty_path drop not null,
  alter column order_path drop not null;

alter table public.supplier_connections drop constraint if exists supplier_connections_base_url_check;
alter table public.supplier_connections add constraint supplier_connections_base_url_check check (base_url is null or base_url ~ '^https://');

commit;
