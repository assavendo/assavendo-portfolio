-- Assavendo : espace client (favoris, adresses, demandes de retour). Additive et idempotente.
-- Retour arrière : supabase/rollbacks/20261106000000_customer_account.down.sql
begin;

alter table public.orders add column if not exists delivered_at timestamptz;

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.favorites enable row level security;
drop policy if exists "mes favoris (lecture)" on public.favorites;
create policy "mes favoris (lecture)" on public.favorites for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "mes favoris (ajout)" on public.favorites;
create policy "mes favoris (ajout)" on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "mes favoris (retrait)" on public.favorites;
create policy "mes favoris (retrait)" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.favorites to authenticated;

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Domicile' check (char_length(label) between 1 and 40),
  full_name text not null check (char_length(full_name) between 2 and 120),
  line1 text not null check (char_length(line1) between 3 and 160),
  line2 text check (line2 is null or char_length(line2) <= 160),
  postal_code text not null check (char_length(postal_code) between 2 and 12),
  city text not null check (char_length(city) between 1 and 100),
  country text not null default 'FR' check (country ~ '^[A-Z]{2}$'),
  phone text check (phone is null or char_length(phone) <= 30),
  created_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses (user_id);
alter table public.addresses enable row level security;
drop policy if exists "mes adresses (lecture)" on public.addresses;
create policy "mes adresses (lecture)" on public.addresses for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "mes adresses (ajout)" on public.addresses;
create policy "mes adresses (ajout)" on public.addresses for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "mes adresses (modification)" on public.addresses;
create policy "mes adresses (modification)" on public.addresses for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "mes adresses (suppression)" on public.addresses;
create policy "mes adresses (suppression)" on public.addresses for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.addresses to authenticated;

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('changed_mind', 'defective', 'not_as_described', 'damaged', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'requested' check (status in ('requested', 'approved', 'refused', 'received', 'refunded')),
  admin_note text not null default '' check (char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- une seule demande en cours par ligne de commande
create unique index if not exists return_requests_open_uq on public.return_requests (order_item_id) where status in ('requested', 'approved', 'received');
create index if not exists return_requests_status_idx on public.return_requests (status, created_at desc);
alter table public.return_requests enable row level security;
drop policy if exists "admin lit les retours" on public.return_requests;
create policy "admin lit les retours" on public.return_requests for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin traite les retours" on public.return_requests;
create policy "admin traite les retours" on public.return_requests for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.return_requests to authenticated;
grant update (status, admin_note, updated_at) on public.return_requests to authenticated;

-- Effacement et export : couvrent aussi les commandes à lignes, les retours et les liens de suivi.
create or replace function public.erase_personal_data(p_email text)
returns table (contacts_deleted int, orders_anonymised int)
language plpgsql security invoker set search_path = public as $$
declare c int; o int;
begin
  delete from public.contact_messages where lower(email) = lower(btrim(p_email));
  get diagnostics c = row_count;
  delete from public.return_requests where lower(email) = lower(btrim(p_email));
  update public.order_items set download_token = null where order_id in (select id from public.orders where lower(customer_email) = lower(btrim(p_email)));
  update public.orders set customer_email = 'efface+' || id || '@invalid', shipping = null, billing = null, download_token = null, access_token = null
   where lower(customer_email) = lower(btrim(p_email));
  get diagnostics o = row_count;
  return query select c, o;
end $$;
revoke all on function public.erase_personal_data(text) from public, anon, authenticated;
grant execute on function public.erase_personal_data(text) to service_role;

create or replace function public.export_personal_data(p_email text) returns jsonb
language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'messages', coalesce((select jsonb_agg(to_jsonb(m) - 'id') from public.contact_messages m where lower(m.email) = lower(btrim(p_email))), '[]'::jsonb),
    'commandes', coalesce((select jsonb_agg(to_jsonb(o) - 'download_token' - 'consent_ip_hash' - 'access_token' || jsonb_build_object('lignes', coalesce((select jsonb_agg(to_jsonb(i) - 'download_token') from public.order_items i where i.order_id = o.id), '[]'::jsonb))) from public.orders o where lower(o.customer_email) = lower(btrim(p_email))), '[]'::jsonb),
    'retours', coalesce((select jsonb_agg(to_jsonb(r) - 'id') from public.return_requests r where lower(r.email) = lower(btrim(p_email))), '[]'::jsonb));
$$;
revoke all on function public.export_personal_data(text) from public, anon, authenticated;
grant execute on function public.export_personal_data(text) to service_role;

commit;
