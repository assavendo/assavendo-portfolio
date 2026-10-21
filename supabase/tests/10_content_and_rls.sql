-- Contenu, contraintes éditoriales et accès (RLS) après migrations + seed.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

-- 1. Réconciliation : l'ancien contenu est archivé (jamais supprimé), le contenu rédigé est publié, le reste est en brouillon
select pg_temp.assert((select count(*) from public.problems where status = 'archived' and slug ~ '^p[0-9]{2,3}-') = 100, '100 fiches numérotées archivées');
select pg_temp.assert((select count(*) from public.problems_backup_20261019) = 100, 'sauvegarde interne complète');
select pg_temp.assert((select count(*) from public.problems where status = 'published') = 14, '14 fiches publiées');
select pg_temp.assert((select count(*) from public.problems where status = 'draft') = 86, '86 brouillons');
select pg_temp.assert((select count(*) from public.problems where status = 'published' and format = 'tool') = 9, '9 fiches publiées avec outil');
select pg_temp.assert((select count(*) from public.problems where format = 'tool' and tool_key not in (select key from public.tool_keys)) = 0, 'aucune clé d''outil inconnue');
select pg_temp.assert((select count(*) from public.problems where status = 'published' and (hook = '' or symptom = '' or cost = '' or cause = '' or what_we_do = '' or outcome = '' or cardinality(deliverables) = 0)) = 0, 'aucune fiche publiée incomplète');
select pg_temp.assert((select count(*) from public.problems where status <> 'archived' and slug ~ '(^|-)[0-9]+(-|$)') = 0, 'aucun slug numéroté actif');
select pg_temp.assert((select count(*) from public.problems where status = 'published' and symptom = cost) = 0, 'symptôme ≠ coût');

-- 2. Rejeux idempotents : le seed ne republie ni n'écrase
update public.problems set title = 'Titre retouché en administration' where slug = 'site-invisible-sur-google';
\i supabase/seed/001_contenu.sql
select pg_temp.assert((select title from public.problems where slug = 'site-invisible-sur-google') = 'Titre retouché en administration', 'le seed n''écrase pas les retouches');
select pg_temp.assert((select count(*) from public.problems where status = 'published') = 14, 'le seed ne publie rien de plus');

-- 3. Les contraintes refusent le contenu invalide
do $$ begin
  begin insert into public.problems (slug, title, status) values ('fiche-vide-publiee', 'Fiche vide publiée', 'published'); raise exception 'AURAIT DÛ ÉCHOUER (fiche vide publiée)';
  exception when check_violation then null; end;
  begin insert into public.problems (slug, title) values ('p77-nouvelle-fiche', 'Nouvelle fiche numérotée'); raise exception 'AURAIT DÛ ÉCHOUER (slug numéroté)';
  exception when check_violation then null; end;
  begin insert into public.problems (slug, title) values ('fiche-3-etapes', 'Fiche avec numéro isolé'); raise exception 'AURAIT DÛ ÉCHOUER (numéro isolé)';
  exception when check_violation then null; end;
  begin insert into public.problems (slug, title, format, tool_key) values ('outil-fantome', 'Outil fantôme', 'tool', 'inexistant'); raise exception 'AURAIT DÛ ÉCHOUER (outil inconnu)';
  exception when foreign_key_violation then null; end;
  begin insert into public.problems (slug, title, format, tool_key) values ('explication-avec-outil', 'Explication avec outil', 'study', 'seo'); raise exception 'AURAIT DÛ ÉCHOUER (étude avec outil)';
  exception when check_violation then null; end;
end $$;

-- 4. Accès par rôle (RLS)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@exemple.fr'), ('00000000-0000-0000-0000-0000000000b2', 'client@exemple.fr') on conflict do nothing;
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;

begin; set local role anon;
  select pg_temp.assert((select count(*) from public.problems) = 14, 'anonyme : 14 fiches publiées seulement');
  select pg_temp.assert((select count(*) from public.domains) = 10, 'anonyme : 10 domaines');
  do $$ begin begin perform 1 from public.orders limit 1; raise exception 'AURAIT DÛ ÉCHOUER'; exception when insufficient_privilege then null; end; end $$;
  do $$ begin begin perform 1 from public.contact_messages limit 1; raise exception 'AURAIT DÛ ÉCHOUER'; exception when insufficient_privilege then null; end; end $$;
  do $$ begin begin perform public.rate_limit_hit('x', 1, 1); raise exception 'AURAIT DÛ ÉCHOUER'; exception when insufficient_privilege then null; end; end $$;
  do $$ begin begin perform * from public.claim_download('x'); raise exception 'AURAIT DÛ ÉCHOUER'; exception when insufficient_privilege then null; end; end $$;
rollback;

begin; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2'; set local role authenticated;
  select pg_temp.assert((select count(*) from public.problems) = 14, 'connecté non admin : 14 fiches');
  do $$ begin begin update public.problems set title = 'piratage' where slug = 'site-invisible-sur-google'; if found then raise exception 'AURAIT DÛ ÊTRE REFUSÉ'; end if; exception when insufficient_privilege then null; end; end $$;
  do $$ begin begin insert into public.domains (slug, name) values ('pirate', 'Pirate'); raise exception 'AURAIT DÛ ÉCHOUER'; exception when insufficient_privilege or others then if sqlerrm like 'AURAIT%' then raise; end if; end; end $$;
rollback;

begin; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1'; set local role authenticated;
  select pg_temp.assert((select count(*) from public.problems) = 200, 'admin : voit les 200 fiches (publiées, brouillons, archivées)');
  update public.problems set title = 'Titre modifié par l''administrateur' where slug = 'site-invisible-sur-google';
  select pg_temp.assert((select count(*) from public.problem_versions) >= 1, 'une version est enregistrée à chaque modification');
rollback;

-- 5. Planification de publication
update public.problems set publish_at = now() + interval '1 day' where slug = 'site-vulnerable-en-tetes-de-securite';
begin; set local role anon;
  select pg_temp.assert((select count(*) from public.problems) = 13, 'fiche planifiée invisible avant sa date');
rollback;
update public.problems set publish_at = null where slug = 'site-vulnerable-en-tetes-de-securite';
