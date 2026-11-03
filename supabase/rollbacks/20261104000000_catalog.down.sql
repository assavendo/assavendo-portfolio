begin;
drop trigger if exists products_guard_sellable on public.products;
drop function if exists public.guard_product_sellable();
drop table if exists public.collection_items, public.collections, public.stock_movements, public.product_variants, public.markets;
alter table public.products
  drop constraint if exists products_compare_price_ck, drop constraint if exists products_delivery_range_ck,
  drop column if exists category_id, drop column if exists brand_id, drop column if exists compare_at_cents, drop column if exists attributes,
  drop column if exists tags, drop column if exists sku, drop column if exists gtin, drop column if exists weight_g, drop column if exists origin_country,
  drop column if exists delivery_min_days, drop column if exists delivery_max_days, drop column if exists warranty_months, drop column if exists return_days,
  drop column if exists shipping_cents, drop column if exists track_stock, drop column if exists stock_qty, drop column if exists low_stock_threshold, drop column if exists seller_type;
drop table if exists public.brands, public.categories;
commit;
