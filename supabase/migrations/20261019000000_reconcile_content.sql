-- Assavendo : réconciliation du contenu et garde-fous éditoriaux (audit du 19 octobre 2026, E01-E04)
--
-- Cette migration est NON DESTRUCTIVE et RÉVERSIBLE :
--   1. sauvegarde interne de public.problems (table problems_backup_20261019) ;
--   2. archivage (pas de suppression) des fiches importées avec adresse numérotée (p01-…) ;
--   3. correction des clés d'outil invalides ;
--   4. contraintes qui interdisent désormais une fiche publiée incomplète, une clé d'outil inconnue ou un slug numéroté.
-- Retour arrière : supabase/rollbacks/20261019000000_reconcile_content.down.sql
-- À exécuter d'abord sur une préproduction, après une sauvegarde complète de la base.

begin;

-- 1. Sauvegarde interne (aucun accès via l'API : RLS activée sans politique, droits retirés)
create table if not exists public.problems_backup_20261019 as table public.problems;
alter table public.problems_backup_20261019 enable row level security;
revoke all on public.problems_backup_20261019 from anon, authenticated;
comment on table public.problems_backup_20261019 is
  'Sauvegarde de public.problems avant la réconciliation du 19/10/2026. RLS sans politique : accès réservé au rôle service_role.';

-- 2. Référentiel des outils réellement construits (synchronisé avec lib/tool-keys.ts)
create table if not exists public.tool_keys (key text primary key);
alter table public.tool_keys enable row level security;
create policy "lecture publique des outils" on public.tool_keys for select to anon, authenticated using (true);
grant select on public.tool_keys to anon, authenticated;
insert into public.tool_keys (key) values
  ('seo'), ('headers'), ('email-auth'), ('roas'), ('cart'), ('abtest'), ('password-leak'), ('image-compress')
on conflict do nothing;
comment on table public.tool_keys is 'Outils interactifs opérationnels. Ajouter une ligne ici SEULEMENT quand l''outil existe dans le code.';

-- 3. Archivage non destructif des fiches importées avec une adresse numérotée
update public.problems
   set status = 'archived', published_at = null
 where slug ~ '^p[0-9]{1,3}-' and status <> 'archived';

-- 4. Aucune fiche restante ne peut référencer un outil inconnu
update public.problems
   set format = 'study', tool_key = null
 where tool_key is not null and tool_key not in (select key from public.tool_keys);
update public.problems set tool_key = null where format <> 'tool' and tool_key is not null;

-- 5. Contraintes
alter table public.problems drop constraint if exists tool_requires_key;
alter table public.problems add constraint problems_tool_format_ck check ((format = 'tool') = (tool_key is not null));
alter table public.problems add constraint problems_tool_key_fk foreign key (tool_key) references public.tool_keys(key) on update cascade;

-- Aucune adresse numérotée à l'avenir (les anciennes lignes archivées restent lisibles : contrainte NOT VALID)
alter table public.problems add constraint problems_slug_no_number_ck
  check (slug !~ '^p[0-9]{1,3}-' and slug !~ '(^|-)[0-9]+(-|$)') not valid;

-- Une fiche publiée est COMPLÈTE : champs métier renseignés, livrables présents, public choisi, symptôme ≠ coût
alter table public.problems add constraint problems_published_complete_ck check (
  status <> 'published' or (
    btrim(hook) <> '' and btrim(who) <> '' and btrim(symptom) <> '' and btrim(cost) <> '' and btrim(cause) <> ''
    and btrim(what_we_do) <> '' and btrim(outcome) <> ''
    and cardinality(deliverables) > 0 and cardinality(audiences) > 0
    and btrim(symptom) <> btrim(cost)
  )
);

commit;
