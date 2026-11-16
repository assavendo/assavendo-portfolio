begin;

alter table public.product_supplier_mappings
  drop constraint if exists product_supplier_mappings_priority_check;

drop index if exists public.product_supplier_mappings_routing_idx;
alter table public.product_supplier_mappings
  drop column if exists destination_countries,
  drop column if exists priority;

drop index if exists public.supplier_connections_provider_idx;
alter table public.supplier_connections
  drop constraint if exists supplier_connections_integration_mode_check;

alter table public.supplier_connections
  drop constraint if exists supplier_connections_provider_key_fkey;

alter table public.supplier_connections
  drop constraint if exists supplier_connections_adapter_check;
alter table public.supplier_connections
  add constraint supplier_connections_adapter_check check (adapter in ('generic_rest'));

alter table public.supplier_connections
  drop column if exists provider_key,
  drop column if exists integration_mode,
  drop column if exists credentials_ciphertext,
  drop column if exists credential_version,
  drop column if exists sandbox_enabled,
  drop column if exists provider_capabilities,
  drop column if exists docs_url;

drop table if exists public.supplier_provider_catalog;

commit;
