-- Reste à appliquer en production (le reste de commerce_and_ops et pagespeed est déjà appliqué le 20/10/2026).
-- Rejouable sans erreur (idempotent). À coller dans Supabase > SQL Editor (projet « assavendo », eu-west-3).
begin;
create or replace function public.snapshot_problem() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.problem_versions (problem_id, snapshot) values (old.id, to_jsonb(old));
  delete from public.problem_versions where problem_id = old.id
    and id not in (select id from public.problem_versions where problem_id = old.id order by created_at desc, id desc limit 30);
  return new;
end $$;
revoke all on function public.snapshot_problem() from public, anon, authenticated;
drop trigger if exists problems_snapshot on public.problems;
drop trigger if exists problems_snapshot on public.problems;
create trigger problems_snapshot before update on public.problems for each row
  when (old.* is distinct from new.*) execute function public.snapshot_problem();
-- =====================================================================  POLITIQUES RLS FUSIONNÉES (E27)
-- Une seule politique SELECT par rôle et par table : plus de « politiques permissives multiples ».
drop policy if exists "lecture publique des problèmes publiés" on public.problems;
drop policy if exists "admin lit tous les problèmes" on public.problems;
drop policy if exists "problèmes publiés visibles (anonyme)" on public.problems;
create policy "problèmes publiés visibles (anonyme)" on public.problems for select to anon
  using (status = 'published' and (publish_at is null or publish_at <= now()));
drop policy if exists "problèmes visibles (connecté)" on public.problems;
create policy "problèmes visibles (connecté)" on public.problems for select to authenticated
  using ((status = 'published' and (publish_at is null or publish_at <= now())) or (select public.is_admin()));

drop policy if exists "lecture publique des produits publiés" on public.products;
drop policy if exists "admin lit tous les produits" on public.products;
drop policy if exists "produits publiés visibles (anonyme)" on public.products;
create policy "produits publiés visibles (anonyme)" on public.products for select to anon using (status = 'published');
drop policy if exists "produits visibles (connecté)" on public.products;
create policy "produits visibles (connecté)" on public.products for select to authenticated
  using (status = 'published' or (select public.is_admin()));

drop policy if exists "lecture publique des domaines" on public.domains;
drop policy if exists "admin gère les domaines" on public.domains;
drop policy if exists "domaines visibles" on public.domains;
create policy "domaines visibles" on public.domains for select to anon, authenticated using (true);
drop policy if exists "admin crée les domaines" on public.domains;
create policy "admin crée les domaines" on public.domains for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les domaines" on public.domains;
create policy "admin modifie les domaines" on public.domains for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les domaines" on public.domains;
create policy "admin supprime les domaines" on public.domains for delete to authenticated using ((select public.is_admin()));

drop policy if exists "lecture des commentaires approuvés" on public.product_comments;
drop policy if exists "admin modère les commentaires" on public.product_comments;
drop policy if exists "commentaires approuvés (anonyme)" on public.product_comments;
create policy "commentaires approuvés (anonyme)" on public.product_comments for select to anon using (status = 'approved');
drop policy if exists "commentaires visibles (connecté)" on public.product_comments;
create policy "commentaires visibles (connecté)" on public.product_comments for select to authenticated using (status = 'approved' or (select public.is_admin()));
drop policy if exists "admin crée les commentaires" on public.product_comments;
create policy "admin crée les commentaires" on public.product_comments for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les commentaires" on public.product_comments;
create policy "admin modifie les commentaires" on public.product_comments for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les commentaires" on public.product_comments;
create policy "admin supprime les commentaires" on public.product_comments for delete to authenticated using ((select public.is_admin()));

drop policy if exists "lecture des avis approuvés" on public.product_reviews;
drop policy if exists "admin modère les avis" on public.product_reviews;
drop policy if exists "avis approuvés (anonyme)" on public.product_reviews;
create policy "avis approuvés (anonyme)" on public.product_reviews for select to anon using (status = 'approved');
drop policy if exists "avis visibles (connecté)" on public.product_reviews;
create policy "avis visibles (connecté)" on public.product_reviews for select to authenticated using (status = 'approved' or (select public.is_admin()));
drop policy if exists "admin crée les avis" on public.product_reviews;
create policy "admin crée les avis" on public.product_reviews for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les avis" on public.product_reviews;
create policy "admin modifie les avis" on public.product_reviews for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les avis" on public.product_reviews;
create policy "admin supprime les avis" on public.product_reviews for delete to authenticated using ((select public.is_admin()));

-- Livrables : politique « all » scindée pour éviter le chevauchement du SELECT
drop policy if exists "admin gère les livrables de produit" on public.product_deliverables;
drop policy if exists "admin lit les livrables de produit" on public.product_deliverables;
create policy "admin lit les livrables de produit" on public.product_deliverables for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin crée les livrables de produit" on public.product_deliverables;
create policy "admin crée les livrables de produit" on public.product_deliverables for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "admin modifie les livrables de produit" on public.product_deliverables;
create policy "admin modifie les livrables de produit" on public.product_deliverables for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les livrables de produit" on public.product_deliverables;
create policy "admin supprime les livrables de produit" on public.product_deliverables for delete to authenticated using ((select public.is_admin()));

drop policy if exists "admin gère les messages" on public.contact_messages;
drop policy if exists "admin lit les messages" on public.contact_messages;
create policy "admin lit les messages" on public.contact_messages for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin modifie les messages" on public.contact_messages;
create policy "admin modifie les messages" on public.contact_messages for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin supprime les messages" on public.contact_messages;
create policy "admin supprime les messages" on public.contact_messages for delete to authenticated using ((select public.is_admin()));
-- (les messages sont créés par le serveur avec la clé de service ; aucune politique d'insertion publique n'est nécessaire)
-- =====================================================================  TABLES VOLONTAIREMENT SANS POLITIQUE (E28)
comment on table public.product_likes   is 'RLS activée SANS politique : accès exclusivement serveur (service_role). Ne pas ajouter de politique publique.';
comment on table public.product_shares  is 'RLS activée SANS politique : accès exclusivement serveur (service_role). Ne pas ajouter de politique publique.';
comment on table public.rate_limits     is 'RLS activée SANS politique : accès exclusivement serveur via rate_limit_hit(). Ne pas ajouter de politique publique.';
comment on table public.stripe_events   is 'RLS activée SANS politique : accès exclusivement serveur (webhook Stripe). Ne pas ajouter de politique publique.';
-- =====================================================================  CONSERVATION ET EFFACEMENT DES DONNÉES (E31)
-- Messages de contact archivés : supprimés après 24 mois. Commandes : conservées pour la comptabilité, e-mails anonymisés après 10 ans.
create or replace function public.purge_expired_personal_data(p_contact_months int default 24, p_order_years int default 10)
returns table (contacts_deleted int, orders_anonymised int)
language plpgsql security invoker set search_path = '' as $$
declare c int; o int;
begin
  delete from public.contact_messages where status = 'archived' and created_at < now() - make_interval(months => p_contact_months);
  get diagnostics c = row_count;
  update public.orders set customer_email = 'efface+' || id || '@invalid', shipping = null, billing = null
   where created_at < now() - make_interval(years => p_order_years) and customer_email not like 'efface+%@invalid';
  get diagnostics o = row_count;
  return query select c, o;
end $$;
revoke all on function public.purge_expired_personal_data(int, int) from public, anon, authenticated;
grant execute on function public.purge_expired_personal_data(int, int) to service_role;

-- Demande d'effacement d'une personne : supprime ses messages, anonymise ses commandes (les montants restent pour la comptabilité)
create or replace function public.erase_personal_data(p_email text)
returns table (contacts_deleted int, orders_anonymised int)
language plpgsql security invoker set search_path = '' as $$
declare c int; o int;
begin
  delete from public.contact_messages where lower(email) = lower(btrim(p_email));
  get diagnostics c = row_count;
  update public.orders set customer_email = 'efface+' || id || '@invalid', shipping = null, billing = null, download_token = null
   where lower(customer_email) = lower(btrim(p_email));
  get diagnostics o = row_count;
  return query select c, o;
end $$;
revoke all on function public.erase_personal_data(text) from public, anon, authenticated;
grant execute on function public.erase_personal_data(text) to service_role;

create or replace function public.export_personal_data(p_email text) returns jsonb
language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'messages', coalesce((select jsonb_agg(to_jsonb(m) - 'id') from public.contact_messages m where lower(m.email) = lower(btrim(p_email))), '[]'::jsonb),
    'commandes', coalesce((select jsonb_agg(to_jsonb(o) - 'download_token' - 'consent_ip_hash') from public.orders o where lower(o.customer_email) = lower(btrim(p_email))), '[]'::jsonb));
$$;
revoke all on function public.export_personal_data(text) from public, anon, authenticated;
grant execute on function public.export_personal_data(text) to service_role;

-- Planification automatique si pg_cron est activé (Database > Extensions) ; sinon appeler les fonctions depuis une tâche externe.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('assavendo-purge', '17 3 * * *', 'select public.rate_limit_purge(); select public.purge_expired_personal_data();');
  end if;
end $$;
commit;
