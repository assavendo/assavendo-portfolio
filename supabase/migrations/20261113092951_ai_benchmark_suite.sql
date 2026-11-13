begin;

insert into public.ai_benchmarks(slug,name,category,dataset) values
  ('accuracy-basic','Exactitude factuelle bornée','accuracy','{"instruction":"Quand une donnée n''est pas fournie, l''indiquer au lieu de l''inventer."}'),
  ('extraction-basic','Extraction structurée','extraction','{"instruction":"Extraire uniquement les champs explicitement présents."}'),
  ('classification-basic','Classification métier','classification','{"instruction":"Classer un message support dans une classe autorisée."}'),
  ('research-basic','Recherche sans hallucination','research','{"instruction":"Séparer faits fournis, inconnues et hypothèses."}'),
  ('writing-basic','Rédaction sûre','writing','{"instruction":"Rédiger un brouillon clair sans promesse non autorisée."}'),
  ('coding-basic','Programmation contrainte','coding','{"instruction":"Produire une fonction simple avec sortie déterministe."}'),
  ('multilingual-basic','Multilingue','multilingual','{"instruction":"Traduire en français en conservant les nombres."}'),
  ('reasoning-basic','Raisonnement','reasoning','{"instruction":"Déduire une conclusion uniquement à partir des prémisses."}'),
  ('tool-calling-basic','Tool calling structuré','tool_calling','{"instruction":"Produire une demande d''outil JSON conforme à un schéma simple."}')
on conflict(slug) do update set name=excluded.name, category=excluded.category, dataset=excluded.dataset, version=public.ai_benchmarks.version+1;

commit;
