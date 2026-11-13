-- Panier : prix recalculés côté base, stock réservé sans survente, libération, jetons par ligne, téléchargements limités.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

insert into public.products (id, slug, title, summary, kind, price_cents, status, published_at, track_stock, stock_qty, shipping_cents, delivery_min_days, delivery_max_days)
values ('44444444-4444-4444-4444-444444444441', 'casque-test', 'Casque de test', 'Un casque physique pour tester le panier.', 'physical', 5000, 'published', now(), true, 3, 490, 2, 4),
       ('44444444-4444-4444-4444-444444444442', 'ebook-test', 'Ebook de test', 'Un livre numérique pour tester le panier.', 'digital', 1200, 'published', now(), false, 0, 0, null, null),
       ('44444444-4444-4444-4444-444444444443', 'gratuit-test', 'Guide gratuit', 'Un guide gratuit pour tester le panier.', 'digital', 0, 'published', now(), false, 0, 0, null, null),
       ('44444444-4444-4444-4444-444444444445', 'objet-gratuit-test', 'Objet gratuit', 'Un objet physique gratuit pour tester la collecte de livraison.', 'physical', 0, 'published', now(), false, 0, 0, null, null);

select pg_temp.assert(
  (select error like '%produit physique gratuit%' from public.create_cart_order('[{"p":"44444444-4444-4444-4444-444444444445","q":1}]'::jsonb, 'gratuit-physique@exemple.fr', 'free-phys', 'v1', true, 'iphash')),
  'produit physique gratuit sans livraison refusé');
insert into public.product_deliverables (product_id, storage_path, file_name) values ('44444444-4444-4444-4444-444444444442', 'e/ebook.pdf', 'ebook.pdf');

-- panier valide : lignes identiques fusionnées, prix recalculés par la base, livraison comptée une fois par produit physique
create temp table c1 as select * from public.create_cart_order(
  '[{"p":"44444444-4444-4444-4444-444444444441","q":2},{"p":"44444444-4444-4444-4444-444444444441","q":1},{"p":"44444444-4444-4444-4444-444444444442","q":1}]'::jsonb,
  'client@exemple.fr', 'v1', '2026-10', true, 'iphash');
select pg_temp.assert((select error is null from c1), 'panier valide accepté');
select pg_temp.assert((select subtotal_cents = 16200 and shipping_cents = 490 and amount_cents = 16690 and has_physical from c1), 'totaux recalculés (3 x 50 € + 12 € + 4,90 € de livraison)');
select pg_temp.assert((select count(*) = 2 from public.order_items where order_id = (select order_id from c1)), 'deux lignes après fusion');
select pg_temp.assert((select stock_qty = 0 from public.products where slug = 'casque-test'), 'stock réservé (3 → 0)');
select pg_temp.assert((select stock_reserved and status = 'pending' from public.orders where id = (select order_id from c1)), 'commande en attente avec réservation');

-- plus de stock : aucune survente, la commande n'est pas créée et le stock reste intact
create temp table c2 as select * from public.create_cart_order('[{"p":"44444444-4444-4444-4444-444444444441","q":1}]'::jsonb, 'autre@exemple.fr', 'v2', '2026-10', false, 'iphash');
select pg_temp.assert((select order_id is null and error like '%épuisé%' from c2), 'survente refusée (épuisé)');
select pg_temp.assert((select count(*) = 1 from public.orders where customer_email = 'client@exemple.fr') and (select count(*) = 0 from public.orders where customer_email = 'autre@exemple.fr'), 'aucune commande orpheline');

-- renonciation obligatoire pour un numérique payant
create temp table c3 as select * from public.create_cart_order('[{"p":"44444444-4444-4444-4444-444444444442","q":1}]'::jsonb, 'x@exemple.fr', 'v3', '2026-10', false, 'iphash');
select pg_temp.assert((select error like '%renonciation%' from c3), 'renonciation exigée');
-- quantité > 1 interdite pour un numérique ; produit inconnu refusé
select pg_temp.assert((select error like '%un exemplaire%' from public.create_cart_order('[{"p":"44444444-4444-4444-4444-444444444442","q":2}]'::jsonb, 'x@exemple.fr', 'v3', '2026-10', true, 'iphash')), 'un seul exemplaire d''un numérique');
select pg_temp.assert((select error like '%plus disponible%' from public.create_cart_order('[{"p":"99999999-9999-9999-9999-999999999999","q":1}]'::jsonb, 'x@exemple.fr', 'v3', '2026-10', true, 'iphash')), 'produit inconnu refusé');
-- le client ne peut pas imposer un prix : la base ignore tout champ « prix »
create temp table c4 as select * from public.create_cart_order('[{"p":"44444444-4444-4444-4444-444444444442","q":1,"price":1}]'::jsonb, 'y@exemple.fr', 'v4', '2026-10', true, 'iphash');
select pg_temp.assert((select amount_cents = 1200 from c4), 'prix imposé par le client ignoré');

-- expiration : la réservation est libérée, la commande annulée
update public.orders set reserved_until = now() - interval '1 minute' where id = (select order_id from c1);
select pg_temp.assert((select public.expire_stale_orders()) >= 1, 'expiration détectée');
select pg_temp.assert((select stock_qty = 3 from public.products where slug = 'casque-test'), 'stock rendu après expiration');
select pg_temp.assert((select status = 'canceled' and not stock_reserved from public.orders where id = (select order_id from c1)), 'commande expirée annulée');
select pg_temp.assert((select count(*) = 2 from public.stock_movements where reference = (select order_id::text from c1)), 'mouvements de stock journalisés (vente puis restitution)');

-- paiement : montant inattendu refusé, puis finalisation, jetons par ligne numérique uniquement, rejeu idempotent
create temp table c5 as select * from public.create_cart_order('[{"p":"44444444-4444-4444-4444-444444444442","q":1},{"p":"44444444-4444-4444-4444-444444444441","q":1}]'::jsonb, 'pay@exemple.fr', 'v5', '2026-10', true, 'iphash');
select pg_temp.assert((select result from public.fulfil_cart_order((select order_id from c5), 'cs_c5', 1, 'eur', 'pi_c5', 'pay@exemple.fr', now(), null, null)) = 'mismatch', 'montant inattendu refusé');
select pg_temp.assert((select needs_review and status = 'pending' from public.orders where id = (select order_id from c5)), 'commande signalée, non livrée');
select pg_temp.assert((select result from public.fulfil_cart_order((select order_id from c5), 'cs_c5', (select amount_cents from c5), 'eur', 'pi_c5', 'pay@exemple.fr', now(), null, null)) = 'fulfilled', 'commande finalisée');
select pg_temp.assert((select fulfilment = 'to_prepare' and not stock_reserved and status = 'paid' from public.orders where id = (select order_id from c5)), 'commande payée à préparer');
select pg_temp.assert((select count(*) = 1 from public.order_items where order_id = (select order_id from c5) and download_token is not null and kind = 'digital'), 'un jeton, pour la ligne numérique seulement');
select pg_temp.assert((select result from public.fulfil_cart_order((select order_id from c5), 'cs_c5', (select amount_cents from c5), 'eur', 'pi_c5', 'pay@exemple.fr', now(), null, null)) = 'already', 'rejeu idempotent');

-- téléchargement par ligne : limité exactement
update public.order_items set download_max = 2 where order_id = (select order_id from c5) and download_token is not null;
create temp table tok as select download_token as t from public.order_items where order_id = (select order_id from c5) and download_token is not null;
select pg_temp.assert((select count(*) = 1 from public.claim_item_download((select t from tok), 'h', 'ua')), 'téléchargement 1');
select pg_temp.assert((select count(*) = 1 from public.claim_item_download((select t from tok), 'h', 'ua')), 'téléchargement 2');
select pg_temp.assert((select count(*) = 0 from public.claim_item_download((select t from tok), 'h', 'ua')), 'téléchargement 3 refusé');
select public.release_item_download((select id from public.order_items where order_id = (select order_id from c5) and download_token is not null));
select pg_temp.assert((select count(*) = 1 from public.claim_item_download((select t from tok), 'h', 'ua')), 'téléchargement rendu puis réutilisable');
-- commande remboursée : plus de téléchargement
update public.orders set status = 'refunded' where id = (select order_id from c5);
select pg_temp.assert((select count(*) = 0 from public.claim_item_download((select t from tok), 'h', 'ua')), 'aucun téléchargement après remboursement');

-- catégorie non validée : achat refusé même si un produit y a été publié avant la validation
insert into public.products (id, slug, title, summary, kind, price_cents, status, category_id)
values ('44444444-4444-4444-4444-444444444444', 'creme-publiee', 'Crème', 'Un produit de test dans une famille réglementée.', 'physical', 1500, 'draft', (select id from public.categories where slug = 'beaute'));
alter table public.products disable trigger products_guard_sellable;
update public.products set status = 'published', published_at = now() where slug = 'creme-publiee';
alter table public.products enable trigger products_guard_sellable;
select pg_temp.assert((select error like '%pas disponible%' from public.create_cart_order('[{"p":"44444444-4444-4444-4444-444444444444","q":1}]'::jsonb, 'z@exemple.fr', 'v6', '2026-10', true, 'iphash')), 'famille non validée : achat refusé');
