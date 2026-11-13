begin;
update public.ai_providers
set status='healthy', health_score=0, last_error=null, updated_at=now()
where slug in ('openrouter','groq','deepseek','openai') and enabled=true;
commit;