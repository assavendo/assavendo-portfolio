begin;

create table if not exists public.supplier_connections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  adapter text not null default 'generic_rest' check (adapter in ('generic_rest')),
  base_url text not null check (base_url ~ '^https://'),
  enabled boolean not null default false,
  auto_order_enabled boolean not null default false,
  webhook_enabled boolean not null default true,
  sync_interval_seconds integer not null default 900 check (sync_interval_seconds between 60 and 86400),
  inventory_method text not null default 'GET' check (inventory_method in ('GET','POST')),
  inventory_path text not null,
  inventory_response_path text not null,
  inventory_sku_path text not null,
  inventory_qty_path text not null,
  inventory_price_path text,
  inventory_currency_path text,
  inventory_available_path text,
  order_method text not null default 'POST' check (order_method in ('POST','PUT')),
  order_path text not null,
  order_response_id_path text,
  order_status_path text,
  order_tracking_number_path text,
  order_tracking_url_path text,
  order_payload_template jsonb not null default '{}'::jsonb,
  auth_header text not null default 'Authorization',
  auth_prefix text not null default 'Bearer',
  secret_ciphertext text,
  secret_version integer not null default 1,
  webhook_secret_ciphertext text,
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  status text not null default 'disabled' check (status in ('healthy','degraded','unavailable','disabled','rate_limited')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_connections_name_uidx on public.supplier_connections(lower(name));
create index if not exists supplier_connections_due_idx
  on public.supplier_connections(enabled,status,last_sync_at);

create table if not exists public.product_supplier_mappings (
  id uuid primary key default gen_random_uuid(),
  supplier_connection_id uuid not null references public.supplier_connections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  external_product_id text,
  external_sku text not null,
  enabled boolean not null default true,
  auto_reprice boolean not null default false,
  reprice_mode text not null default 'cost_plus_margin' check (reprice_mode in ('cost_only','cost_plus_margin','cost_plus_markup','supplier_price')),
  margin_bps integer not null default 3000 check (margin_bps between 0 and 9000),
  markup_cents integer not null default 0 check (markup_cents >= 0),
  min_retail_cents integer not null default 50 check (min_retail_cents >= 50),
  max_retail_cents integer,
  supplier_cost_cents integer,
  supplier_currency text default 'eur',
  supplier_qty integer not null default 0 check (supplier_qty >= 0),
  available boolean not null default false,
  last_synced_at timestamptz,
  last_price_change_at timestamptz,
  last_stock_change_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_supplier_mappings_sku_uidx
  on public.product_supplier_mappings(supplier_connection_id,external_sku);
create unique index if not exists product_supplier_mappings_variant_uidx
  on public.product_supplier_mappings(supplier_connection_id,variant_id)
  where variant_id is not null;
create index if not exists product_supplier_mappings_product_idx
  on public.product_supplier_mappings(product_id,enabled);
create index if not exists product_supplier_mappings_due_idx
  on public.product_supplier_mappings(supplier_connection_id,enabled,last_synced_at);

create table if not exists public.supplier_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  supplier_connection_id uuid not null references public.supplier_connections(id) on delete cascade,
  mapping_id uuid not null references public.product_supplier_mappings(id) on delete cascade,
  external_sku text not null,
  supplier_qty integer,
  supplier_price_cents integer,
  supplier_currency text,
  available boolean,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists supplier_inventory_snapshots_mapping_idx
  on public.supplier_inventory_snapshots(mapping_id,synced_at desc);

create table if not exists public.supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references public.product_supplier_mappings(id) on delete cascade,
  old_cost_cents integer,
  new_cost_cents integer,
  currency text,
  retail_price_cents integer,
  change_percent numeric(12,4),
  source text not null default 'sync',
  created_at timestamptz not null default now()
);

create index if not exists supplier_price_history_mapping_idx
  on public.supplier_price_history(mapping_id,created_at desc);

create table if not exists public.supplier_sync_runs (
  id uuid primary key default gen_random_uuid(),
  supplier_connection_id uuid not null references public.supplier_connections(id) on delete cascade,
  trigger text not null default 'schedule' check (trigger in ('schedule','manual','webhook','order')),
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0,
  applied_count integer not null default 0,
  changed_count integer not null default 0,
  error_count integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists supplier_sync_runs_connection_idx
  on public.supplier_sync_runs(supplier_connection_id,started_at desc);

create table if not exists public.supplier_order_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','complete','partial','failed','needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_order_groups_order_uidx on public.supplier_order_groups(order_id);

create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  order_group_id uuid not null references public.supplier_order_groups(id) on delete cascade,
  supplier_connection_id uuid not null references public.supplier_connections(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','submitting','submitted','confirmed','processing','shipped','delivered','canceled','failed','unknown','needs_review')),
  client_reference text not null,
  external_order_id text,
  external_status text,
  currency text not null default 'eur',
  supplier_total_cents integer not null default 0 check (supplier_total_cents >= 0),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  tracking_number text,
  tracking_url text,
  idempotency_key text not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  submitted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_orders_idempotency_uidx on public.supplier_orders(idempotency_key);
create unique index if not exists supplier_orders_external_uidx
  on public.supplier_orders(supplier_connection_id,external_order_id)
  where external_order_id is not null;
create index if not exists supplier_orders_queue_idx
  on public.supplier_orders(status,next_attempt_at,created_at);
create index if not exists supplier_orders_order_idx
  on public.supplier_orders(order_id);

create table if not exists public.supplier_order_items (
  id uuid primary key default gen_random_uuid(),
  supplier_order_id uuid not null references public.supplier_orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  mapping_id uuid not null references public.product_supplier_mappings(id) on delete restrict,
  external_line_id text,
  external_sku text not null,
  quantity integer not null check (quantity >= 1 and quantity <= 20),
  supplier_unit_cost_cents integer not null default 0 check (supplier_unit_cost_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'queued' check (status in ('queued','submitted','confirmed','backordered','canceled','failed')),
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_order_items_supplier_line_uidx
  on public.supplier_order_items(supplier_order_id,order_item_id);

create table if not exists public.supplier_webhook_events (
  id uuid primary key default gen_random_uuid(),
  supplier_connection_id uuid not null references public.supplier_connections(id) on delete cascade,
  event_id text not null,
  event_type text not null default 'unknown',
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists supplier_webhook_events_uidx
  on public.supplier_webhook_events(supplier_connection_id,event_id);
create index if not exists supplier_webhook_events_status_idx
  on public.supplier_webhook_events(supplier_connection_id,status,received_at desc);

create table if not exists public.supplier_job_locks (
  job_key text primary key,
  locked_until timestamptz not null,
  locked_by text not null,
  created_at timestamptz not null default now()
);

create or replace function public.supplier_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists supplier_connections_touch on public.supplier_connections;
create trigger supplier_connections_touch before update on public.supplier_connections for each row execute function public.supplier_touch_updated_at();

drop trigger if exists product_supplier_mappings_touch on public.product_supplier_mappings;
create trigger product_supplier_mappings_touch before update on public.product_supplier_mappings for each row execute function public.supplier_touch_updated_at();

drop trigger if exists supplier_order_groups_touch on public.supplier_order_groups;
create trigger supplier_order_groups_touch before update on public.supplier_order_groups for each row execute function public.supplier_touch_updated_at();

drop trigger if exists supplier_orders_touch on public.supplier_orders;
create trigger supplier_orders_touch before update on public.supplier_orders for each row execute function public.supplier_touch_updated_at();

drop trigger if exists supplier_order_items_touch on public.supplier_order_items;
create trigger supplier_order_items_touch before update on public.supplier_order_items for each row execute function public.supplier_touch_updated_at();

alter table public.supplier_connections enable row level security;
alter table public.product_supplier_mappings enable row level security;
alter table public.supplier_inventory_snapshots enable row level security;
alter table public.supplier_price_history enable row level security;
alter table public.supplier_sync_runs enable row level security;
alter table public.supplier_order_groups enable row level security;
alter table public.supplier_orders enable row level security;
alter table public.supplier_order_items enable row level security;
alter table public.supplier_webhook_events enable row level security;
alter table public.supplier_job_locks enable row level security;

revoke all on public.supplier_connections,public.product_supplier_mappings,public.supplier_inventory_snapshots,public.supplier_price_history,public.supplier_sync_runs,public.supplier_order_groups,public.supplier_orders,public.supplier_order_items,public.supplier_webhook_events,public.supplier_job_locks from anon,authenticated;

commit;