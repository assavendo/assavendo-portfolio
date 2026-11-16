begin;

alter table public.supplier_connections
  add column if not exists provider_key text not null default 'custom_rest',
  add column if not exists integration_mode text not null default 'generic_rest',
  add column if not exists credentials_ciphertext text,
  add column if not exists credential_version integer not null default 1,
  add column if not exists sandbox_enabled boolean not null default false,
  add column if not exists provider_capabilities jsonb not null default '{}'::jsonb,
  add column if not exists docs_url text;

alter table public.supplier_connections drop constraint if exists supplier_connections_adapter_check;
alter table public.supplier_connections add constraint supplier_connections_adapter_check
  check (adapter in ('generic_rest','cj','hypersku','alibaba','syncee','spocket','dsers','aliexpress','salehoo','eprolo','wiio','custom'));

alter table public.supplier_connections
  add constraint supplier_connections_provider_key_fkey
  foreign key (provider_key) references public.supplier_provider_catalog(provider_key)
  on update cascade;

alter table public.supplier_connections
  add constraint supplier_connections_integration_mode_check
  check (integration_mode in ('native_api','oauth_api','partner_api','restricted_api','feed','managed_platform','directory','generic_rest'));

alter table public.product_supplier_mappings
  add column if not exists priority integer not null default 100,
  add column if not exists destination_countries text[] not null default '{}'::text[];

alter table public.product_supplier_mappings
  add constraint product_supplier_mappings_priority_check
  check (priority between 1 and 10000);

alter table public.supplier_connections
  alter column base_url drop not null,
  alter column inventory_path drop not null,
  alter column inventory_response_path drop not null,
  alter column inventory_sku_path drop not null,
  alter column inventory_qty_path drop not null,
  alter column order_path drop not null;

alter table public.supplier_connections drop constraint if exists supplier_connections_base_url_check;
alter table public.supplier_connections add constraint supplier_connections_base_url_check
  check (base_url is null or base_url ~ '^https://');

create index if not exists supplier_connections_provider_idx
  on public.supplier_connections(provider_key, enabled, status);

create index if not exists product_supplier_mappings_routing_idx
  on public.product_supplier_mappings(product_id,variant_id,enabled,priority);

update public.supplier_connections sc
set
  provider_key = coalesce(nullif(sc.config->>'provider_key',''),'custom_rest'),
  integration_mode = coalesce(
    (select spc.integration_mode from public.supplier_provider_catalog spc
      where spc.provider_key=coalesce(sc.config->>'provider_key','custom_rest')),
    'generic_rest'
  ),
  docs_url = coalesce(
    sc.docs_url,
    (select spc.docs_url from public.supplier_provider_catalog spc
      where spc.provider_key=coalesce(sc.config->>'provider_key','custom_rest'))
  )
where true;

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
