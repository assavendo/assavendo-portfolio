-- Control Plane IA V3 : workflows multi-étapes, budgets/scopes, policies et benchmarks.

create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

select pg_temp.assert(
  (select count(*) >= 12 from public.ai_benchmarks),
  'suite benchmark IA complète'
);

select pg_temp.assert(
  (select count(*) = 4 from information_schema.columns
    where table_schema='public' and table_name='ai_workflow_runs'
      and column_name in ('current_step_order','approval_id','retry_at','last_step_result')),
  'colonnes de reprise workflow présentes'
);

select pg_temp.assert(
  (select count(*) = 2 from information_schema.columns
    where table_schema='public' and table_name='ai_runs'
      and column_name in ('workflow_id','task_id')),
  'scopes workflow/tâche présents dans ai_runs'
);

select pg_temp.assert(
  (select count(*) >= 4 from public.ai_policies),
  'policies IA versionnées présentes'
);

do $$
declare wf uuid;
begin
  insert into public.ai_workflows(slug,version,name,status,definition)
  values ('test-multi-step',1,'Test multi-step','draft','{"steps_count":2}')
  returning id into wf;

  insert into public.ai_workflow_steps(workflow_id,step_key,step_order,action)
  values (wf,'first',1,'noop'),(wf,'second',2,'noop');

  perform pg_temp.assert(
    (select count(*) = 2 from public.ai_workflow_steps where workflow_id=wf),
    'workflow à deux étapes créé'
  );

  insert into public.ai_workflow_runs(workflow_id,idempotency_key,current_step_order,status,context)
  values (wf,'test-key',2,'waiting_approval','{"mode":"SAFE"}');

  perform pg_temp.assert(
    (select current_step_order=2 and status='waiting_approval'
      from public.ai_workflow_runs
      where workflow_id=wf and idempotency_key='test-key'),
    'reprise workflow persistante'
  );

  delete from public.ai_workflows where id=wf;
end $$;
