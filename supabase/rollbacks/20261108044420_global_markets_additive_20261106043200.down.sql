-- Test/development rollback for the global markets layer.
-- Production rollback should be coordinated with commerce configuration and data ownership.
begin;
drop table if exists public.markets;
commit;
