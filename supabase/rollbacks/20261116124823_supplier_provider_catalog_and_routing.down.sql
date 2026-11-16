begin;

-- Forward migration 20261116124823 creates only the provider catalog.
-- Supplier connection/routing schema is applied later by 20261116150000.

drop table if exists public.supplier_provider_catalog;

commit;
