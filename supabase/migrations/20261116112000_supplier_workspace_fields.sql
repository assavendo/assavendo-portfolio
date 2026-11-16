alter table public.dropship_imports
  add column if not exists operator_prompt text not null default '',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

alter table public.dropship_imports
  drop constraint if exists dropship_imports_operator_prompt_check;

alter table public.dropship_imports
  add constraint dropship_imports_operator_prompt_check
  check (char_length(operator_prompt) <= 4000);

create index if not exists idx_dropship_imports_status_created
  on public.dropship_imports(status, created_at desc);

create index if not exists idx_dropship_imports_active_created
  on public.dropship_imports(created_at desc)
  where archived_at is null;

comment on column public.dropship_imports.operator_prompt is
  'Instructions de l’administrateur pour guider la préparation IA de cet import fournisseur.';

comment on column public.dropship_imports.archived_at is
  'Archivage de l’import dans le centre fournisseurs; aucune donnée produit n’est supprimée.';
