-- Espace client : isolation des favoris et adresses (RLS), une seule demande de retour en cours par ligne.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

insert into auth.users (id) values ('55555555-5555-5555-5555-555555555551'), ('55555555-5555-5555-5555-555555555552') on conflict do nothing;
insert into public.favorites (user_id, product_id) values ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441');
insert into public.addresses (user_id, full_name, line1, postal_code, city) values ('55555555-5555-5555-5555-555555555551', 'Awa Test', '1 rue de Test', '75001', 'Paris');

-- chaque client ne voit que ses propres données
set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555552', true);
select pg_temp.assert((select count(*) = 0 from public.favorites), 'favoris d''un autre client invisibles');
select pg_temp.assert((select count(*) = 0 from public.addresses), 'adresses d''un autre client invisibles');
do $$ begin
  begin insert into public.favorites (user_id, product_id) values ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444442'); raise exception 'ÉCHEC : écriture au nom d''un autre client acceptée';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555551', true);
select pg_temp.assert((select count(*) = 1 from public.favorites), 'mes favoris visibles');
select pg_temp.assert((select count(*) = 1 from public.addresses), 'mes adresses visibles');
select pg_temp.assert((select count(*) = 0 from public.return_requests), 'demandes de retour invisibles pour un client');
reset role;

-- retours : une seule demande en cours par ligne
insert into public.return_requests (order_id, order_item_id, email, reason) select order_id, id, 'pay@exemple.fr', 'defective' from public.order_items where title = 'Casque de test' order by id limit 1;
do $$ begin
  begin insert into public.return_requests (order_id, order_item_id, email, reason) select order_id, id, 'pay@exemple.fr', 'other' from public.order_items where title = 'Casque de test' order by id limit 1; raise exception 'ÉCHEC : second retour en cours accepté';
  exception when unique_violation then null; end;
end $$;
update public.return_requests set status = 'refused';
select pg_temp.assert((select count(*) = 1 from (select 1 from public.return_requests) x), 'demande refusée conservée');
insert into public.return_requests (order_id, order_item_id, email, reason) select order_id, id, 'pay@exemple.fr', 'other' from public.order_items where title = 'Casque de test' order by id limit 1;
