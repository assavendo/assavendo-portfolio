begin;
drop table if exists public.return_requests, public.addresses, public.favorites;
alter table public.orders drop column if exists delivered_at;
commit;
