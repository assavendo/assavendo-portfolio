begin;

create table if not exists public.ai_control_state (
  id integer primary key default 1 check (id = 1),
  mode text not null default 'NO_AI' check (mode in ('FULL','DEGRADED','SAFE','NO_AI','MAINTENANCE')),
  reason text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.ai_control_state(id,mode) values (1,'NO_AI') on conflict (id) do nothing;

create table if not exists public.ai_providers (
  slug text primary key, name text not null, adapter text not null check (adapter in ('openai_compatible','manus','custom')),
  enabled boolean not null default false,
  status text not null default 'disabled' check (status in ('healthy','degraded','rate_limited','unavailable','disabled','maintenance')),
  health_score numeric(5,2) not null default 0 check (health_score between 0 and 100),
  capabilities text[] not null default '{}',
  environment text not null default 'production' check (environment in ('development','staging','production')),
  last_health_at timestamptz, last_error text, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.ai_providers(slug,name,adapter,enabled,status,capabilities) values
 ('manus','Manus','manus',false,'disabled','{AGENTIC,RESEARCH,CODING,LONG_CONTEXT}'),
 ('openrouter','OpenRouter','openai_compatible',true,'healthy','{FAST,STANDARD,REASONING,CODING,VISION,RESEARCH,LONG_CONTEXT}'),
 ('groq','Groq','openai_compatible',true,'healthy','{FAST,STANDARD,CODING}'),
 ('deepseek','DeepSeek','openai_compatible',true,'healthy','{STANDARD,REASONING,CODING,RESEARCH}'),
 ('openai','OpenAI','openai_compatible',true,'healthy','{FAST,STANDARD,REASONING,CODING,VISION,LONG_CONTEXT}'),
 ('custom','Compatible personnalisé','custom',false,'disabled','{}')
on conflict(slug) do nothing;

create table if not exists public.ai_accounts (
  id uuid primary key default gen_random_uuid(), provider_slug text not null references public.ai_providers(slug) on update cascade,
  name text not null check (char_length(name) between 1 and 120),
  environment text not null default 'production' check (environment in ('development','staging','production')),
  credential_type text not null check (credential_type in ('ai_key','manus_key','external_ref')),
  credential_id uuid, external_id text,
  status text not null default 'disabled' check (status in ('active','disabled','maintenance','rate_limited','unavailable')),
  allowed_agents text[] not null default '{}', quota jsonb not null default '{}', rate_limits jsonb not null default '{}', cost_policy jsonb not null default '{}',
  last_success timestamptz, last_failure timestamptz, last_429 timestamptz, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider_slug,name,environment)
);
create index if not exists ai_accounts_provider_status_idx on public.ai_accounts(provider_slug,status);

create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(), provider_slug text not null references public.ai_providers(slug) on update cascade,
  model_key text not null, display_name text not null, capabilities text[] not null default '{}',
  context_window integer, input_usd_per_1m numeric(18,8), output_usd_per_1m numeric(18,8),
  data_classifications text[] not null default '{INTERNAL}',
  status text not null default 'candidate' check (status in ('candidate','approved','disabled','deprecated')),
  validated_at timestamptz, benchmark_score numeric(6,3), metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider_slug,model_key)
);

create table if not exists public.ai_tools (
  slug text primary key, name text not null, description text not null default '',
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  enabled boolean not null default false, requires_approval boolean not null default false,
  input_schema jsonb not null default '{}', output_schema jsonb not null default '{}',
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.ai_tools(slug,name,description,risk_level,enabled,requires_approval) values
 ('read_product','Lire un produit','Lecture du catalogue.','low',true,false),
 ('create_product_draft','Créer un brouillon produit','Prépare un brouillon sans publication.','medium',true,false),
 ('update_product_description','Modifier une description','Modification éditoriale non publiée.','medium',false,false),
 ('update_product_metadata','Modifier les métadonnées','Modification contrôlée des attributs/SEO.','medium',false,false),
 ('search_catalog','Rechercher le catalogue','Recherche interne en lecture seule.','low',true,false),
 ('search_supplier_data','Rechercher des données fournisseur','Recherche fournisseur contrôlée.','medium',false,false),
 ('create_translation_draft','Créer une traduction brouillon','Prépare une localisation sans publication.','medium',false,false),
 ('calculate_price_suggestion','Calculer une suggestion de prix','Recommandation sans modification.','medium',false,false),
 ('check_inventory','Lire le stock','Lecture d''inventaire.','low',true,false),
 ('create_support_draft','Créer un brouillon support','Prépare une réponse.','medium',true,false),
 ('create_refund_request','Préparer un remboursement','Prépare une demande sans exécution.','high',false,true),
 ('submit_for_approval','Soumettre à validation','Crée une approbation humaine.','high',true,true),
 ('get_order_status','Lire le statut commande','Lecture contrôlée.','low',true,false),
 ('get_customer_summary','Lire un résumé client','Lecture minimisée.','medium',true,false),
 ('create_workflow','Créer un workflow','Prépare un workflow versionné.','high',false,true),
 ('get_workflow_status','Lire le workflow','Lecture du statut.','low',true,false)
on conflict(slug) do nothing;

create table if not exists public.ai_agent_tools(
  agent_slug text not null references public.ai_agents(slug) on delete cascade,
  tool_slug text not null references public.ai_tools(slug) on delete cascade,
  allowed boolean not null default false, primary key(agent_slug,tool_slug)
);
create table if not exists public.ai_agent_versions(
  id uuid primary key default gen_random_uuid(), agent_slug text not null references public.ai_agents(slug) on delete cascade,
  version integer not null, objective text not null default '', system_prompt text not null,
  environment text not null default 'production', checksum text not null, changelog text not null default '',
  active boolean not null default false, created_by uuid, created_at timestamptz not null default now(),
  unique(agent_slug,version,environment)
);
create table if not exists public.ai_budgets(
  id uuid primary key default gen_random_uuid(), scope_type text not null check (scope_type in ('global','provider','account','agent','workflow','task','team')),
  scope_id text not null, daily_limit_usd numeric(14,4), weekly_limit_usd numeric(14,4), monthly_limit_usd numeric(14,4), per_task_limit_usd numeric(14,4),
  warning_percent numeric(5,2) not null default 70, restrict_percent numeric(5,2) not null default 85, block_percent numeric(5,2) not null default 100,
  enabled boolean not null default true, created_by uuid, updated_at timestamptz not null default now(), unique(scope_type,scope_id)
);
insert into public.ai_budgets(scope_type,scope_id,daily_limit_usd,weekly_limit_usd,monthly_limit_usd,per_task_limit_usd) values ('global','assavendo',25,100,300,2) on conflict(scope_type,scope_id) do nothing;

create table if not exists public.ai_policies(
  slug text not null, version integer not null, name text not null, description text not null default '',
  enabled boolean not null default true, rules jsonb not null default '{}', checksum text not null, created_by uuid, created_at timestamptz not null default now(),
  primary key(slug,version)
);
insert into public.ai_policies(slug,version,name,rules,checksum) values
 ('default_agent_safety',1,'Sécurité agents','{"default_decision":"DENY","external_content_untrusted":true,"no_secret_plaintext":true,"no_sql_global":true}',md5('default_agent_safety:v1')),
 ('critical_finance',1,'Opérations financières critiques','{"refund_over_eur":0,"double_validation":true,"step_up_auth":true}',md5('critical_finance:v1')),
 ('no_external_secrets',1,'Secrets externes interdits','{"deny_plaintext_credentials":true,"allow_reference_only":true}',md5('no_external_secrets:v1')),
 ('support_auto_send',1,'Envoi automatique support','{"max_chars":1500,"deny_external_links":true,"deny_email_addresses":true,"deny_financial_promises":true,"deny_refunds":true}',md5('support_auto_send:v1'))
on conflict(slug,version) do nothing;

create table if not exists public.ai_routes(
  id uuid primary key default gen_random_uuid(), slug text unique not null, agent_slug text, task_kind text not null, required_capability text not null,
  data_classification text not null default 'INTERNAL', max_latency_ms integer, max_cost_usd numeric(12,6), primary_account_id uuid references public.ai_accounts(id) on delete set null,
  fallback_account_ids uuid[] not null default '{}', enabled boolean not null default true, priority integer not null default 100,
  rules jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.ai_routes(slug,agent_slug,task_kind,required_capability,max_latency_ms,max_cost_usd,priority) values
 ('support-default','support','reply_draft','FAST',30000,.05,10),
 ('research-default','recherche','research_note','RESEARCH',60000,.50,10),
 ('catalog-default','catalogue','product_proposal','STANDARD',45000,.25,10)
on conflict(slug) do nothing;

create table if not exists public.ai_approvals(
  id uuid primary key default gen_random_uuid(), task_id uuid, workflow_id uuid, action text not null,
  initiator_type text not null check (initiator_type in ('user','agent','system','workflow')), initiator_id text, agent_slug text,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high','critical')),
  context jsonb not null default '{}', proposed_result jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','canceled')),
  expires_at timestamptz, decided_by uuid, decided_at timestamptz, decision_reason text, created_at timestamptz not null default now()
);
create table if not exists public.ai_workflows(
  id uuid primary key default gen_random_uuid(), slug text not null, version integer not null default 1, name text not null, description text not null default '',
  trigger_type text not null default 'manual' check (trigger_type in ('manual','event','schedule','condition')),
  status text not null default 'draft' check (status in ('draft','active','paused','disabled','archived')),
  definition jsonb not null default '{}', max_duration_ms integer, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(slug,version)
);
create table if not exists public.ai_workflow_steps(
  id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.ai_workflows(id) on delete cascade,
  step_key text not null, step_order integer not null, action text not null, agent_slug text, tool_slug text, policy_slug text,
  required_approval boolean not null default false, config jsonb not null default '{}',
  unique(workflow_id,step_key), unique(workflow_id,step_order)
);
create table if not exists public.ai_incidents(
  id uuid primary key default gen_random_uuid(), provider_slug text references public.ai_providers(slug) on delete set null, account_id uuid references public.ai_accounts(id) on delete set null,
  agent_slug text, kind text not null, severity text not null default 'warning' check (severity in ('info','warning','high','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')), title text not null, details jsonb not null default '{}',
  started_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.ai_audit_logs(
  id uuid primary key default gen_random_uuid(), timestamp timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user','agent','system','workflow','provider')), actor_id text, agent_id text, user_id uuid,
  service text not null default 'ai-control-plane', action text not null, resource_type text, resource_id text,
  policy_decision text check (policy_decision is null or policy_decision in ('ALLOW','DENY','REQUIRE_APPROVAL','REQUIRE_STEP_UP_AUTH','RATE_LIMIT','SAFE_MODE_ONLY')),
  request_id text, trace_id text, result text, error text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.ai_benchmarks(
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  category text not null check (category in ('accuracy','extraction','classification','research','writing','coding','multilingual','reasoning','structured','tool_calling','prompt_injection')),
  dataset jsonb not null default '{}', version integer not null default 1, enabled boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.ai_benchmark_results(
  id uuid primary key default gen_random_uuid(), benchmark_id uuid not null references public.ai_benchmarks(id) on delete cascade,
  provider_slug text references public.ai_providers(slug) on delete set null, model_id uuid references public.ai_models(id) on delete set null,
  score numeric(7,4), latency_ms integer, estimated_cost_usd numeric(12,6), passed boolean, details jsonb not null default '{}', created_at timestamptz not null default now()
);

alter table public.ai_agents drop constraint if exists ai_agents_slug_check;
alter table public.ai_agents add constraint ai_agents_slug_check check (slug in ('supervisor','support','recherche','catalogue','product_research','seo','translation','customer_support','pricing','inventory','fraud_risk','compliance','qa'));
alter table public.ai_agents add column if not exists objective text not null default '';
alter table public.ai_agents add column if not exists version integer not null default 1;
alter table public.ai_agents add column if not exists autonomy_level integer not null default 1;
alter table public.ai_agents add column if not exists approval_threshold numeric(12,2);
alter table public.ai_agents add column if not exists allowed_environments text[] not null default '{production}';
alter table public.ai_agents add column if not exists budget_id uuid references public.ai_budgets(id) on delete set null;

alter table public.ai_tasks drop constraint if exists ai_tasks_status_check;
alter table public.ai_tasks add constraint ai_tasks_status_check check (status in ('pending','queued','running','awaiting_approval','approved','rejected','done','failed','canceled'));
alter table public.ai_tasks add column if not exists workflow_id uuid;
alter table public.ai_tasks add column if not exists approval_id uuid;
alter table public.ai_tasks add column if not exists risk_level text not null default 'medium';
alter table public.ai_tasks add column if not exists attempts integer not null default 0;
alter table public.ai_tasks add column if not exists started_at timestamptz;
alter table public.ai_tasks add column if not exists finished_at timestamptz;
alter table public.ai_tasks add column if not exists error_code text;
alter table public.ai_tasks add column if not exists retryable boolean;
alter table public.ai_tasks add column if not exists fallback_allowed boolean;

alter table public.ai_runs add column if not exists provider_slug text;
alter table public.ai_runs add column if not exists account_id uuid;
alter table public.ai_runs add column if not exists model_id uuid;
alter table public.ai_runs add column if not exists input_tokens bigint;
alter table public.ai_runs add column if not exists output_tokens bigint;
alter table public.ai_runs add column if not exists estimated_cost_usd numeric(12,6);
alter table public.ai_runs add column if not exists policy_decision text;
alter table public.ai_runs add column if not exists fallback_used boolean not null default false;
alter table public.ai_runs add column if not exists request_id text;
alter table public.ai_runs add column if not exists trace_id text;
alter table public.ai_runs add column if not exists mode text;

create index if not exists ai_runs_provider_idx on public.ai_runs(provider_slug,created_at desc);
create index if not exists ai_runs_cost_idx on public.ai_runs(created_at desc,estimated_cost_usd);
create index if not exists ai_models_provider_status_idx on public.ai_models(provider_slug,status);
create index if not exists ai_approvals_status_idx on public.ai_approvals(status,created_at desc);
create index if not exists ai_incidents_status_idx on public.ai_incidents(status,started_at desc);
create index if not exists ai_audit_logs_created_idx on public.ai_audit_logs(created_at desc);
create index if not exists ai_routes_lookup_idx on public.ai_routes(agent_slug,task_kind,enabled,priority);

insert into public.ai_benchmarks(slug,name,category,dataset) values
 ('structured-json','Sortie structurée JSON','structured','{}'),
 ('prompt-injection-basic','Résistance prompt injection','prompt_injection','{}'),
 ('support-safety','Sécurité support','classification','{}')
on conflict(slug) do nothing;

create or replace function public.ai_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'AI audit logs are append-only'; end;
$$;
drop trigger if exists ai_audit_immutable_update on public.ai_audit_logs;
create trigger ai_audit_immutable_update before update or delete on public.ai_audit_logs for each row execute function public.ai_audit_immutable();

create or replace function public.ai_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array['ai_control_state','ai_providers','ai_accounts','ai_models','ai_tools','ai_budgets','ai_routes','ai_workflows','ai_agents'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ai_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

alter table public.ai_control_state enable row level security;
alter table public.ai_providers enable row level security;
alter table public.ai_accounts enable row level security;
alter table public.ai_models enable row level security;
alter table public.ai_tools enable row level security;
alter table public.ai_agent_tools enable row level security;
alter table public.ai_agent_versions enable row level security;
alter table public.ai_budgets enable row level security;
alter table public.ai_policies enable row level security;
alter table public.ai_routes enable row level security;
alter table public.ai_approvals enable row level security;
alter table public.ai_workflows enable row level security;
alter table public.ai_workflow_steps enable row level security;
alter table public.ai_incidents enable row level security;
alter table public.ai_audit_logs enable row level security;
alter table public.ai_benchmarks enable row level security;
alter table public.ai_benchmark_results enable row level security;

revoke all on public.ai_control_state,public.ai_providers,public.ai_accounts,public.ai_models,public.ai_tools,public.ai_agent_tools,public.ai_agent_versions,public.ai_budgets,public.ai_policies,public.ai_routes,public.ai_approvals,public.ai_workflows,public.ai_workflow_steps,public.ai_incidents,public.ai_audit_logs,public.ai_benchmarks,public.ai_benchmark_results from anon,authenticated;

commit;
