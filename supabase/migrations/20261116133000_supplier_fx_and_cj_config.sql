begin;

alter table public.product_supplier_mappings
  add column if not exists source_cost_cents integer,
  add column if not exists source_currency text,
  add column if not exists fx_rate_to_eur numeric(20,10);

alter table public.supplier_inventory_snapshots
  add column if not exists source_price_cents integer,
  add column if not exists source_currency text,
  add column if not exists fx_rate_to_eur numeric(20,10);

alter table public.supplier_price_history
  add column if not exists source_cost_cents integer,
  add column if not exists source_currency text,
  add column if not exists fx_rate_to_eur numeric(20,10);

update public.supplier_provider_catalog
set
  config_schema = case
    when provider_key = 'cj_dropshipping' then jsonb_build_object(
      'credentials', jsonb_build_array('api_key','access_token','refresh_token','open_id'),
      'auth', 'CJ-Access-Token',
      'webhook_signature', 'HMAC-SHA256/Base64 with openId secret',
      'settings', jsonb_build_object(
        'base_currency','EUR',
        'logistic_name','optional',
        'from_country_code','default CN',
        'shop_logistics_type','1|2|3',
        'platform','Api',
        'store_name','optional',
        'pay_type','2 balance | 3 create only',
        'referer','optional'
      )
    )
    else config_schema
  end
where provider_key = 'cj_dropshipping';

commit;