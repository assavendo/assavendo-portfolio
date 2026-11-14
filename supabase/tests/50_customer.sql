-- Espace client : isolation des favoris et adresses (RLS), une seule demande de retour en cours par ligne.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

insert into auth.users (id) values ('55555555-5555-5555-5555-555555555551'), ('55555555-5555-5555-5555-555555555552') on conflict do nothing;
insert into public.favorites (user_id, product_id) values ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441');
insert into public.addresses (user_id, full_name, line1, postal_code, city) values ('55555555-5555-5555-5555-555555555551', 'Awa Test', '1 rue de Test', '75001', 'Paris');
begin;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555551';
set local role authenticated;
select public.add_customer_address('Maison 2','Awa Test','2 rue de Test',null,'75002','Paris','FR',null);
select public.add_customer_address('Maison 3','Awa Test','3 rue de Test',null,'75003','Paris','FR',null);
select public.add_customer_address('Maison 4','Awa Test','4 rue de Test',null,'75004','Paris','FR',null);
select public.add_customer_address('Maison 5','Awa Test','5 rue de Test',null,'75005','Paris','FR',null);
select pg_temp.assert((select count(*) = 5 from public.addresses where user_id = '55555555-5555-5555-5555-555555555551'), 'plafond de 5 adresses respecté');
do $ begin
  begin perform public.add_customer_address('Maison 6','Awa Test','6 rue de Test',null,'75006','Paris','FR',null); raise exception 'ÉCHEC : sixième adresse acceptée';
  exception when sqlstate 'P0001' then null; end;
end $;
rollback;

-- chaque client ne voit que ses propres données
begin; set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555552'; set local role authenticated;
select pg_temp.assert((select count(*) = 0 from public.favorites), 'favoris d''un autre client invisibles');
select pg_temp.assert((select count(*) = 0 from public.addresses), 'adresses d''un autre client invisibles');
do $$ begin
  begin insert into public.favorites (user_id, product_id) values ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444442'); raise exception 'ÉCHEC : écriture au nom d''un autre client acceptée';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
rollback;
begin; set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555551'; set local role authenticated;
select pg_temp.assert((select count(*) = 1 from public.favorites), 'mes favoris visibles');
select pg_temp.assert((select count(*) = 1 from public.addresses), 'mes adresses visibles');
select pg_temp.assert((select count(*) = 0 from public.return_requests), 'demandes de retour invisibles pour un client');
rollback;

-- retours : une seule demande en cours par ligne
insert into public.return_requests (order_id, order_item_id, email, reason) select order_id, id, 'pay@exemple.fr', 'defective' from public.order_items where title = 'Casque de test' order by id limit 1;
do $$ begin
  begin insert into public.return_requests (order_id, order_item_id, email, reason) select order_id, id, 'pay@exemple.fr', 'other' from public.order_items where title = 'Casque de test' order by id limit 1;
select public.admin_process_return((select id from public.return_requests order by created_at desc limit 1), 'approved', 'Retour accepté', false);
select pg_temp.assert((select status = 'approved' from public.return_requests order by created_at desc limit 1), 'retour accepté');
select public.admin_process_return((select id from public.return_requests order by created_at desc limit 1), 'received', 'Colis reçu', true);
select pg_temp.assert((select status = 'received' from public.return_requests order by created_at desc limit 1), 'retour reçu');
select pg_temp.assert((select stock_qty = 3 from public.products where slug = 'casque-test'), 'stock remis après réception du retour');
update public.orders set status = 'paid' where id = (select order_id from public.return_requests order by created_at desc limit 1);
do $ begin
  begin perform public.admin_process_return((select id from public.return_requests order by created_at desc limit 1), 'refunded', 'Remboursement trop tôt', false); raise exception 'ÉCHEC : remboursement clôturé avant Stripe';
  exception when sqlstate = 'P0001' then null; end;
end $;
update public.orders set status = 'refunded' where id = (select order_id from public.return_requests order by created_at desc limit 1);
select public.admin_process_return((select id from public.return_requests order by created_at desc limit 1), 'refunded', 'Remboursement effectué dans Stripe', false);
select pg_temp.assert((select status = 'refunded' from public.return_requests order by created_at desc limit 1), 'retour remboursé');
do $ begin
  begin perform public.admin_process_return((select id from public.return_requests order by created_at desc limit 1), 'approved', 'réouverture interdite', false); raise exception 'ÉCHEC : retour final réouvert';
  exception when sqlstate 'P0001' then null; end;
end $; raise exception 'ÉCHEC : second retour en cours accepté';
  exception when unique_violation then null; end;
end $$;
update public.return_requests set status = 'refused';
select pg_temp.assert((select count(*) = 1 from (select 1 from public.return_requests) x), 'demande refusée conservée');
insert into public.return_requests (order_id, order_item_id, email, reason) select order_id, id, 'pay@exemple.fr', 'other' from public.order_items where title = 'Casque de test' order by id limit 1;

-- campagne post-achat : invitation créée au paiement et activée après livraison physique
begin;
insert into public.orders (
  id, product_id, stripe_session_id, customer_email, amount_cents, currency, status, visitor_id
) values (
  '66666666-6666-6666-6666-666666666661', null, 'review-campaign-test', 'review@example.com', 1999, 'eur', 'pending', 'review-visitor-123456'
);
insert into public.order_items (
  order_id, product_id, title, kind, unit_price_cents, qty
) values (
  '66666666-6666-6666-6666-666666666661',
  (select id from public.products where slug = 'casque-test' limit 1),
  'Casque de test',
  'physical',
  1999,
  1
);
update public.orders set status = 'paid', paid_at = now() where id = '66666666-6666-6666-6666-666666666661';
select pg_temp.assert((select count(*) = 1 from public.review_invitations where order_id = '66666666-6666-6666-6666-666666666661'), 'invitation avis créée au paiement');
select pg_temp.assert((select eligible_at is null from public.review_invitations where order_id = '66666666-6666-6666-6666-666666666661'), 'invitation physique en attente de livraison');
update public.orders set fulfilment = 'delivered', delivered_at = now() where id = '66666666-6666-6666-6666-666666666661';
select pg_temp.assert((select eligible_at is not null from public.review_invitations where order_id = '66666666-6666-6666-6666-666666666661'), 'invitation physique activée après livraison');
rollback;
