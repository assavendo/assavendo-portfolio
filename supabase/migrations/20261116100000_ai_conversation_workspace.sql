-- Assavendo AI : conversations persistantes et messages du Centre IA.
begin;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null check (agent_slug in ('recherche','catalogue','support')),
  title text not null default 'Nouvelle discussion' check (char_length(title) between 1 and 160),
  status text not null default 'active' check (status in ('active','archived')),
  last_message_preview text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_updated_idx
  on public.ai_conversations (updated_at desc);

create table if not exists public.ai_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  provider_slug text,
  model_key text,
  latency_ms int,
  estimated_cost_usd numeric(18,8),
  submission_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversation_messages_conv_created_idx
  on public.ai_conversation_messages (conversation_id, created_at);

create unique index if not exists ai_conversation_messages_submission_uidx
  on public.ai_conversation_messages (submission_id)
  where submission_id is not null;

alter table public.ai_conversations enable row level security;
alter table public.ai_conversation_messages enable row level security;

revoke all on public.ai_conversations, public.ai_conversation_messages from anon, authenticated;

commit;
