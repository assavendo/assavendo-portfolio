begin;

alter table public.ai_runs drop column if exists provider_slug, drop column if exists account_id, drop column if exists model_id,
  drop column if exists input_tokens, drop column if exists output_tokens, drop column if exists estimated_cost_usd,
  drop column if exists policy_decision, drop column if exists fallback_used, drop column if exists request_id,
  drop column if exists trace_id, drop column if exists mode;

alter table public.ai_tasks drop column if exists workflow_id, drop column if exists approval_id, drop column if exists risk_level,
  drop column if exists attempts, drop column if exists started_at, drop column if exists finished_at,
  drop column if exists error_code, drop column if exists retryable, drop column if exists fallback_allowed;
alter table public.ai_tasks drop constraint if exists ai_tasks_status_check;

alter table public.ai_agents drop column if exists budget_id, drop column if exists allowed_environments, drop column if exists approval_threshold,
  drop column if exists autonomy_level, drop column if exists version, drop column if exists objective;
alter table public.ai_agents drop constraint if exists ai_agents_slug_check;
alter table public.ai_agents add constraint ai_agents_slug_check check (slug in ('support','recherche','catalogue'));

drop trigger if exists ai_audit_immutable_update on public.ai_audit_logs;
drop trigger if exists ai_control_state_touch on public.ai_control_state;
drop trigger if exists ai_providers_touch on public.ai_providers;
drop trigger if exists ai_accounts_touch on public.ai_accounts;
drop trigger if exists ai_models_touch on public.ai_models;
drop trigger if exists ai_tools_touch on public.ai_tools;
drop trigger if exists ai_budgets_touch on public.ai_budgets;
drop trigger if exists ai_routes_touch on public.ai_routes;
drop trigger if exists ai_workflows_touch on public.ai_workflows;
drop trigger if exists ai_agents_touch on public.ai_agents;

drop function if exists public.ai_audit_immutable();
drop function if exists public.ai_touch_updated_at();

drop table if exists public.ai_benchmark_results;
drop table if exists public.ai_benchmarks;
drop table if exists public.ai_audit_logs;
drop table if exists public.ai_incidents;
drop table if exists public.ai_workflow_steps;
drop table if exists public.ai_workflows;
drop table if exists public.ai_approvals;
drop table if exists public.ai_routes;
drop table if exists public.ai_policies;
drop table if exists public.ai_budgets;
drop table if exists public.ai_agent_versions;
drop table if exists public.ai_agent_tools;
drop table if exists public.ai_tools;
drop table if exists public.ai_models;
drop table if exists public.ai_accounts;
drop table if exists public.ai_providers;
drop table if exists public.ai_control_state;

commit;