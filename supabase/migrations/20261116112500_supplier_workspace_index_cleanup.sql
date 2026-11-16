drop index if exists public.idx_dropship_imports_status_created;

create index if not exists idx_dropship_imports_archived_by
  on public.dropship_imports(archived_by);