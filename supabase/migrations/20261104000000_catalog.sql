-- Assavendo : catalogue de la boutique (cahier des charges §6, §7, §9, §10, §92).
-- Additive et idempotente : aucune donnée existante n'est modifiée ni supprimée.
-- Retour arrière : supabase/rollbacks/20261104000000_catalog.down.sql
begin;

-- ------------------------------------------------------------ catégories (arbre à 2 niveaux, attributs dynamiques)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  kind public.product_kind not null default 'physical',
  description text not null default '',
  -- false = visible mais non vendable tant que le propriétaire n'a pas validé la famille (cahier §92.3)
  sellable boolean not null default true,
  note text not null default '',
  -- [{key,label,type:enum|number|boolean|text,unit?,values?,filterable?}]
  attributes jsonb not null default '[]'::jsonb check (jsonb_typeof(attributes) = 'array'),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists categories_parent_idx on public.categories (parent_id, sort);
alter table public.categories enable row level security;
drop policy if exists "catégories visibles" on public.categories;
create policy "catégories visibles" on public.categories for select to anon, authenticated using (true);
drop policy if exists "admin crée les catégories" on public.categories;
create policy "admin crée les catégories" on public.categories for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les catégories" on public.categories;
create policy "admin modifie les catégories" on public.categories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les catégories" on public.categories;
create policy "admin supprime les catégories" on public.categories for delete to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------ marques
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
alter table public.brands enable row level security;
drop policy if exists "marques visibles" on public.brands;
create policy "marques visibles" on public.brands for select to anon, authenticated using (true);
drop policy if exists "admin crée les marques" on public.brands;
create policy "admin crée les marques" on public.brands for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les marques" on public.brands;
create policy "admin modifie les marques" on public.brands for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les marques" on public.brands;
create policy "admin supprime les marques" on public.brands for delete to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------ produits : colonnes catalogue
alter table public.products
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists compare_at_cents int check (compare_at_cents is null or compare_at_cents > 0),
  add column if not exists attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  add column if not exists tags text[] not null default '{}',
  add column if not exists sku text,
  add column if not exists gtin text check (gtin is null or gtin ~ '^[0-9]{8,14}$'),
  add column if not exists weight_g int check (weight_g is null or weight_g > 0),
  add column if not exists origin_country text check (origin_country is null or char_length(origin_country) = 2),
  add column if not exists delivery_min_days int check (delivery_min_days is null or delivery_min_days >= 0),
  add column if not exists delivery_max_days int check (delivery_max_days is null or delivery_max_days >= 0),
  add column if not exists warranty_months int check (warranty_months is null or warranty_months >= 0),
  add column if not exists return_days int not null default 14 check (return_days >= 0),
  add column if not exists shipping_cents int not null default 0 check (shipping_cents >= 0),
  add column if not exists track_stock boolean not null default false,
  add column if not exists stock_qty int not null default 0 check (stock_qty >= 0),
  add column if not exists low_stock_threshold int not null default 3 check (low_stock_threshold >= 0),
  add column if not exists seller_type text not null default 'first_party' check (seller_type in ('first_party', 'supplier', 'marketplace'));
create unique index if not exists products_sku_uq on public.products (sku) where sku is not null;
create index if not exists products_category_idx on public.products (category_id) where status = 'published';
create index if not exists products_brand_idx on public.products (brand_id);
alter table public.products drop constraint if exists products_delivery_range_ck;
alter table public.products add constraint products_delivery_range_ck
  check (delivery_min_days is null or delivery_max_days is null or delivery_min_days <= delivery_max_days);
-- Le prix barré doit être supérieur au prix vendu : jamais de fausse remise (cahier §« pas de fausses promotions »)
alter table public.products drop constraint if exists products_compare_price_ck;
alter table public.products add constraint products_compare_price_ck
  check (compare_at_cents is null or compare_at_cents > price_cents);

-- ------------------------------------------------------------ variantes
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text,
  label text not null check (char_length(label) between 1 and 160),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  price_cents int check (price_cents is null or price_cents = 0 or price_cents >= 50),
  stock_qty int not null default 0 check (stock_qty >= 0),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists product_variants_sku_uq on public.product_variants (sku) where sku is not null;
create index if not exists product_variants_product_idx on public.product_variants (product_id, sort);
alter table public.product_variants enable row level security;
drop policy if exists "variantes visibles" on public.product_variants;
create policy "variantes visibles" on public.product_variants for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or (select public.is_admin()))));
drop policy if exists "admin crée les variantes" on public.product_variants;
create policy "admin crée les variantes" on public.product_variants for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les variantes" on public.product_variants;
create policy "admin modifie les variantes" on public.product_variants for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les variantes" on public.product_variants;
create policy "admin supprime les variantes" on public.product_variants for delete to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------ mouvements de stock (journal ; accès service_role uniquement)
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  delta int not null check (delta <> 0),
  reason text not null check (reason in ('reception', 'vente', 'retour', 'correction', 'casse', 'reservation_expiree')),
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;

-- ------------------------------------------------------------ collections éditoriales
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '',
  status public.problem_status not null default 'draft',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort int not null default 0,
  primary key (collection_id, product_id)
);
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
drop policy if exists "collections publiées" on public.collections;
create policy "collections publiées" on public.collections for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
drop policy if exists "éléments de collections" on public.collection_items;
create policy "éléments de collections" on public.collection_items for select to anon, authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and (c.status = 'published' or (select public.is_admin()))));
drop policy if exists "admin crée les collections" on public.collections;
create policy "admin crée les collections" on public.collections for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les collections" on public.collections;
create policy "admin modifie les collections" on public.collections for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les collections" on public.collections;
create policy "admin supprime les collections" on public.collections for delete to authenticated using ((select public.is_admin()));
drop policy if exists "admin crée les éléments" on public.collection_items;
create policy "admin crée les éléments" on public.collection_items for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les éléments" on public.collection_items;
create policy "admin modifie les éléments" on public.collection_items for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les éléments" on public.collection_items;
create policy "admin supprime les éléments" on public.collection_items for delete to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------ registre des marchés (cahier §9) : décision du propriétaire, un seul marché actif par défaut
create table if not exists public.markets (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency text not null default 'eur' check (currency = 'eur'),
  language text not null default 'fr',
  sell_enabled boolean not null default false,
  ship_enabled boolean not null default false
);
alter table public.markets enable row level security;
drop policy if exists "marchés visibles" on public.markets;
create policy "marchés visibles" on public.markets for select to anon, authenticated using (true);
drop policy if exists "admin modifie les marchés" on public.markets;
create policy "admin modifie les marchés" on public.markets for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.markets (code, name, sell_enabled, ship_enabled) values
  ('FR', 'France', true, true), ('BE', 'Belgique', false, true), ('LU', 'Luxembourg', false, true), ('CH', 'Suisse', false, true),
  ('DE', 'Allemagne', false, true), ('ES', 'Espagne', false, true), ('IT', 'Italie', false, true), ('NL', 'Pays-Bas', false, true), ('PT', 'Portugal', false, true)
on conflict (code) do nothing;

-- ------------------------------------------------------------ droits
grant select on public.categories, public.brands, public.product_variants, public.collections, public.collection_items, public.markets to anon, authenticated;
grant insert, update, delete on public.categories, public.brands, public.product_variants, public.collections, public.collection_items to authenticated;
grant update on public.markets to authenticated;

-- ------------------------------------------------------------ garde-fou : un produit payant d'une famille non validée ne peut pas être publié
create or replace function public.guard_product_sellable() returns trigger
language plpgsql security invoker set search_path = public as $$
declare ok boolean;
begin
  if new.status = 'published' and new.category_id is not null then
    select sellable into ok from public.categories where id = new.category_id;
    if ok is false then
      raise exception 'Catégorie non validée pour la vente : validez la famille dans l''administration avant de publier ce produit.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_guard_sellable on public.products;
create trigger products_guard_sellable before insert or update on public.products
  for each row execute function public.guard_product_sellable();

commit;
