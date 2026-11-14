begin;

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 160),
  summary text not null default '' check (char_length(summary) <= 500),
  content text not null check (char_length(content) between 20 and 20000),
  category text not null default 'Général' check (char_length(category) between 2 and 80),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  sort integer not null default 0 check (sort between 0 and 100000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists help_articles_public_idx
  on public.help_articles (status, sort, title)
  where status = 'published';

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default (
    'AV-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))
  ),
  access_token_hash text not null unique,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) between 5 and 320),
  subject text not null check (char_length(subject) between 3 and 180),
  category text not null default 'Autre' check (char_length(category) between 2 and 80),
  order_id uuid references public.orders(id) on delete set null,
  order_reference text,
  status text not null default 'open' check (status in ('open','pending_customer','pending_assavendo','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, priority, last_message_at desc);

create index if not exists support_tickets_email_idx
  on public.support_tickets (lower(email), created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_type text not null check (author_type in ('customer','admin','system')),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (char_length(author_name) between 2 and 120),
  body text not null check (char_length(body) between 2 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at);

alter table public.help_articles enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

revoke all on public.help_articles, public.support_tickets, public.support_messages from anon, authenticated;
grant select on public.help_articles to anon, authenticated;
grant all on public.help_articles, public.support_tickets, public.support_messages to service_role;

drop policy if exists "public lit les articles aide publies" on public.help_articles;
create policy "public lit les articles aide publies"
  on public.help_articles
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists "admin gere les articles aide" on public.help_articles;
create policy "admin gere les articles aide"
  on public.help_articles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

insert into public.help_articles (slug, title, summary, content, category, status, sort)
values
('commander-sur-assavendo', 'Commander sur Assavendo', 'Les étapes essentielles pour passer une commande en boutique.', 'Choisissez un produit et, lorsque des variantes sont proposées, sélectionnez celle qui vous convient.\n\nAjoutez les articles au panier puis vérifiez les quantités, les frais de livraison éventuels et le total TTC avant de poursuivre.\n\nLe paiement est finalisé avec Stripe. Après confirmation, vous recevez un e-mail avec le numéro de commande et un lien personnel de suivi.', 'Commande', 'published', 10),
('paiement-et-securite', 'Paiement et sécurité', 'Comment le paiement est protégé et ce que voit Assavendo.', 'Le paiement par carte est traité par Stripe sur une infrastructure sécurisée. Assavendo ne reçoit ni ne conserve votre numéro de carte.\n\nUne commande n’est considérée comme payée qu’après confirmation serveur du paiement. En cas de doute, le statut affiché sur votre lien de suivi se met à jour après vérification.\n\nNe partagez jamais votre lien personnel de commande.', 'Paiement', 'published', 20),
('livraison-et-suivi', 'Livraison et suivi', 'Délais, expédition et suivi des commandes physiques.', 'Les informations de livraison annoncées sur la fiche produit et avant le paiement servent de référence pour la commande.\n\nQuand une commande physique est expédiée, un e-mail de suivi peut être envoyé avec le numéro ou le lien du transporteur lorsqu’il est disponible.\n\nUne commande livrée ne peut pas revenir à un état logistique antérieur.', 'Livraison', 'published', 30),
('telechargements-numeriques', 'Téléchargements numériques', 'Accès, durée et limites des liens de téléchargement.', 'Pour un achat numérique payé, un lien de téléchargement sécurisé est associé à la commande.\n\nLes liens sont limités dans le temps et en nombre d’utilisations. Ils peuvent être révoqués ou renouvelés après vérification par Assavendo.\n\nSi vous ne recevez pas le lien, vérifiez les courriers indésirables puis contactez le support en rappelant l’adresse utilisée pour la commande.', 'Numérique', 'published', 40),
('retours-et-remboursements', 'Retours et remboursements', 'Demander un retour et comprendre les étapes de traitement.', 'Pour un article éligible, la demande de retour se fait depuis le lien personnel de la commande avant l’expiration du délai applicable.\n\nAssavendo examine la demande, indique sa décision et, lorsque le retour physique est reçu, peut remettre l’article en stock lorsque cela est approprié.\n\nLe remboursement est effectué dans Stripe selon le traitement de la commande. Les cas particuliers et exceptions sont décrits dans les conditions de vente.', 'Retours', 'published', 50),
('compte-et-donnees', 'Compte et données personnelles', 'Accès au compte, export et suppression de données.', 'L’accès client fonctionne sans mot de passe par lien envoyé à votre adresse e-mail.\n\nDepuis votre compte, vous pouvez consulter vos commandes, gérer certaines informations, exporter vos données et demander la suppression du compte.\n\nLes pièces comptables légalement conservées sont traitées conformément aux obligations applicables.', 'Compte', 'published', 60),
('avis-verifies', 'Avis vérifiés', 'Comment fonctionne la preuve d’achat et la modération.', 'Un avis peut être marqué comme achat vérifié lorsqu’Assavendo retrouve une commande payée correspondant au produit.\n\nLes invitations post-achat utilisent un lien temporaire et contrôlé. Les avis restent soumis à modération avant publication.\n\nAssavendo ne fabrique pas de compteur d’avis, de rareté ou de remise.', 'Avis', 'published', 70),
('contacter-le-support', 'Contacter le support', 'Créer un ticket et suivre la réponse d’Assavendo.', 'Vous pouvez ouvrir un ticket depuis cette page sans créer de mot de passe.\n\nAprès création, un lien personnel vous permet de consulter le ticket et d’ajouter des messages. Utilisez ce lien avec prudence et ne le transférez pas.\n\nPour une demande liée à une commande, indiquez si possible son numéro afin d’accélérer la vérification.', 'Support', 'published', 80)
on conflict (slug) do update set
  title = excluded.title,
  summary = excluded.summary,
  content = excluded.content,
  category = excluded.category,
  status = excluded.status,
  sort = excluded.sort,
  updated_at = now();

commit;
