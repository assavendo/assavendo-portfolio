create table if not exists public.supplier_worker_secrets (
  id smallint primary key,
  secret text not null check (char_length(secret) >= 32),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

revoke all on public.supplier_worker_secrets from anon, authenticated;
alter table public.supplier_worker_secrets enable row level security;

insert into public.supplier_worker_secrets (id, secret)
values (1, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;