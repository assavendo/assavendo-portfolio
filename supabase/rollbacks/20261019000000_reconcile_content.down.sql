-- Retour arrière de 20261019000000_reconcile_content.sql
-- Restaure statut et date de publication depuis la sauvegarde interne, puis retire les garde-fous.
begin;
alter table public.problems drop constraint if exists problems_published_complete_ck;
alter table public.problems drop constraint if exists problems_slug_no_number_ck;
alter table public.problems drop constraint if exists problems_tool_key_fk;
alter table public.problems drop constraint if exists problems_tool_format_ck;
alter table public.problems add constraint tool_requires_key check (format <> 'tool' or tool_key is not null);

update public.problems p
   set status = b.status, published_at = b.published_at, format = b.format, tool_key = b.tool_key
  from public.problems_backup_20261019 b
 where b.id = p.id;

drop table if exists public.tool_keys cascade;
-- La table problems_backup_20261019 est conservée volontairement : supprimez-la à la main une fois la situation validée.
commit;
