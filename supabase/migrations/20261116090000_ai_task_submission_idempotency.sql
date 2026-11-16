-- Empêche les doubles soumissions du Centre IA.
-- Une soumission de formulaire possède un identifiant unique, partagé par les éventuels retries navigateur.
begin;

alter table public.ai_tasks
  add column if not exists submission_id uuid;

create unique index if not exists ai_tasks_submission_id_uidx
  on public.ai_tasks (submission_id)
  where submission_id is not null;

commit;
