-- Assavendo : schéma initial
-- Principes : RLS activée partout, lecture publique limitée au contenu publié,
-- écritures publiques (likes, avis, commentaires, contact) uniquement via le serveur.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- administrateurs
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "admin lit sa propre ligne" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------- domaines
create table public.domains (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  intro text not null default '',
  sort int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.domains enable row level security;
create policy "lecture publique des domaines" on public.domains for select to anon, authenticated using (true);
create policy "admin gère les domaines" on public.domains for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- problèmes
create type public.problem_status as enum ('draft', 'published', 'archived');
create type public.problem_format as enum ('tool', 'study');

create table public.problems (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  domain_id uuid references public.domains(id) on delete set null,
  title text not null check (char_length(title) between 4 and 160),
  hook text not null default '',            -- accroche orientée client
  who text not null default '',             -- qui est concerné
  symptom text not null default '',         -- ce que la personne observe
  cost text not null default '',            -- ce que cela lui coûte
  cause text not null default '',           -- cause technique, en langage clair
  what_we_do text not null default '',      -- ce que fait Assavendo
  deliverables text[] not null default '{}',-- livrables concrets
  outcome text not null default '',         -- résultat attendu, sans chiffre inventé
  stack text[] not null default '{}',
  audiences text[] not null default '{}' check (audiences <@ array['entreprise','particulier']),
  format public.problem_format not null default 'study',
  tool_key text,                            -- identifiant de l'outil interactif
  tool_intro text not null default '',
  cover_url text,
  cover_alt text not null default '',
  cover_credit text,
  status public.problem_status not null default 'draft',
  featured boolean not null default false,
  sort int not null default 1000,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tool_requires_key check (format <> 'tool' or tool_key is not null)
);
create index problems_status_sort_idx on public.problems (status, sort);
create index problems_domain_idx on public.problems (domain_id);
create index problems_search_idx on public.problems using gin (
  to_tsvector('french', title || ' ' || hook || ' ' || symptom || ' ' || what_we_do)
);
alter table public.problems enable row level security;
create policy "lecture publique des problèmes publiés" on public.problems
  for select to anon, authenticated using (status = 'published');
create policy "admin lit tous les problèmes" on public.problems
  for select to authenticated using (public.is_admin());
create policy "admin écrit les problèmes" on public.problems
  for insert to authenticated with check (public.is_admin());
create policy "admin modifie les problèmes" on public.problems
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin supprime les problèmes" on public.problems
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- produits
create type public.product_kind as enum ('digital', 'service', 'physical');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 180),
  summary text not null check (char_length(summary) between 12 and 500),
  description text not null default '',
  kind public.product_kind not null default 'digital',
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'eur' check (currency = 'eur'),
  features text[] not null default '{}',
  images jsonb not null default '[]'::jsonb,  -- [{url, alt, credit}]
  demo_url text,
  status public.problem_status not null default 'draft',
  allow_comments boolean not null default true,
  allow_reviews boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_price check (status <> 'published' or price_cents = 0 or price_cents >= 50)
);
create index products_status_idx on public.products (status, published_at desc);
alter table public.products enable row level security;
create policy "lecture publique des produits publiés" on public.products
  for select to anon, authenticated using (status = 'published');
create policy "admin lit tous les produits" on public.products
  for select to authenticated using (public.is_admin());
create policy "admin écrit les produits" on public.products
  for insert to authenticated with check (public.is_admin());
create policy "admin modifie les produits" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin supprime les produits" on public.products
  for delete to authenticated using (public.is_admin());

-- Le fichier livré après paiement vit dans une table réservée à l'administration.
create table public.product_deliverables (
  product_id uuid primary key references public.products(id) on delete cascade,
  storage_path text not null,
  file_name text not null
);
alter table public.product_deliverables enable row level security;
create policy "admin gère les livrables de produit" on public.product_deliverables
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- interactions
create table public.product_likes (
  product_id uuid not null references public.products(id) on delete cascade,
  visitor_id text not null check (char_length(visitor_id) between 16 and 80),
  created_at timestamptz not null default now(),
  primary key (product_id, visitor_id)
);
alter table public.product_likes enable row level security;

create table public.product_shares (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  channel text not null default 'link',
  created_at timestamptz not null default now()
);
create index product_shares_product_idx on public.product_shares (product_id);
alter table public.product_shares enable row level security;

create type public.moderation_status as enum ('pending', 'approved', 'rejected');

create table public.product_comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  parent_id uuid references public.product_comments(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 80),
  body text not null check (char_length(body) between 3 and 1500),
  is_owner_reply boolean not null default false,
  status public.moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index product_comments_product_idx on public.product_comments (product_id, status, created_at desc);
alter table public.product_comments enable row level security;
create policy "lecture des commentaires approuvés" on public.product_comments
  for select to anon, authenticated using (status = 'approved');
create policy "admin modère les commentaires" on public.product_comments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  visitor_id text not null,
  author_name text not null check (char_length(author_name) between 2 and 80),
  rating int not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 2000),
  verified_purchase boolean not null default false,
  status public.moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (product_id, visitor_id)
);
create index product_reviews_product_idx on public.product_reviews (product_id, status);
alter table public.product_reviews enable row level security;
create policy "lecture des avis approuvés" on public.product_reviews
  for select to anon, authenticated using (status = 'approved');
create policy "admin modère les avis" on public.product_reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- commandes
create type public.order_status as enum ('pending', 'paid', 'canceled', 'refunded');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  stripe_session_id text not null unique,
  payment_intent_id text,
  customer_email text not null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status public.order_status not null default 'pending',
  download_token text unique,
  download_count int not null default 0,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_status_idx on public.orders (status, created_at desc);
alter table public.orders enable row level security;
create policy "admin lit les commandes" on public.orders for select to authenticated using (public.is_admin());

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------- contact
create type public.contact_status as enum ('new', 'read', 'archived');
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) between 5 and 320),
  project_type text,
  message text not null check (char_length(message) between 12 and 4000),
  consent boolean not null default false,
  status public.contact_status not null default 'new',
  created_at timestamptz not null default now()
);
create index contact_status_idx on public.contact_messages (status, created_at desc);
alter table public.contact_messages enable row level security;
create policy "admin gère les messages" on public.contact_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- limitation de débit
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return n <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- ---------------------------------------------------------------- mise à jour automatique
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger problems_touch before update on public.problems for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- droits d'accès à l'API
grant select on public.domains, public.problems, public.products, public.product_comments, public.product_reviews to anon, authenticated;
grant insert, update, delete on public.domains, public.problems, public.products,
  public.product_comments, public.product_reviews, public.contact_messages, public.product_deliverables to authenticated;
grant select on public.contact_messages, public.orders, public.admins, public.product_deliverables to authenticated;

-- ---------------------------------------------------------------- stockage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('deliverables', 'deliverables', false, 104857600)
on conflict (id) do nothing;

create policy "admin envoie des médias" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
create policy "admin lit les médias" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_admin());
create policy "admin remplace des médias" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin());
create policy "admin supprime des médias" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
create policy "admin gère les livrables" on storage.objects for all to authenticated
  using (bucket_id = 'deliverables' and public.is_admin())
  with check (bucket_id = 'deliverables' and public.is_admin());
