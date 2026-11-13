begin;

do $$
declare t text;
begin
  foreach t in array array[
    'ai_settings','ai_keys','ai_agents','ai_tasks','ai_runs',
    'ai_control_state','ai_providers','ai_accounts','ai_models','ai_tools',
    'ai_agent_tools','ai_agent_versions','ai_budgets','ai_policies','ai_routes',
    'ai_approvals','ai_workflows','ai_workflow_steps','ai_incidents','ai_audit_logs',
    'ai_benchmarks','ai_benchmark_results'
  ] loop
    execute format('drop policy if exists %I on public.%I','deny_client_access',t);
  end loop;
end $$;

alter function public.ai_audit_immutable() reset search_path;
alter function public.ai_touch_updated_at() reset search_path;

commit;