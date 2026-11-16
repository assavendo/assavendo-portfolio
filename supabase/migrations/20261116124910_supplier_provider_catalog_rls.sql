begin;
alter table public.supplier_provider_catalog enable row level security;
revoke all on public.supplier_provider_catalog from anon, authenticated;
commit;
