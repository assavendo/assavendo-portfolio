begin;

alter table public.ai_workflows add column if not exists next_run_at timestamptz;
alter table public.ai_workflows add column if not exists last_run_at timestamptz;
alter table public.ai_workflows add column if not exists concurrency_limit integer not null default 1 check (concurrency_limit between 1 and 20);
alter table public.ai_workflows add column if not exists max_retries integer not null default 2 check (max_retries between 0 and 10);

create table if not exists public.ai_workflow_runs(
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.ai_workflows(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting_approval','succeeded','failed','canceled')),
  attempt integer not null default 0 check (attempt >= 0),
  trigger_type text not null default 'manual',
  context jsonb not null default '{}',
  result jsonb not null default '{}',
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workflow_id,idempotency_key)
);
create index if not exists ai_workflow_runs_status_idx on public.ai_workflow_runs(status,created_at);
create index if not exists ai_workflow_runs_workflow_idx on public.ai_workflow_runs(workflow_id,created_at desc);

alter table public.ai_workflow_runs enable row level security;
revoke all on public.ai_workflow_runs from anon,authenticated;
drop policy if exists deny_client_access on public.ai_workflow_runs;
create policy deny_client_access on public.ai_workflow_runs as restrictive for all to anon,authenticated using(false) with check(false);

commit;