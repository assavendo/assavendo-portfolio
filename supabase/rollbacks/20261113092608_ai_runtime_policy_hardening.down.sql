begin;

drop index if exists public.ai_runs_task_idx;
drop index if exists public.ai_runs_workflow_idx;
drop index if exists public.ai_workflow_runs_workflow_step_idx;
drop index if exists public.ai_workflow_runs_retry_idx;

alter table public.ai_runs
  drop column if exists task_id,
  drop column if exists workflow_id;

alter table public.ai_workflow_runs
  drop column if exists last_step_result,
  drop column if exists retry_at,
  drop column if exists approval_id,
  drop column if exists current_step_order;

commit;
