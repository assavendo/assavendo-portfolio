-- Centre d'aide : articles publiés, tickets et messages protégés par RLS.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'ÉCHEC : %', msg; end if; end $$;

select pg_temp.assert(
  (select count(*) >= 8 from public.help_articles where status = 'published'),
  'base de connaissances initialisée'
);

select pg_temp.assert(
  (select count(*) = 3 from information_schema.columns
    where table_schema='public' and table_name='support_messages'
      and column_name in ('ticket_id','author_type','body')),
  'messages support présents'
);

select pg_temp.assert(
  (select relrowsecurity from pg_class where oid = 'public.support_tickets'::regclass),
  'RLS tickets activée'
);

insert into public.support_tickets (access_token_hash, name, email, subject, category, status, priority)
values (encode(gen_random_bytes(32), 'hex'), 'Client test', 'support-test@example.invalid', 'Test support', 'Autre', 'open', 'normal');

select pg_temp.assert(
  (select count(*) = 1 from public.support_tickets where email = 'support-test@example.invalid'),
  'ticket support créé'
);

insert into public.support_messages (ticket_id, author_type, author_name, body)
select id, 'customer', 'Client test', 'Message de test'
from public.support_tickets
where email = 'support-test@example.invalid';

select pg_temp.assert(
  (select count(*) = 1
     from public.support_messages sm
     join public.support_tickets st on st.id = sm.ticket_id
    where st.email = 'support-test@example.invalid'),
  'message ticket lié'
);

delete from public.support_tickets where email = 'support-test@example.invalid';

select pg_temp.assert(
  (select count(*) = 0 from public.support_tickets where email = 'support-test@example.invalid'),
  'fixture ticket nettoyée'
);
