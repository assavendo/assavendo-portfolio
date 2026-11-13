begin;
update public.ai_providers
set status='degraded', health_score=0, last_error=coalesce(last_error,'Aucun credential actif/testé dans le Control Room.'), updated_at=now()
where slug in ('openrouter','groq','deepseek','openai') and enabled=true and not exists (
  select 1 from public.ai_accounts a where a.provider_slug=ai_providers.slug and a.status='active'
);
commit;