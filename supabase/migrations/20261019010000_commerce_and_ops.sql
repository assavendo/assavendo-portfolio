-- Assavendo : commandes fiables, téléchargements atomiques, conformité, politiques RLS fusionnées, exploitation
-- (audit du 19 octobre 2026 : E06-E08, E21, E23, E26-E31)
-- Retour arrière : supabase/rollbacks/20261019010000_commerce_and_ops.down.sql
-- À exécuter sur une préproduction après sauvegarde. Aucune ligne existante n'est supprimée.

begin;

-- =====================================================================  COMMANDES
alter table public.orders alter column stripe_session_id drop not null;   -- la commande existe AVANT la session Stripe
alter table public.orders
  add column if not exists expires_at timestamptz,
  add column if not exists download_max int not null default 5 check (download_max between 1 and 100),
  add column if not exists last_download_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists visitor_id text,
  add column if not exists consent_terms_version text,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_digital_waiver boolean not null default false,
  add column if not exists consent_ip_hash text,
  add column if not exists shipping jsonb,
  add column if not exists billing jsonb,
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_note text;

create index if not exists orders_product_id_idx on public.orders (product_id);                -- E26
create index if not exists orders_visitor_idx on public.orders (visitor_id) where visitor_id is not null;
create index if not exists orders_email_idx on public.orders (lower(customer_email));
create index if not exists orders_review_idx on public.orders (created_at desc) where needs_review;
create index if not exists product_comments_parent_idx on public.product_comments (parent_id);  -- E26

-- Journal des accès aux téléchargements (empreinte d'IP seulement)
create table if not exists public.order_downloads (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists order_downloads_order_idx on public.order_downloads (order_id, created_at desc);
alter table public.order_downloads enable row level security;
create policy "admin lit le journal des téléchargements" on public.order_downloads for select to authenticated using ((select public.is_admin()));
grant select on public.order_downloads to authenticated;

-- L'administrateur peut révoquer ou prolonger un lien et résoudre une alerte, rien d'autre (droits par colonne)
create policy "admin met à jour les commandes" on public.orders for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (download_token, expires_at, download_max, needs_review, review_note) on public.orders to authenticated;

-- ---------------------------------------------------------------------  finalisation atomique d'une commande payée
-- Appelée par le webhook Stripe (rôle service_role). Verrouille la commande, contrôle montant et devise, génère le jeton.
create or replace function public.fulfil_order(
  p_order_id uuid, p_session_id text, p_amount int, p_currency text, p_payment_intent text,
  p_email text, p_paid_at timestamptz, p_shipping jsonb, p_billing jsonb, p_ttl_days int default 30
) returns table (result text, order_id uuid, download_token text, customer_email text, product_id uuid, email_sent boolean)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare o public.orders%rowtype;
begin
  select * into o from public.orders x where x.id = p_order_id for update;
  if not found then
    return query select 'not_found'::text, p_order_id, null::text, null::text, null::uuid, false; return;
  end if;
  if o.status = 'refunded' then
    return query select 'ignored'::text, o.id, null::text, o.customer_email, o.product_id, o.email_sent_at is not null; return;
  end if;
  if o.amount_cents <> p_amount or lower(o.currency) <> lower(p_currency) then
    update public.orders set needs_review = true,
      review_note = format('Montant ou devise inattendus : attendu %s %s, reçu %s %s', o.amount_cents, o.currency, p_amount, p_currency)
      where id = o.id;
    return query select 'mismatch'::text, o.id, null::text, o.customer_email, o.product_id, false; return;
  end if;
  if o.status = 'paid' and o.download_token is not null then
    return query select 'already'::text, o.id, o.download_token, o.customer_email, o.product_id, o.email_sent_at is not null; return;
  end if;
  update public.orders set
    status = 'paid', paid_at = coalesce(p_paid_at, now()), payment_intent_id = coalesce(p_payment_intent, payment_intent_id),
    stripe_session_id = coalesce(stripe_session_id, p_session_id), customer_email = coalesce(nullif(btrim(p_email), ''), customer_email),
    download_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    expires_at = now() + make_interval(days => greatest(p_ttl_days, 1)),
    shipping = coalesce(p_shipping, shipping), billing = coalesce(p_billing, billing)
  where id = o.id returning * into o;
  return query select 'fulfilled'::text, o.id, o.download_token, o.customer_email, o.product_id, false;
end $$;
revoke all on function public.fulfil_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int) from public, anon, authenticated;
grant execute on function public.fulfil_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int) to service_role;

-- ---------------------------------------------------------------------  téléchargement atomique (E07)
-- Contrôle ET incrément en une seule instruction : deux requêtes simultanées ne peuvent pas dépasser la limite.
create or replace function public.claim_download(p_token text, p_ip_hash text default null, p_user_agent text default null)
returns table (storage_path text, file_name text, order_id uuid)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare r record;
begin
  update public.orders o set download_count = o.download_count + 1, last_download_at = now()
    from public.product_deliverables d
   where d.product_id = o.product_id and o.download_token = p_token and o.status = 'paid'
     and o.download_count < o.download_max and (o.expires_at is null or o.expires_at > now())
  returning d.storage_path as sp, d.file_name as fn, o.id as oid into r;
  if r.oid is null then return; end if;
  insert into public.order_downloads (order_id, ip_hash, user_agent) values (r.oid, p_ip_hash, left(p_user_agent, 300));
  return query select r.sp, r.fn, r.oid;
end $$;
revoke all on function public.claim_download(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_download(text, text, text) to service_role;

-- Rend un téléchargement consommé quand la génération du lien signé a échoué
create or replace function public.release_download(p_order_id uuid) returns void
language sql security invoker set search_path = '' as $$
  update public.orders set download_count = greatest(download_count - 1, 0) where id = p_order_id;
$$;
revoke all on function public.release_download(uuid) from public, anon, authenticated;
grant execute on function public.release_download(uuid) to service_role;

-- =====================================================================  PARTAGES (E23)
alter table public.product_shares add column if not exists visitor_id text;
create unique index if not exists product_shares_once_idx on public.product_shares (product_id, visitor_id, channel) where visitor_id is not null;

-- =====================================================================  LIMITATION DE DÉBIT (E29)
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  if random() < 0.01 then  -- nettoyage occasionnel (≈ 1 appel sur 100) au lieu d'une suppression à chaque appel
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

create or replace function public.rate_limit_purge() returns void
language sql security invoker set search_path = '' as $$ delete from public.rate_limits where window_start < now() - interval '1 day'; $$;
revoke all on function public.rate_limit_purge() from public, anon, authenticated;
grant execute on function public.rate_limit_purge() to service_role;

-- =====================================================================  FICHES : SEO, PLANIFICATION, VERSIONS (E25)
alter table public.problems
  add column if not exists seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  add column if not exists seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  add column if not exists publish_at timestamptz;

create table if not exists public.problem_versions (
  id bigint generated always as identity primary key,
  problem_id uuid not null references public.problems(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists problem_versions_idx on public.problem_versions (problem_id, created_at desc);
alter table public.problem_versions enable row level security;
create policy "admin lit les versions" on public.problem_versions for select to authenticated using ((select public.is_admin()));
grant select on public.problem_versions to authenticated;

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
create trigger problems_snapshot before update on public.problems for each row
  when (old.* is distinct from new.*) execute function public.snapshot_problem();

-- =====================================================================  POLITIQUES RLS FUSIONNÉES (E27)
-- Une seule politique SELECT par rôle et par table : plus de « politiques permissives multiples ».
drop policy if exists "lecture publique des problèmes publiés" on public.problems;
drop policy if exists "admin lit tous les problèmes" on public.problems;
create policy "problèmes publiés visibles (anonyme)" on public.problems for select to anon
  using (status = 'published' and (publish_at is null or publish_at <= now()));
create policy "problèmes visibles (connecté)" on public.problems for select to authenticated
  using ((status = 'published' and (publish_at is null or publish_at <= now())) or (select public.is_admin()));

drop policy if exists "lecture publique des produits publiés" on public.products;
drop policy if exists "admin lit tous les produits" on public.products;
create policy "produits publiés visibles (anonyme)" on public.products for select to anon using (status = 'published');
create policy "produits visibles (connecté)" on public.products for select to authenticated
  using (status = 'published' or (select public.is_admin()));

drop policy if exists "lecture publique des domaines" on public.domains;
drop policy if exists "admin gère les domaines" on public.domains;
create policy "domaines visibles" on public.domains for select to anon, authenticated using (true);
create policy "admin crée les domaines" on public.domains for insert to authenticated with check ((select public.is_admin()));
create policy "admin modifie les domaines" on public.domains for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin supprime les domaines" on public.domains for delete to authenticated using ((select public.is_admin()));

drop policy if exists "lecture des commentaires approuvés" on public.product_comments;
drop policy if exists "admin modère les commentaires" on public.product_comments;
create policy "commentaires approuvés (anonyme)" on public.product_comments for select to anon using (status = 'approved');
create policy "commentaires visibles (connecté)" on public.product_comments for select to authenticated using (status = 'approved' or (select public.is_admin()));
create policy "admin crée les commentaires" on public.product_comments for insert to authenticated with check ((select public.is_admin()));
create policy "admin modifie les commentaires" on public.product_comments for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin supprime les commentaires" on public.product_comments for delete to authenticated using ((select public.is_admin()));

drop policy if exists "lecture des avis approuvés" on public.product_reviews;
drop policy if exists "admin modère les avis" on public.product_reviews;
create policy "avis approuvés (anonyme)" on public.product_reviews for select to anon using (status = 'approved');
create policy "avis visibles (connecté)" on public.product_reviews for select to authenticated using (status = 'approved' or (select public.is_admin()));
create policy "admin crée les avis" on public.product_reviews for insert to authenticated with check ((select public.is_admin()));
create policy "admin modifie les avis" on public.product_reviews for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin supprime les avis" on public.product_reviews for delete to authenticated using ((select public.is_admin()));

-- Livrables : politique « all » scindée pour éviter le chevauchement du SELECT
drop policy if exists "admin gère les livrables de produit" on public.product_deliverables;
create policy "admin lit les livrables de produit" on public.product_deliverables for select to authenticated using ((select public.is_admin()));
create policy "admin crée les livrables de produit" on public.product_deliverables for insert to authenticated with check ((select public.is_admin()));
create policy "admin modifie les livrables de produit" on public.product_deliverables for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin supprime les livrables de produit" on public.product_deliverables for delete to authenticated using ((select public.is_admin()));

drop policy if exists "admin gère les messages" on public.contact_messages;
create policy "admin lit les messages" on public.contact_messages for select to authenticated using ((select public.is_admin()));
create policy "admin modifie les messages" on public.contact_messages for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
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
