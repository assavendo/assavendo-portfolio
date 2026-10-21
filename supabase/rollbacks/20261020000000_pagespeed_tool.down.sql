begin;
update public.problems set format = 'study', tool_key = null, tool_intro = '' where tool_key = 'pagespeed';
delete from public.tool_keys where key = 'pagespeed';
commit;
