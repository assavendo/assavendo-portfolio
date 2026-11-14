-- Catalogue : taxonomie, garde-fous de vente, prix barré, RLS.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

select pg_temp.assert((select count(*) from public.categories where parent_id is null) >= 20, 'familles présentes');
select pg_temp.assert((select count(*) from public.categories where parent_id is not null) >= 100, 'sous-catégories présentes');
select pg_temp.assert((select bool_and(not sellable) from public.categories where slug in ('beaute', 'sante', 'enfants', 'alimentation')), 'familles réglementées non vendables par défaut');
select pg_temp.assert((select sellable from public.categories where slug = 'smartphones'), 'smartphones vendables');
select pg_temp.assert((select count(*) from public.markets where sell_enabled) = 1, 'un seul marché de vente actif par défaut');

-- une famille non validée ne peut pas recevoir de produit publié
do $$ begin
  begin
    insert into public.products (slug, title, summary, price_cents, status, published_at, category_id)
    values ('creme-test', 'Crème de test', 'Un produit de test pour la garde.', 1500, 'published', now(), (select id from public.categories where slug = 'beaute'));
    raise exception 'ÉCHEC : produit publié dans une famille non validée accepté';
  exception when check_violation then null; end;
end $$;
-- en brouillon, c'est permis
insert into public.products (slug, title, summary, price_cents, status, category_id)
values ('creme-brouillon', 'Crème brouillon', 'Un brouillon de test pour la garde.', 1500, 'draft', (select id from public.categories where slug = 'beaute'));

-- produit valide dans une famille vendable
insert into public.products (id, slug, title, summary, price_cents, compare_at_cents, status, published_at, category_id, attributes, track_stock, stock_qty)
values ('33333333-3333-3333-3333-333333333333', 'telephone-test', 'Téléphone de test', 'Un smartphone de test pour le catalogue.', 29900, 34900, 'published', now(),
        (select id from public.categories where slug = 'smartphones'), '{"ram_go":"8","stockage_go":"256"}', true, 5);
select pg_temp.assert((select attributes->>'ram_go' = '8' from public.products where slug = 'telephone-test'), 'attributs dynamiques stockés');

-- prix barré inférieur ou égal au prix : refusé (pas de fausse remise)
do $$ begin
  begin
    update public.products set compare_at_cents = 29900 where slug = 'telephone-test';
    raise exception 'ÉCHEC : prix barré égal au prix accepté';
  exception when check_violation then null; end;
end $$;

-- stock négatif refusé
do $$ begin
  begin
    update public.products set stock_qty = -1 where slug = 'telephone-test';
    raise exception 'ÉCHEC : stock négatif accepté';
  exception when check_violation then null; end;
end $$;

-- variantes : SKU unique
insert into public.product_variants (product_id, sku, label, options, stock_qty) values ('33333333-3333-3333-3333-333333333333', 'TEL-NOIR', 'Noir', '{"couleur":"Noir"}', 3);
do $$ begin
  begin
    insert into public.product_variants (product_id, sku, label) values ('33333333-3333-3333-3333-333333333333', 'TEL-NOIR', 'Doublon');
    raise exception 'ÉCHEC : SKU en double accepté';
  exception when unique_violation then null; end;
end $$;

-- collections éditoriales : intégrité, ordre et RLS de lecture publique
insert into public.collections (id, slug, title, description, status, sort)
values ('44444444-4444-4444-4444-444444444444', 'collection-test', 'Collection de test', 'Sélection de démonstration.', 'published', 10);
insert into public.collection_items (collection_id, product_id, sort)
values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 10);
insert into public.collection_items (collection_id, product_id, sort)
values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 20)
on conflict do nothing;
select pg_temp.assert((select count(*) = 1 from public.collection_items where collection_id = '44444444-4444-4444-4444-444444444444'), 'doublon de produit dans une collection ignoré par la contrainte unique');
insert into public.collections (id, slug, title, status, sort)
values ('55555555-5555-5555-5555-555555555555', 'collection-brouillon', 'Collection brouillon', 'draft', 20);
insert into public.collection_items (collection_id, product_id, sort)
values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 10);

-- RLS : l'anonyme lit les catégories, variantes et collections publiées, jamais les brouillons ni le journal de stock
set role anon;
select pg_temp.assert((select count(*) from public.categories) > 100, 'catégories lisibles (anonyme)');
select pg_temp.assert((select count(*) from public.product_variants) = 1, 'variantes d''un produit publié lisibles');
select pg_temp.assert((select count(*) from public.collections where slug = 'collection-test') = 1, 'collection publiée lisible (anonyme)');
select pg_temp.assert((select count(*) from public.collection_items where collection_id = '44444444-4444-4444-4444-444444444444') = 1, 'élément de collection publiée lisible (anonyme)');
select pg_temp.assert((select count(*) from public.collections where slug = 'collection-brouillon') = 0, 'collection brouillon invisible (anonyme)');
select pg_temp.assert((select count(*) from public.collection_items where collection_id = '55555555-5555-5555-5555-555555555555') = 0, 'élément de collection brouillon invisible (anonyme)');
select pg_temp.assert((select count(*) from public.products where slug = 'creme-brouillon') = 0, 'brouillon invisible (anonyme)');
do $$ begin
  begin perform 1 from public.stock_movements; raise exception 'ÉCHEC : journal de stock lisible';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
