-- Outil « test de vitesse » (API PageSpeed Insights) : référencé dans tool_keys, puis rattaché à la fiche « site lent ».
-- Idempotent. Retour arrière : supabase/rollbacks/20261020000000_pagespeed_tool.down.sql
begin;
insert into public.tool_keys (key) values ('pagespeed') on conflict do nothing;
update public.problems
   set format = 'tool', tool_key = 'pagespeed',
       tool_intro = 'Saisissez l''adresse de votre page : Google la mesure comme sur un téléphone et vous obtenez la note, les indicateurs essentiels et les trois corrections qui comptent le plus.'
 where slug = 'site-lent-visiteurs-qui-repartent' and tool_key is null;
commit;
