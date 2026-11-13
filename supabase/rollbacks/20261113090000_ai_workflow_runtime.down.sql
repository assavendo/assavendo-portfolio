begin;
drop table if exists public.ai_workflow_runs;
alter table public.ai_workflows drop column if exists max_retries;
alter table public.ai_workflows drop column if exists concurrency_limit;
alter table public.ai_workflows drop column if exists last_run_at;
alter table public.ai_workflows drop column if exists next_run_at;
commit;