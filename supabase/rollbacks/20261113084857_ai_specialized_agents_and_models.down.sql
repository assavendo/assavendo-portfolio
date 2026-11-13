begin;

delete from public.ai_agent_versions where agent_slug in ('supervisor','product_research','seo','translation','customer_support','pricing','inventory','fraud_risk','compliance','qa');
delete from public.ai_agent_tools where agent_slug in ('supervisor','product_research','seo','translation','customer_support','pricing','inventory','fraud_risk','compliance','qa');
delete from public.ai_agents where slug in ('supervisor','product_research','seo','translation','customer_support','pricing','inventory','fraud_risk','compliance','qa');
delete from public.ai_models where (provider_slug,model_key) in (
  ('openrouter','openai/gpt-4o-mini'),
  ('groq','llama-3.3-70b-versatile'),
  ('deepseek','deepseek-chat'),
  ('openai','gpt-4o-mini')
);
commit;