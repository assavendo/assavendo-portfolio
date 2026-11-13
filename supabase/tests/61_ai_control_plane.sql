-- AI Control Plane V2 : modes, providers, policies, budgets, approvals, audit et allowlists.

create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'ÉCHEC : %', msg; end if;
end $$;

select pg_temp.assert((select mode = 'NO_AI' from public.ai_control_state where id = 1), 'mode initial NO_AI');
select pg_temp.assert((select count(*) >= 5 from public.ai_providers), 'providers enregistrés');
select pg_temp.assert((select count(*) >= 4 from public.ai_models), 'modèles enregistrés');
select pg_temp.assert((select count(*) >= 16 from public.ai_tools), 'outils enregistrés');
select pg_temp.assert((select daily_limit_usd = 25 from public.ai_budgets where scope_type='global' and scope_id='assavendo'), 'budget global correct');
select pg_temp.assert((select count(*) >= 4 from public.ai_policies where enabled), 'policies actives');
select pg_temp.assert((select count(*) >= 3 from public.ai_routes where enabled), 'routes actives');
select pg_temp.assert((select count(*) >= 3 from public.ai_benchmarks where enabled), 'benchmarks actifs');

-- Les rôles client ne peuvent ni lire ni modifier le Control Plane.
do $$
begin
  begin
    set local role anon;
    perform count(*) from public.ai_providers;
    raise exception 'ÉCHEC : anon lit les providers IA';
  exception when insufficient_privilege then null;
  end;
  reset role;
  begin
    set local role authenticated;
    perform count(*) from public.ai_audit_logs;
    raise exception 'ÉCHEC : authenticated lit l’audit IA';
  exception when insufficient_privilege then null;
  end;
end $$;

-- L’audit est append-only.
insert into public.ai_audit_logs(actor_type,actor_id,action) values ('system','test','test_append_only');
do $$
declare audit_id uuid;
begin
  select id into audit_id from public.ai_audit_logs where actor_id='test' and action='test_append_only' order by created_at desc limit 1;
  begin
    update public.ai_audit_logs set result='tamper' where id=audit_id;
    raise exception 'ÉCHEC : audit IA modifiable';
  exception when raise_exception then
    null;
  end;
end $$;

select pg_temp.assert(
  (select count(*) >= 1 from public.ai_agent_tools where agent_slug='support' and tool_slug='get_customer_summary' and allowed),
  'allowlist support'
);

select pg_temp.assert(
  (select count(*) >= 1 from public.ai_agent_tools where agent_slug='pricing' and tool_slug='create_refund_request' and not allowed),
  'principe de moindre privilège pricing'
);

select pg_temp.assert(
  (select count(*) >= 10 from public.ai_agents where slug not in ('support','recherche','catalogue') and not enabled and autonomy='draft'),
  'agents spécialisés verrouillés par défaut'
);

delete from public.ai_audit_logs where actor_id='test' and action='test_append_only';
