-- Centre IA : aucune table lisible ni modifiable par un visiteur ou un client connecté ; contraintes de rôles et d'adresse.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

select pg_temp.assert((select enabled = false from public.ai_settings where id = 1), 'IA désactivée par défaut');
select pg_temp.assert((select count(*) >= 13 and bool_and(not enabled) and bool_and(autonomy = 'draft') from public.ai_agents), 'agents IA présents, désactivés, en brouillon');

insert into auth.users (id) values ('66666666-6666-6666-6666-666666666661') on conflict do nothing;
insert into public.ai_keys (provider, label, base_url, model, secret_enc) values ('groq', 'Groq test', 'https://api.groq.com/openai/v1', 'm', 'chiffre');

begin; set local role anon;
do $$ begin
  begin perform count(*) from public.ai_keys; raise exception 'ÉCHEC : visiteur lit les clés';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
begin; set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666661'; set local role authenticated;
do $$ begin
  begin perform count(*) from public.ai_keys; raise exception 'ÉCHEC : client connecté lit les clés';
  exception when insufficient_privilege then null; end;
  begin update public.ai_settings set enabled = true; raise exception 'ÉCHEC : client active l''IA';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

do $$ begin
  begin insert into public.ai_keys (provider, label, base_url, model, secret_enc) values ('groq', 'http', 'http://x.example', 'm', 'c'); raise exception 'ÉCHEC : adresse non https acceptée';
  exception when check_violation then null; end;
  begin insert into public.ai_keys (provider, label, base_url, model, secret_enc, roles) values ('groq', 'rôle', 'https://x.example', 'm', 'c', '{admin}'); raise exception 'ÉCHEC : rôle inconnu accepté';
  exception when check_violation then null; end;
  begin insert into public.ai_agents (slug, name, system_prompt) values ('pirate', 'x', 'une consigne assez longue pour passer'); raise exception 'ÉCHEC : agent inconnu accepté';
  exception when check_violation then null; end;
end $$;

-- un seul brouillon de réponse actif par message
insert into public.ai_tasks (agent, kind, source_id, title) values ('support', 'reply_draft', '77777777-7777-7777-7777-777777777771', 't');
do $$ begin
  begin insert into public.ai_tasks (agent, kind, source_id, title) values ('support', 'reply_draft', '77777777-7777-7777-7777-777777777771', 't2'); raise exception 'ÉCHEC : deuxième brouillon actif accepté';
  exception when unique_violation then null; end;
end $$;
