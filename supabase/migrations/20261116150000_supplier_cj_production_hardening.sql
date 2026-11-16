begin;

update public.supplier_provider_catalog
set
  config_schema = jsonb_set(
    config_schema,
    '{settings,shop_logistics_type}',
    '"1|2|3; default 2 (merchant logistics)"'::jsonb,
    true
  ),
  updated_at = now()
where provider_key = 'cj_dropshipping';

commit;
