-- ASSAVENDO : boutique complète (catalogue + panier + espace client). À coller TEL QUEL dans Supabase > SQL Editor > Run (projet assavendo). Idempotent : rejouable sans risque.

-- Assavendo : catalogue de la boutique. À coller TEL QUEL dans Supabase > SQL Editor > Run (projet assavendo). Idempotent : rejouable sans risque.
begin;
-- Assavendo : catalogue de la boutique (cahier des charges §6, §7, §9, §10, §92).
-- Additive et idempotente : aucune donnée existante n'est modifiée ni supprimée.
-- Retour arrière : supabase/rollbacks/20261104000000_catalog.down.sql

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

-- Fichier généré par scripts/generate-taxonomy.ts : ne pas modifier à la main.
-- Idempotent : les catégories existantes ne sont jamais écrasées.
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('electronique', 'Électronique et informatique', 'physical', 'Téléphones, ordinateurs, audio, réseau et accessoires.', true, '', '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'smartphones', 'Smartphones', 'physical', true, '[{"key":"ram_go","label":"Mémoire (RAM)","type":"enum","unit":"Go","values":["4","6","8","12","16","32","64"],"filterable":true},{"key":"stockage_go","label":"Stockage","type":"enum","unit":"Go","values":["64","128","256","512","1024","2048"],"filterable":true},{"key":"ecran_pouces","label":"Taille d''écran","type":"number","unit":"pouces","filterable":true},{"key":"reseau_5g","label":"5G","type":"boolean","filterable":true},{"key":"systeme","label":"Système","type":"enum","values":["Android","iOS"],"filterable":true},{"key":"couleur","label":"Couleur","type":"text","filterable":true}]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'tablettes', 'Tablettes', 'physical', true, '[{"key":"ram_go","label":"Mémoire (RAM)","type":"enum","unit":"Go","values":["4","6","8","12","16","32","64"],"filterable":true},{"key":"stockage_go","label":"Stockage","type":"enum","unit":"Go","values":["64","128","256","512","1024","2048"],"filterable":true},{"key":"ecran_pouces","label":"Taille d''écran","type":"number","unit":"pouces","filterable":true}]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'ordinateurs-portables', 'Ordinateurs portables', 'physical', true, '[{"key":"cpu","label":"Processeur","type":"text","filterable":false},{"key":"ram_go","label":"Mémoire (RAM)","type":"enum","unit":"Go","values":["4","6","8","12","16","32","64"],"filterable":true},{"key":"stockage_go","label":"Stockage","type":"enum","unit":"Go","values":["64","128","256","512","1024","2048"],"filterable":true},{"key":"ecran_pouces","label":"Taille d''écran","type":"number","unit":"pouces","filterable":true},{"key":"systeme","label":"Système","type":"enum","values":["Windows","macOS","Linux","ChromeOS"],"filterable":true},{"key":"poids_kg","label":"Poids","type":"number","unit":"kg","filterable":true}]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'ordinateurs-fixes', 'Ordinateurs fixes', 'physical', true, '[{"key":"cpu","label":"Processeur","type":"text"},{"key":"ram_go","label":"Mémoire (RAM)","type":"enum","unit":"Go","values":["4","6","8","12","16","32","64"],"filterable":true},{"key":"stockage_go","label":"Stockage","type":"enum","unit":"Go","values":["64","128","256","512","1024","2048"],"filterable":true},{"key":"systeme","label":"Système","type":"enum","values":["Windows","macOS","Linux"],"filterable":true}]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'electronique-composants', 'Composants', 'physical', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'ecrans', 'Écrans', 'physical', true, '[{"key":"ecran_pouces","label":"Diagonale","type":"number","unit":"pouces","filterable":true}]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'televisions', 'Télévisions', 'physical', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'appareils-photo', 'Appareils photo', 'physical', true, '[]'::jsonb, 70) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'audio', 'Audio', 'physical', true, '[]'::jsonb, 80) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'casques', 'Casques', 'physical', true, '[]'::jsonb, 90) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'ecouteurs', 'Écouteurs', 'physical', true, '[]'::jsonb, 100) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'accessoires-electronique', 'Accessoires', 'physical', true, '[]'::jsonb, 110) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'cables-chargeurs', 'Câbles et chargeurs', 'physical', true, '[]'::jsonb, 120) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'stockage-donnees', 'Stockage', 'physical', true, '[]'::jsonb, 130) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'reseau', 'Réseau', 'physical', true, '[]'::jsonb, 140) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'electronique'), 'objets-connectes', 'Objets connectés', 'physical', true, '[]'::jsonb, 150) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('maison', 'Maison et jardin', 'physical', 'Meubles, décoration, cuisine, électroménager et jardin.', true, '', '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'meubles', 'Meubles', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'decoration', 'Décoration', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'eclairage', 'Éclairage', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'cuisine', 'Cuisine', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'electromenager', 'Électroménager', 'physical', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'literie', 'Literie', 'physical', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'rangement', 'Rangement', 'physical', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'salle-de-bain', 'Salle de bain', 'physical', true, '[]'::jsonb, 70) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'nettoyage', 'Nettoyage', 'physical', true, '[]'::jsonb, 80) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'jardin', 'Jardin', 'physical', true, '[]'::jsonb, 90) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'bricolage', 'Bricolage', 'physical', true, '[]'::jsonb, 100) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'maison'), 'securite-domestique', 'Sécurité domestique', 'physical', true, '[]'::jsonb, 110) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('mode', 'Mode et accessoires', 'physical', 'Vêtements, chaussures, sacs, montres et bijoux.', true, '', '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'vetements', 'Vêtements', 'physical', true, '[{"key":"taille","label":"Taille","type":"enum","values":["XS","S","M","L","XL","XXL"],"filterable":true},{"key":"couleur","label":"Couleur","type":"text","filterable":true},{"key":"genre","label":"Genre","type":"enum","values":["Femme","Homme","Mixte"],"filterable":true},{"key":"matiere","label":"Matière","type":"text"}]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'chaussures', 'Chaussures', 'physical', true, '[{"key":"pointure","label":"Pointure","type":"enum","values":["36","37","38","39","40","41","42","43","44","45","46","47"],"filterable":true},{"key":"couleur","label":"Couleur","type":"text","filterable":true},{"key":"genre","label":"Genre","type":"enum","values":["Femme","Homme","Mixte"],"filterable":true},{"key":"matiere","label":"Matière","type":"text"},{"key":"usage","label":"Usage","type":"enum","values":["Ville","Sport","Randonnée","Cérémonie"],"filterable":true}]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'sacs', 'Sacs', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'accessoires-mode', 'Accessoires', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'montres', 'Montres', 'physical', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'bijoux', 'Bijoux', 'physical', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'lunettes', 'Lunettes', 'physical', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'mode'), 'sportswear', 'Sportswear', 'physical', true, '[]'::jsonb, 70) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('beaute', 'Beauté et soins', 'physical', 'Soins du visage et du corps, cheveux, parfums.', false, 'Famille réglementée : aucune vente tant que les règles du pays, les preuves de conformité et les conditions de livraison ne sont pas validées par le propriétaire.', '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'beaute'), 'soins-du-visage', 'Soins du visage', 'physical', false, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'beaute'), 'soins-du-corps', 'Soins du corps', 'physical', false, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'beaute'), 'cheveux', 'Cheveux', 'physical', false, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'beaute'), 'parfums', 'Parfums', 'physical', false, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'beaute'), 'accessoires-beaute', 'Accessoires beauté', 'physical', false, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'beaute'), 'appareils-de-beaute', 'Appareils de beauté', 'physical', false, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('sante', 'Santé et bien-être', 'physical', 'Bien-être et hygiène éligibles.', false, 'Famille réglementée : aucune vente tant que les règles du pays, les preuves de conformité et les conditions de livraison ne sont pas validées par le propriétaire.', '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sante'), 'bien-etre', 'Bien-être', 'physical', false, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sante'), 'hygiene', 'Hygiène', 'physical', false, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('sport', 'Sport et plein air', 'physical', 'Fitness, running, randonnée, cyclisme et plein air.', true, '', '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'fitness', 'Fitness', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'musculation', 'Musculation', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'running', 'Running', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'football', 'Football', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'basketball', 'Basketball', 'physical', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'tennis', 'Tennis', 'physical', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'randonnee', 'Randonnée', 'physical', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'camping', 'Camping', 'physical', true, '[]'::jsonb, 70) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'cyclisme', 'Cyclisme', 'physical', true, '[]'::jsonb, 80) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'sport'), 'natation', 'Natation', 'physical', true, '[]'::jsonb, 90) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('enfants', 'Enfants et jeux', 'physical', 'Jouets, jeux éducatifs et puériculture.', false, 'Famille réglementée : aucune vente tant que les règles du pays, les preuves de conformité et les conditions de livraison ne sont pas validées par le propriétaire. (sécurité des produits pour enfants)', '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'enfants'), 'jouets', 'Jouets', 'physical', false, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'enfants'), 'jeux-educatifs', 'Jeux éducatifs', 'physical', false, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'enfants'), 'puericulture', 'Puériculture', 'physical', false, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'enfants'), 'mobilier-enfant', 'Mobilier enfant', 'physical', false, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'enfants'), 'accessoires-enfant', 'Accessoires enfant', 'physical', false, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('bureau', 'Bureau et école', 'physical', 'Fournitures, papeterie, mobilier et imprimantes.', true, '', '[]'::jsonb, 70) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'bureau'), 'fournitures', 'Fournitures', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'bureau'), 'papeterie', 'Papeterie', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'bureau'), 'mobilier-de-bureau', 'Mobilier de bureau', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'bureau'), 'imprimantes', 'Imprimantes', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'bureau'), 'accessoires-de-bureau', 'Accessoires de bureau', 'physical', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'bureau'), 'equipement-professionnel', 'Équipement professionnel', 'physical', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('auto', 'Auto et mobilité', 'physical', 'Accessoires, entretien, outils et pièces compatibles.', true, '', '[]'::jsonb, 80) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'auto'), 'accessoires-auto', 'Accessoires auto', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'auto'), 'entretien-auto', 'Entretien auto', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'auto'), 'outils-auto', 'Outils auto', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'auto'), 'equipements-auto', 'Équipements auto', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'auto'), 'electronique-auto', 'Électronique auto', 'physical', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'auto'), 'pieces-compatibles', 'Pièces compatibles', 'physical', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('animaux', 'Animaux', 'physical', 'Accessoires, hygiène, jouets et équipements.', true, '', '[]'::jsonb, 90) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'animaux'), 'accessoires-animaux', 'Accessoires animaux', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'animaux'), 'hygiene-animaux', 'Hygiène animaux', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'animaux'), 'jouets-animaux', 'Jouets animaux', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'animaux'), 'equipements-animaux', 'Équipements animaux', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('livres-medias', 'Livres et médias', 'physical', 'Livres, magazines, bandes dessinées.', true, '', '[]'::jsonb, 100) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-medias'), 'livres', 'Livres', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-medias'), 'magazines', 'Magazines', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-medias'), 'bandes-dessinees', 'Bandes dessinées', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-medias'), 'medias-physiques', 'Médias physiques', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('industrie', 'Industrie et professionnel', 'physical', 'Outils, équipements, sécurité et pièces.', true, '', '[]'::jsonb, 110) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'industrie'), 'industrie-outils-professionnels', 'Outils professionnels', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'industrie'), 'equipements-industriels', 'Équipements industriels', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'industrie'), 'securite-professionnelle', 'Sécurité professionnelle', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'industrie'), 'instrumentation', 'Instrumentation', 'physical', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'industrie'), 'pieces', 'Pièces', 'physical', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'industrie'), 'fournitures-professionnelles', 'Fournitures professionnelles', 'physical', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('alimentation', 'Alimentation', 'physical', 'Alimentation conditionnée et produits spécialisés.', false, 'Famille réglementée : aucune vente tant que les règles du pays, les preuves de conformité et les conditions de livraison ne sont pas validées par le propriétaire. (dates, stockage, température, transport).', '[]'::jsonb, 120) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'alimentation'), 'epicerie', 'Épicerie conditionnée', 'physical', false, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'alimentation'), 'boissons', 'Boissons', 'physical', false, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('artisanat', 'Artisanat, art et collection', 'physical', 'Pièces uniques, art, objets de collection.', true, '', '[]'::jsonb, 130) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'artisanat'), 'artisanat-objets', 'Objets artisanaux', 'physical', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'artisanat'), 'art', 'Art', 'physical', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'artisanat'), 'collection', 'Collection', 'physical', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('logiciels', 'Logiciels et licences', 'digital', 'Applications, extensions, outils professionnels et licences.', true, '', '[{"key":"plateforme","label":"Plateforme","type":"enum","values":["Windows","macOS","Linux","Web","Android","iOS"],"filterable":true},{"key":"licence","label":"Licence","type":"enum","values":["Personnelle","Commerciale","Équipe"],"filterable":true}]'::jsonb, 140) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'logiciels'), 'licences', 'Licences', 'digital', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'logiciels'), 'applications', 'Applications', 'digital', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'logiciels'), 'plugins', 'Plugins', 'digital', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'logiciels'), 'extensions', 'Extensions', 'digital', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'logiciels'), 'logiciels-outils-professionnels', 'Outils professionnels', 'digital', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'logiciels'), 'saas', 'SaaS', 'digital', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'logiciels'), 'cles-dactivation', 'Clés d''activation', 'digital', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('livres-numeriques', 'Livres numériques', 'digital', 'eBooks, guides, manuels et rapports.', true, '', '[{"key":"format","label":"Format","type":"enum","values":["PDF","EPUB"],"filterable":true},{"key":"langue","label":"Langue","type":"enum","values":["Français","Anglais","Arabe","Espagnol"],"filterable":true},{"key":"pages","label":"Pages","type":"number","filterable":false}]'::jsonb, 150) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-numeriques'), 'ebooks', 'eBooks', 'digital', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-numeriques'), 'pdf', 'PDF', 'digital', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-numeriques'), 'epub', 'EPUB', 'digital', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-numeriques'), 'guides', 'Guides', 'digital', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-numeriques'), 'manuels', 'Manuels', 'digital', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'livres-numeriques'), 'rapports', 'Rapports', 'digital', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('formations', 'Formations et cours', 'digital', 'Cours, masterclass, certifications et tutoriels.', true, '', '[]'::jsonb, 160) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'formations'), 'cours', 'Cours', 'digital', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'formations'), 'masterclass', 'Masterclass', 'digital', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'formations'), 'formations-professionnelles', 'Formations professionnelles', 'digital', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'formations'), 'certifications', 'Certifications', 'digital', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'formations'), 'tutoriels', 'Tutoriels', 'digital', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'formations'), 'formations-video', 'Formations vidéo', 'digital', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('design', 'Design et créations', 'digital', 'Templates, kits d''interface, illustrations, icônes et polices.', true, '', '[{"key":"format","label":"Format de fichier","type":"enum","values":["Figma","PSD","SVG","PNG","PDF","3D"],"filterable":true},{"key":"licence","label":"Licence","type":"enum","values":["Personnelle","Commerciale"],"filterable":true}]'::jsonb, 170) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'templates', 'Templates', 'digital', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'presentations', 'Présentations', 'digital', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'kits-dinterface', 'Kits d''interface', 'digital', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'maquettes', 'Maquettes', 'digital', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'illustrations', 'Illustrations', 'digital', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'icones', 'Icônes', 'digital', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'logos', 'Logos', 'digital', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'fichiers-svg', 'Fichiers SVG', 'digital', true, '[]'::jsonb, 70) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'fichiers-psd', 'Fichiers PSD', 'digital', true, '[]'::jsonb, 80) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'fichiers-figma', 'Fichiers Figma', 'digital', true, '[]'::jsonb, 90) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'modeles-3d', 'Modèles 3D', 'digital', true, '[]'::jsonb, 100) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'design'), 'polices', 'Polices', 'digital', true, '[]'::jsonb, 110) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('audio-video', 'Audio, vidéo et photo', 'digital', 'Musique, effets sonores, vidéos, photos et animations.', true, '', '[]'::jsonb, 180) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'musique', 'Musique', 'digital', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'effets-sonores', 'Effets sonores', 'digital', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'samples', 'Samples', 'digital', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'boucles', 'Boucles', 'digital', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'videos', 'Vidéos', 'digital', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'images-darchive', 'Images d''archive', 'digital', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'photos', 'Photos', 'digital', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'voix', 'Voix', 'digital', true, '[]'::jsonb, 70) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'audio-video'), 'animations', 'Animations', 'digital', true, '[]'::jsonb, 80) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('developpement', 'Développement', 'digital', 'Code, thèmes, scripts, bibliothèques et composants.', true, '', '[]'::jsonb, 190) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'developpement'), 'code', 'Code', 'digital', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'developpement'), 'modeles-de-code', 'Modèles de code', 'digital', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'developpement'), 'themes', 'Thèmes', 'digital', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'developpement'), 'scripts', 'Scripts', 'digital', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'developpement'), 'bibliotheques', 'Bibliothèques', 'digital', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'developpement'), 'developpement-composants', 'Composants', 'digital', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'developpement'), 'ressources-techniques', 'Ressources techniques', 'digital', true, '[]'::jsonb, 60) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('productivite', 'Productivité', 'digital', 'Tableurs, modèles, checklists et documents imprimables.', true, '', '[]'::jsonb, 200) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'productivite'), 'feuilles-de-calcul', 'Feuilles de calcul', 'digital', true, '[]'::jsonb, 0) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'productivite'), 'modeles-de-documents', 'Modèles de documents', 'digital', true, '[]'::jsonb, 10) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'productivite'), 'checklists', 'Checklists', 'digital', true, '[]'::jsonb, 20) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'productivite'), 'documents', 'Documents', 'digital', true, '[]'::jsonb, 30) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'productivite'), 'fichiers-imprimables', 'Fichiers imprimables', 'digital', true, '[]'::jsonb, 40) on conflict (slug) do nothing;
insert into public.categories (parent_id, slug, name, kind, sellable, attributes, sort) values ((select id from public.categories where slug = 'productivite'), 'outils-de-productivite', 'Outils de productivité', 'digital', true, '[]'::jsonb, 50) on conflict (slug) do nothing;
insert into public.categories (slug, name, kind, description, sellable, note, attributes, sort) values ('services', 'Services Assavendo', 'service', 'Missions d''audit, de réparation et de mise en place, sur devis écrit.', true, '', '[]'::jsonb, 210) on conflict (slug) do nothing;
-- 22 familles, 143 sous-catégories
commit;

-- Assavendo : panier, commandes à lignes, stock réservé. À coller TEL QUEL dans Supabase > SQL Editor > Run, APRÈS 20261104_catalogue.sql. Idempotent.
-- Assavendo : panier multi-produits, commandes à lignes, stock réservé, téléchargements par ligne (cahier §§ commandes, stock, livraison).
-- Additive : les commandes existantes (un produit par commande, jeton sur la commande) restent valides et téléchargeables.
-- Retour arrière : supabase/rollbacks/20261105000000_cart_orders.down.sql
begin;

alter table public.orders alter column product_id drop not null;
create sequence if not exists public.order_number_seq start 1001;
alter table public.orders
  add column if not exists order_number text unique default ('AV-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  add column if not exists subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  add column if not exists shipping_cents int not null default 0 check (shipping_cents >= 0),
  add column if not exists access_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists fulfilment text not null default 'none' check (fulfilment in ('none', 'to_prepare', 'preparing', 'shipped', 'delivered')),
  add column if not exists tracking_number text,
  add column if not exists tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  add column if not exists stock_reserved boolean not null default false,
  add column if not exists reserved_until timestamptz;
create index if not exists orders_reserved_idx on public.orders (reserved_until) where stock_reserved and status = 'pending';

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id) on delete set null,
  title text not null,
  variant_label text,
  sku text,
  kind public.product_kind not null,
  unit_price_cents int not null check (unit_price_cents >= 0),
  qty int not null check (qty between 1 and 20),
  line_cents int generated always as (unit_price_cents * qty) stored,
  download_token text unique,
  download_count int not null default 0,
  download_max int not null default 5 check (download_max between 1 and 100),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
alter table public.order_items enable row level security;
drop policy if exists "admin lit les lignes de commande" on public.order_items;
create policy "admin lit les lignes de commande" on public.order_items for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin modifie les lignes de commande" on public.order_items;
create policy "admin modifie les lignes de commande" on public.order_items for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.order_items to authenticated;
grant update (download_token, expires_at, download_max) on public.order_items to authenticated;
grant update (fulfilment, tracking_number, tracking_url) on public.orders to authenticated;

-- ------------------------------------------------------------ libération du stock réservé (commande annulée ou expirée)
create or replace function public.release_order_stock(p_order_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare o public.orders%rowtype; i record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not o.stock_reserved then return; end if;
  for i in select oi.* from public.order_items oi join public.products p on p.id = oi.product_id where oi.order_id = p_order_id and oi.kind = 'physical' and p.track_stock loop
    if i.variant_id is not null then update public.product_variants set stock_qty = stock_qty + i.qty where id = i.variant_id;
    else update public.products set stock_qty = stock_qty + i.qty where id = i.product_id; end if;
    insert into public.stock_movements (product_id, variant_id, delta, reason, reference) values (i.product_id, i.variant_id, i.qty, 'reservation_expiree', o.id::text);
  end loop;
  update public.orders set stock_reserved = false where id = p_order_id;
end $$;
revoke all on function public.release_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.release_order_stock(uuid) to service_role;

create or replace function public.expire_stale_orders() returns int
language plpgsql security invoker set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.orders where status = 'pending' and stock_reserved and reserved_until < now() for update skip locked loop
    perform public.release_order_stock(r.id);
    update public.orders set status = 'canceled' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;
grant execute on function public.expire_stale_orders() to service_role;

-- ------------------------------------------------------------ création atomique d'une commande depuis un panier
-- Les prix, la disponibilité, le stock et la livraison sont TOUS recalculés ici : le client ne transmet que des identifiants et des quantités.
create or replace function public.create_cart_order(
  p_lines jsonb, p_email text, p_visitor text, p_terms text, p_waiver boolean, p_ip_hash text, p_hold_minutes int default 35
) returns table (order_id uuid, amount_cents int, subtotal_cents int, shipping_cents int, has_physical boolean, items jsonb, error text)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  msg text; l record; p public.products%rowtype; v public.product_variants%rowtype; c public.categories%rowtype;
  oid uuid := gen_random_uuid(); price int; avail int; sub int := 0; ship int := 0; phys boolean := false; has_paid_digital boolean := false;
  out_items jsonb := '[]'::jsonb; seen_phys uuid[] := '{}'; nlines int;
begin
  perform public.expire_stale_orders();
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, 'Panier vide ou invalide.'; return;
  end if;
  insert into public.orders (id, product_id, customer_email, amount_cents, status, visitor_id, consent_terms_version, consent_at, consent_digital_waiver, consent_ip_hash, stock_reserved, reserved_until)
  values (oid, null, p_email, 0, 'pending', p_visitor, p_terms, now(), coalesce(p_waiver, false), p_ip_hash, true, now() + make_interval(mins => p_hold_minutes));
  nlines := 0;
  for l in select (x->>'p')::uuid as pid, nullif(x->>'v', '')::uuid as vid, sum(least(greatest((x->>'q')::int, 1), 20)) as qty
             from jsonb_array_elements(p_lines) x group by 1, 2 order by 1, 2 loop
    nlines := nlines + 1;
    select * into p from public.products where id = l.pid and status = 'published' for update;
    if not found then raise exception 'indisponible' using errcode = 'P0001', detail = 'Un produit de votre panier n''est plus disponible.'; end if;
    if p.category_id is not null then
      select * into c from public.categories where id = p.category_id;
      if found and not c.sellable then raise exception 'indisponible' using errcode = 'P0001', detail = format('« %s » n''est pas disponible à la vente.', p.title); end if;
    end if;
    v := null; price := p.price_cents;
    if l.vid is not null then
      select * into v from public.product_variants where id = l.vid and product_id = p.id and active for update;
      if not found then raise exception 'indisponible' using errcode = 'P0001', detail = format('La déclinaison choisie pour « %s » n''est plus disponible.', p.title); end if;
      price := coalesce(v.price_cents, p.price_cents);
    elsif p.kind = 'physical' and exists (select 1 from public.product_variants x where x.product_id = p.id and x.active) then
      raise exception 'indisponible' using errcode = 'P0001', detail = format('Choisissez une déclinaison pour « %s ».', p.title);
    end if;
    if l.qty > 1 and p.kind <> 'physical' then
      raise exception 'indisponible' using errcode = 'P0001', detail = format('« %s » ne se commande qu''en un exemplaire.', p.title);
    end if;
    if p.kind = 'physical' then
      phys := true;
      if p.track_stock then
        avail := case when v.id is not null then v.stock_qty else p.stock_qty end;
        if avail < l.qty then raise exception 'stock' using errcode = 'P0001', detail = case when avail <= 0 then format('« %s » est épuisé.', p.title) else format('Il ne reste que %s exemplaire(s) de « %s ».', avail, p.title) end; end if;
        if v.id is not null then update public.product_variants set stock_qty = stock_qty - l.qty where id = v.id;
        else update public.products set stock_qty = stock_qty - l.qty where id = p.id; end if;
        insert into public.stock_movements (product_id, variant_id, delta, reason, reference) values (p.id, v.id, -l.qty, 'vente', oid::text);
      end if;
      if not (p.id = any (seen_phys)) then seen_phys := seen_phys || p.id; ship := ship + p.shipping_cents; end if;
    elsif p.kind = 'digital' and price > 0 then has_paid_digital := true; end if;
    insert into public.order_items (order_id, product_id, variant_id, title, variant_label, sku, kind, unit_price_cents, qty)
    values (oid, p.id, v.id, p.title, v.label, coalesce(v.sku, p.sku), p.kind, price, l.qty::int);
    sub := sub + price * l.qty::int;
    out_items := out_items || jsonb_build_object('product_id', p.id, 'title', p.title, 'variant_label', v.label, 'unit_price_cents', price, 'qty', l.qty::int, 'kind', p.kind, 'image', p.images->0->>'url');
  end loop;
  if has_paid_digital and not coalesce(p_waiver, false) then
    raise exception 'waiver' using errcode = 'P0001', detail = 'Pour un contenu numérique payant, vous devez accepter la renonciation au droit de rétractation.';
  end if;
  if sub + ship > 0 and sub + ship < 50 then
    raise exception 'minimum' using errcode = 'P0001', detail = 'Le montant minimum de paiement est de 0,50 €.';
  end if;
  update public.orders set amount_cents = sub + ship, subtotal_cents = sub, shipping_cents = ship where id = oid;
  return query select oid, sub + ship, sub, ship, phys, out_items, null::text;
exception when sqlstate 'P0001' then
  -- toute exception annule aussi la réservation de stock et la commande créées plus haut dans ce bloc
  get stacked diagnostics msg = pg_exception_detail;
  return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, msg;
end $$;
revoke all on function public.create_cart_order(jsonb, text, text, text, boolean, text, int) from public, anon, authenticated;
grant execute on function public.create_cart_order(jsonb, text, text, text, boolean, text, int) to service_role;

-- ------------------------------------------------------------ finalisation d'une commande à lignes (webhook Stripe ou commande gratuite)
create or replace function public.fulfil_cart_order(
  p_order_id uuid, p_session_id text, p_amount int, p_currency text, p_payment_intent text,
  p_email text, p_paid_at timestamptz, p_shipping jsonb, p_billing jsonb, p_ttl_days int default 30
) returns table (result text, order_id uuid, customer_email text, email_sent boolean)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare o public.orders%rowtype; phys boolean;
begin
  select * into o from public.orders x where x.id = p_order_id for update;
  if not found then return query select 'not_found'::text, p_order_id, null::text, false; return; end if;
  if o.status = 'refunded' then return query select 'ignored'::text, o.id, o.customer_email, o.email_sent_at is not null; return; end if;
  if o.amount_cents <> p_amount or lower(o.currency) <> lower(p_currency) then
    update public.orders set needs_review = true, review_note = format('Montant ou devise inattendus : attendu %s %s, reçu %s %s', o.amount_cents, o.currency, p_amount, p_currency) where id = o.id;
    return query select 'mismatch'::text, o.id, o.customer_email, false; return;
  end if;
  if o.status = 'paid' then return query select 'already'::text, o.id, o.customer_email, o.email_sent_at is not null; return; end if;
  select exists (select 1 from public.order_items where order_id = o.id and kind = 'physical') into phys;
  update public.orders set
    status = 'paid', paid_at = coalesce(p_paid_at, now()), payment_intent_id = coalesce(p_payment_intent, payment_intent_id),
    stripe_session_id = coalesce(stripe_session_id, p_session_id), customer_email = coalesce(nullif(btrim(p_email), ''), customer_email),
    shipping = coalesce(p_shipping, shipping), billing = coalesce(p_billing, billing), stock_reserved = false,
    fulfilment = case when phys then 'to_prepare' else 'none' end,
    needs_review = needs_review or o.status = 'canceled',
    review_note = case when o.status = 'canceled' then 'Paiement reçu après l''expiration de la réservation : vérifiez le stock avant d''expédier.' else review_note end
  where id = o.id;
  update public.order_items i set
    download_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    expires_at = now() + make_interval(days => greatest(p_ttl_days, 1))
  where i.order_id = o.id and i.kind = 'digital' and exists (select 1 from public.product_deliverables d where d.product_id = i.product_id);
  return query select 'fulfilled'::text, o.id, coalesce(nullif(btrim(p_email), ''), o.customer_email), false;
end $$;
revoke all on function public.fulfil_cart_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int) from public, anon, authenticated;
grant execute on function public.fulfil_cart_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int) to service_role;

-- ------------------------------------------------------------ téléchargement par ligne de commande (même garantie atomique que claim_download)
create or replace function public.claim_item_download(p_token text, p_ip_hash text default null, p_user_agent text default null)
returns table (storage_path text, file_name text, order_id uuid, item_id uuid)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare r record;
begin
  update public.order_items i set download_count = i.download_count + 1
    from public.orders o, public.product_deliverables d
   where i.download_token = p_token and o.id = i.order_id and o.status = 'paid' and d.product_id = i.product_id
     and i.download_count < i.download_max and (i.expires_at is null or i.expires_at > now())
  returning d.storage_path as sp, d.file_name as fn, o.id as oid, i.id as iid into r;
  if r.oid is null then return; end if;
  update public.orders set last_download_at = now() where id = r.oid;
  insert into public.order_downloads (order_id, ip_hash, user_agent) values (r.oid, p_ip_hash, left(p_user_agent, 300));
  return query select r.sp, r.fn, r.oid, r.iid;
end $$;
revoke all on function public.claim_item_download(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_item_download(text, text, text) to service_role;
create or replace function public.release_item_download(p_item_id uuid) returns void
language sql security invoker set search_path = public as $$
  update public.order_items set download_count = greatest(download_count - 1, 0) where id = p_item_id;
$$;
revoke all on function public.release_item_download(uuid) from public, anon, authenticated;
grant execute on function public.release_item_download(uuid) to service_role;

commit;

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
