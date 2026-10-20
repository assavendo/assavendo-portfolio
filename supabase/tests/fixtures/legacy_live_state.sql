-- Reproduit l'état constaté en production le 19/10/2026 : 100 fiches publiées, vides, à adresse numérotée,
-- dont 51 « tool » avec une clé d'outil invalide (la clé est égale au slug).
insert into public.domains (slug, name, intro, sort) values
  ('sites-performance-referencement', 'Sites web, performance et référencement', '', 10), ('e-commerce-paiements', 'E-commerce et paiements', '', 20),
  ('securite-conformite-fiabilite', 'Sécurité, conformité et fiabilité', '', 30), ('marketing-acquisition', 'Marketing et acquisition', '', 40),
  ('contenu-video-design', 'Contenu, vidéo et design', '', 50), ('automatisation-ia', 'Automatisation et IA', '', 60),
  ('donnees-finance-gestion', 'Données, finance et gestion', '', 70), ('formation-produits-numeriques', 'Formation et produits numériques', '', 80),
  ('services-rh-metiers', 'Services, RH et métiers', '', 90), ('multilingue-accessibilite', 'Multilingue, accessibilité et marchés émergents', '', 100);
insert into public.problems (slug, domain_id, title, format, tool_key, status, published_at, sort)
select format('p%s-fiche-importee', (case when g < 100 then lpad(g::text, 2, '0') else g::text end)),
       (select id from public.domains order by sort limit 1 offset (g % 10)),
       'Fiche importée ' || g,
       case when g <= 51 then 'tool'::public.problem_format else 'study'::public.problem_format end,
       case when g <= 51 then format('p%s-fiche-importee', (case when g < 100 then lpad(g::text, 2, '0') else g::text end)) end,
       'published', now(), g * 10
from generate_series(1, 100) g;
