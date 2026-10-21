-- Commandes : finalisation atomique, montants contrôlés, téléchargements limités et expirants.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

insert into public.products (id, slug, title, summary, price_cents, status, published_at)
values ('11111111-1111-1111-1111-111111111111', 'guide-test', 'Guide de test', 'Un guide numérique pour les tests.', 1900, 'published', now());
insert into public.product_deliverables (product_id, storage_path, file_name) values ('11111111-1111-1111-1111-111111111111', 'guide/test.pdf', 'guide.pdf');

-- commande créée AVANT la session Stripe : sans stripe_session_id
insert into public.orders (id, product_id, customer_email, amount_cents, status) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'client@exemple.fr', 1900, 'pending');

-- commande introuvable
select pg_temp.assert((select result from public.fulfil_order('99999999-9999-9999-9999-999999999999', 'cs_x', 1900, 'eur', 'pi_x', 'a@b.fr', now(), null, null)) = 'not_found', 'commande introuvable détectée');

-- montant inattendu : jamais livré, signalé à l'administrateur
select pg_temp.assert((select result from public.fulfil_order('22222222-2222-2222-2222-222222222222', 'cs_1', 100, 'eur', 'pi_1', 'client@exemple.fr', now(), null, null)) = 'mismatch', 'montant inattendu refusé');
select pg_temp.assert((select needs_review and download_token is null and status = 'pending' from public.orders where id = '22222222-2222-2222-2222-222222222222'), 'commande signalée, non livrée');
select pg_temp.assert((select result from public.fulfil_order('22222222-2222-2222-2222-222222222222', 'cs_1', 1900, 'usd', 'pi_1', 'client@exemple.fr', now(), null, null)) = 'mismatch', 'devise inattendue refusée');

-- paiement conforme : livrée une seule fois, jeton fort, expiration posée
create temp table r1 as select * from public.fulfil_order('22222222-2222-2222-2222-222222222222', 'cs_1', 1900, 'eur', 'pi_1', 'client@exemple.fr', now(), '{"name":"Test"}'::jsonb, null, 30);
select pg_temp.assert((select result from r1) = 'fulfilled', 'commande finalisée');
select pg_temp.assert((select length(download_token) from r1) = 64, 'jeton de 64 caractères');
select pg_temp.assert((select expires_at > now() + interval '29 days' and stripe_session_id = 'cs_1' and status = 'paid' from public.orders where id = '22222222-2222-2222-2222-222222222222'), 'expiration et session enregistrées');
-- rejeu du même événement : idempotent, même jeton
select pg_temp.assert((select download_token from public.fulfil_order('22222222-2222-2222-2222-222222222222', 'cs_1', 1900, 'eur', 'pi_1', 'client@exemple.fr', now(), null, null)) = (select download_token from r1), 'rejeu idempotent');

-- téléchargements : limite exacte
update public.orders set download_max = 2 where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from public.claim_download((select download_token from r1), 'iphash', 'agent')) = 1, 'téléchargement 1');
select pg_temp.assert((select count(*) from public.claim_download((select download_token from r1), 'iphash', 'agent')) = 1, 'téléchargement 2');
select pg_temp.assert((select count(*) from public.claim_download((select download_token from r1), 'iphash', 'agent')) = 0, 'téléchargement 3 refusé');
select pg_temp.assert((select count(*) from public.order_downloads) = 2, 'journal des accès');
select public.release_download('22222222-2222-2222-2222-222222222222');
select pg_temp.assert((select count(*) from public.claim_download((select download_token from r1))) = 1, 'téléchargement rendu après échec du lien signé');

-- expiration
update public.orders set expires_at = now() - interval '1 minute', download_count = 0 where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from public.claim_download((select download_token from r1))) = 0, 'lien expiré refusé');
-- révocation
update public.orders set expires_at = now() + interval '1 day', download_token = null where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from public.claim_download('inexistant')) = 0, 'jeton inconnu refusé');

-- remboursement avant livraison : ignoré
insert into public.orders (id, product_id, customer_email, amount_cents, status) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'r@exemple.fr', 1900, 'refunded');
select pg_temp.assert((select result from public.fulfil_order('33333333-3333-3333-3333-333333333333', 'cs_2', 1900, 'eur', 'pi_2', 'r@exemple.fr', now(), null, null)) = 'ignored', 'commande remboursée jamais livrée');

-- effacement des données personnelles
insert into public.contact_messages (name, email, message) values ('Test', 'client@exemple.fr', 'Message de test assez long');
select pg_temp.assert(jsonb_array_length((public.export_personal_data('CLIENT@exemple.fr'))->'messages') = 1, 'export des données');
select pg_temp.assert((select contacts_deleted = 1 and orders_anonymised >= 1 from public.erase_personal_data('client@exemple.fr')), 'effacement des données');
select pg_temp.assert((select count(*) from public.orders where customer_email = 'client@exemple.fr') = 0, 'e-mail anonymisé dans les commandes');

-- nettoyage de la limitation de débit
select pg_temp.assert(public.rate_limit_hit('k', 2, 60) and public.rate_limit_hit('k', 2, 60) and not public.rate_limit_hit('k', 2, 60), 'limite de débit');

-- scénario concurrent préparé pour scripts/test-db.sh
insert into public.orders (id, product_id, customer_email, amount_cents, status, download_token, download_max, expires_at)
values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'c@exemple.fr', 1900, 'paid', 'tokenconcurrent0000000000000000000000000', 3, now() + interval '1 day');
