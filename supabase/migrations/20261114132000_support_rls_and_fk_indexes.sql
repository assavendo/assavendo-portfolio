begin;

drop policy if exists "admin gere les articles aide" on public.help_articles;
create policy "admin ajoute les articles aide"
  on public.help_articles
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "admin modifie les articles aide"
  on public.help_articles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admin supprime les articles aide"
  on public.help_articles
  for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists "support tickets deny anon" on public.support_tickets;
drop policy if exists "support tickets deny authenticated" on public.support_tickets;
create policy "support tickets deny anon"
  on public.support_tickets
  for all to anon
  using (false)
  with check (false);
create policy "support tickets deny authenticated"
  on public.support_tickets
  for all to authenticated
  using (false)
  with check (false);

drop policy if exists "support messages deny anon" on public.support_messages;
drop policy if exists "support messages deny authenticated" on public.support_messages;
create policy "support messages deny anon"
  on public.support_messages
  for all to anon
  using (false)
  with check (false);
create policy "support messages deny authenticated"
  on public.support_messages
  for all to authenticated
  using (false)
  with check (false);

create index if not exists ai_agent_tools_tool_slug_idx on public.ai_agent_tools(tool_slug);
create index if not exists ai_agents_budget_id_idx on public.ai_agents(budget_id);
create index if not exists ai_benchmark_results_model_id_idx on public.ai_benchmark_results(model_id);
create index if not exists ai_benchmark_results_provider_slug_idx on public.ai_benchmark_results(provider_slug);
create index if not exists ai_incidents_account_id_idx on public.ai_incidents(account_id);
create index if not exists ai_incidents_provider_slug_idx on public.ai_incidents(provider_slug);
create index if not exists ai_routes_primary_account_id_idx on public.ai_routes(primary_account_id);
create index if not exists help_articles_created_by_idx on public.help_articles(created_by);
create index if not exists review_invitations_order_item_id_idx on public.review_invitations(order_item_id);
create index if not exists support_messages_author_id_idx on public.support_messages(author_id);
create index if not exists support_tickets_order_id_idx on public.support_tickets(order_id);

commit;
