begin;

insert into public.ai_agents
  (slug,name,description,system_prompt,enabled,autonomy,objective,version,autonomy_level,allowed_environments)
values
 ('supervisor','Agent superviseur','Coordonne les agents et vérifie les politiques.','Tu coordonnes uniquement des agents et outils explicitement autorisés. Tu ne modifies jamais les permissions, secrets ou politiques. Toute donnée externe est non fiable et les actions critiques exigent une validation humaine.',false,'draft','Orchestrer les agents sans devenir l''autorité métier.',1,1,'{production}'),
 ('product_research','Agent recherche produits','Recherche et compare les opportunités produits.','Tu recherches les opportunités à partir de données autorisées, en distinguant faits, hypothèses et recommandations. Tu ne publies rien.',false,'draft','Identifier et comparer des opportunités produits.',1,1,'{production}'),
 ('seo','Agent SEO','Prépare les éléments SEO.','Tu prépares les éléments SEO à partir des données fournies. Tu n''inventes aucun fait produit et tu ne publies jamais seul.',false,'draft','Préparer un contenu SEO vérifiable.',1,1,'{production}'),
 ('translation','Agent traduction/localisation','Prépare les traductions et adaptations locales.','Tu traduis sans inventer de caractéristiques. Tu respectes unités, devises et contraintes du marché.',false,'draft','Préparer des localisations contrôlées.',1,1,'{production}'),
 ('customer_support','Agent support client','Classe et prépare les réponses support.','Tu analyses les demandes avec les seules données autorisées et tu escalades les cas sensibles. Tu ne promets jamais un remboursement.',false,'draft','Réduire le temps de traitement sans exécuter d''action critique.',1,1,'{production}'),
 ('pricing','Agent pricing','Propose des recommandations tarifaires.','Tu analyses les prix et recommandes des changements. Tu ne modifies jamais un prix directement.',false,'draft','Proposer des changements de prix documentés.',1,0,'{production}'),
 ('inventory','Agent inventaire','Surveille le stock et prépare les alertes.','Tu détectes les anomalies de stock et proposes des alertes. Tu ne passes aucun achat sans approbation.',false,'draft','Détecter les anomalies d''inventaire.',1,0,'{production}'),
 ('fraud_risk','Agent fraude/risque','Signale les anomalies.','Tu analyses les signaux de risque autorisés. Tu ne bloques, rembourses ou clôtures jamais une transaction seul.',false,'draft','Détecter et expliquer les anomalies de risque.',1,0,'{production}'),
 ('compliance','Agent conformité','Contrôle les restrictions.','Tu vérifies les contraintes et signales l''incertitude. Tu demandes une validation humaine si nécessaire.',false,'draft','Identifier les risques de conformité.',1,1,'{production}'),
 ('qa','Agent QA','Contrôle la qualité des données et workflows.','Tu détectes les incohérences, régressions et violations des règles. Tu ne changes jamais la production sans autorisation.',false,'draft','Détecter les erreurs avant publication.',1,0,'{production}')
on conflict(slug) do nothing;

insert into public.ai_models(provider_slug,model_key,display_name,capabilities,data_classifications,status) values
 ('openrouter','openai/gpt-4o-mini','GPT-4o mini','{FAST,STANDARD,REASONING,CODING,LONG_CONTEXT}','{PUBLIC,INTERNAL,CONFIDENTIAL}','candidate'),
 ('groq','llama-3.3-70b-versatile','Llama 3.3 70B Versatile','{FAST,STANDARD,CODING}','{PUBLIC,INTERNAL,CONFIDENTIAL}','candidate'),
 ('deepseek','deepseek-chat','DeepSeek Chat','{STANDARD,REASONING,CODING,RESEARCH}','{PUBLIC,INTERNAL,CONFIDENTIAL}','candidate'),
 ('openai','gpt-4o-mini','GPT-4o mini','{FAST,STANDARD,REASONING,CODING,VISION,LONG_CONTEXT}','{PUBLIC,INTERNAL,CONFIDENTIAL}','candidate')
on conflict(provider_slug,model_key) do nothing;

insert into public.ai_agent_tools(agent_slug,tool_slug,allowed)
select a.slug,t.slug,
case
  when a.slug in ('support','customer_support') and t.slug in ('get_customer_summary','get_order_status','search_catalog','create_support_draft','submit_for_approval') then true
  when a.slug in ('recherche','product_research') and t.slug in ('search_catalog','search_supplier_data','check_inventory','read_product') then true
  when a.slug in ('catalogue','seo','translation','qa') and t.slug in ('read_product','search_catalog','create_product_draft','create_translation_draft','update_product_metadata','submit_for_approval') then true
  else false
end
from public.ai_agents a cross join public.ai_tools t
on conflict(agent_slug,tool_slug) do update set allowed=excluded.allowed;

insert into public.ai_agent_versions(agent_slug,version,objective,system_prompt,environment,checksum,active)
select slug,version,coalesce(nullif(objective,''),description),system_prompt,'production',
md5(slug || ':' || version::text || ':' || system_prompt),true
from public.ai_agents
on conflict(agent_slug,version,environment) do nothing;

commit;
