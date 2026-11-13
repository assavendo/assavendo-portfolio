begin;

alter table public.ai_workflow_runs
  add column if not exists current_step_order integer not null default 1 check (current_step_order >= 1),
  add column if not exists approval_id uuid,
  add column if not exists retry_at timestamptz,
  add column if not exists last_step_result jsonb not null default '{}';

alter table public.ai_runs
  add column if not exists workflow_id uuid,
  add column if not exists task_id uuid;

create index if not exists ai_workflow_runs_retry_idx
  on public.ai_workflow_runs(status, retry_at, created_at desc);

create index if not exists ai_workflow_runs_workflow_step_idx
  on public.ai_workflow_runs(workflow_id, current_step_order);

create index if not exists ai_runs_workflow_idx
  on public.ai_runs(workflow_id, created_at desc);

create index if not exists ai_runs_task_idx
  on public.ai_runs(task_id, created_at desc);

commit;
