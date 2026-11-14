-- Global markets for the Assavendo commerce layer.
-- Server-side only: market activation is controlled by explicit flags/statuses.
begin;

create table if not exists public.markets (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency text not null default 'eur' check (currency = 'eur'),
  language text not null default 'fr',
  sell_enabled boolean not null default false,
  ship_enabled boolean not null default false,
  tax_status text not null default 'pending' check (tax_status in ('pending','approved','rejected','legacy')),
  shipping_status text not null default 'pending' check (shipping_status in ('pending','approved','rejected','legacy')),
  compliance_status text not null default 'pending' check (compliance_status in ('pending','approved','rejected','legacy')),
  pricing_status text not null default 'pending' check (pricing_status in ('pending','approved','rejected','legacy')),
  payment_status text not null default 'pending' check (payment_status in ('pending','approved','rejected','legacy')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Migration additive : la migration du catalogue a deja cree markets sur une base fraiche.
alter table public.markets
  add column if not exists tax_status text not null default 'pending',
  add column if not exists shipping_status text not null default 'pending',
  add column if not exists compliance_status text not null default 'pending',
  add column if not exists pricing_status text not null default 'pending',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $ begin
  alter table public.markets add constraint markets_tax_status_ck check (tax_status in ('pending','approved','rejected','legacy'));
exception when duplicate_object then null; end $;
do $ begin
  alter table public.markets add constraint markets_shipping_status_ck check (shipping_status in ('pending','approved','rejected','legacy'));
exception when duplicate_object then null; end $;
do $ begin
  alter table public.markets add constraint markets_compliance_status_ck check (compliance_status in ('pending','approved','rejected','legacy'));
exception when duplicate_object then null; end $;
do $ begin
  alter table public.markets add constraint markets_pricing_status_ck check (pricing_status in ('pending','approved','rejected','legacy'));
exception when duplicate_object then null; end $;
do $ begin
  alter table public.markets add constraint markets_payment_status_ck check (payment_status in ('pending','approved','rejected','legacy'));
exception when duplicate_object then null; end $;

alter table public.markets enable row level security;
revoke all on public.markets from anon, authenticated;

insert into public.markets
  (code,name,currency,language,sell_enabled,ship_enabled,tax_status,shipping_status,compliance_status,pricing_status,payment_status)
values
  ('FR','France','eur','fr',true,true,'legacy','legacy','legacy','legacy','legacy'),
  ('BE','Belgique','eur','fr',false,true,'pending','pending','pending','pending','pending'),
  ('CH','Suisse','eur','fr',false,true,'pending','pending','pending','pending','pending'),
  ('DE','Allemagne','eur','fr',false,true,'pending','pending','pending','pending','pending'),
  ('ES','Espagne','eur','fr',false,true,'pending','pending','pending','pending','pending'),
  ('IT','Italie','eur','fr',false,true,'pending','pending','pending','pending','pending'),
  ('LU','Luxembourg','eur','fr',false,true,'pending','pending','pending','pending','pending'),
  ('NL','Pays-Bas','eur','fr',false,true,'pending','pending','pending','pending','pending'),
  ('PT','Portugal','eur','fr',false,true,'pending','pending','pending','pending','pending')
on conflict (code) do nothing;

commit;
