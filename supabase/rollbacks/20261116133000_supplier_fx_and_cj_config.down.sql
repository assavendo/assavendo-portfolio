begin;

alter table public.supplier_price_history
  drop column if exists fx_rate_to_eur,
  drop column if exists source_currency,
  drop column if exists source_cost_cents;

alter table public.supplier_inventory_snapshots
  drop column if exists fx_rate_to_eur,
  drop column if exists source_currency,
  drop column if exists source_price_cents;

alter table public.product_supplier_mappings
  drop column if exists fx_rate_to_eur,
  drop column if exists source_currency,
  drop column if exists source_cost_cents;

commit;
