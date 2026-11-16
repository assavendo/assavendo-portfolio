create table if not exists public.manus_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 80),
  secret_enc text not null,
  key_hint text not null default '',
  agent_profile text not null default 'standard' check (agent_profile in ('standard','lite','max')),
  priority integer not null default 100 check (priority between 1 and 10000),
  enabled boolean not null default true,
  cooldown_until timestamptz,
  fail_count integer not null default 0,
  last_error text,
  last_ok_at timestamptz,
  daily_limit integer check (daily_limit is null or daily_limit > 0),
  used_day date not null default current_date,
  used_today integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists manus_keys_pick_idx on public.manus_keys(enabled, priority);

create table if not exists public.dropship_imports (
  id uuid primary key default gen_random_uuid(),
  supplier_url text not null check (supplier_url ~ '^https://' and char_length(supplier_url) <= 2000),
  product_query text not null check (char_length(product_query) between 2 and 200),
  status text not null default 'queued' check (status in ('queued','running','needs_review','approved','rejected','failed')),
  manus_key_id uuid references public.manus_keys(id),
  manus_task_id text,
  manus_task_url text,
  extracted jsonb,
  images jsonb not null default '[]'::jsonb,
  error text,
  rights_confirmed boolean not null default false,
  product_id uuid references public.products(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);

create index if not exists dropship_imports_manus_key_id_idx on public.dropship_imports(manus_key_id);
create index if not exists dropship_imports_product_idx on public.dropship_imports(product_id);
create index if not exists dropship_imports_status_idx on public.dropship_imports(status, created_at desc);
create unique index if not exists dropship_imports_task_uidx
  on public.dropship_imports(manus_task_id)
  where manus_task_id is not null;

alter table public.manus_keys enable row level security;
alter table public.dropship_imports enable row level security;

revoke all on public.manus_keys from anon, authenticated;
revoke all on public.dropship_imports from anon, authenticated;

comment on table public.manus_keys is
  'Clés API Manus chiffrées. Accès serveur uniquement.';
comment on table public.dropship_imports is
  'Imports de produits fournisseurs à analyser et valider. Accès serveur uniquement.';
