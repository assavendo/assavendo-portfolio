begin;

drop index if exists public.ai_agent_tools_tool_slug_idx;
drop index if exists public.ai_agents_budget_id_idx;
drop index if exists public.ai_benchmark_results_model_id_idx;
drop index if exists public.ai_benchmark_results_provider_slug_idx;
drop index if exists public.ai_incidents_account_id_idx;
drop index if exists public.ai_incidents_provider_slug_idx;
drop index if exists public.ai_routes_primary_account_id_idx;
drop index if exists public.help_articles_created_by_idx;
drop index if exists public.review_invitations_order_item_id_idx;
drop index if exists public.support_messages_author_id_idx;
drop index if exists public.support_tickets_order_id_idx;

drop policy if exists "admin ajoute les articles aide" on public.help_articles;
drop policy if exists "admin modifie les articles aide" on public.help_articles;
drop policy if exists "admin supprime les articles aide" on public.help_articles;
create policy "admin gere les articles aide"
  on public.help_articles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "support tickets deny anon" on public.support_tickets;
drop policy if exists "support tickets deny authenticated" on public.support_tickets;
drop policy if exists "support messages deny anon" on public.support_messages;
drop policy if exists "support messages deny authenticated" on public.support_messages;

commit;
