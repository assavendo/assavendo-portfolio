begin;

create table if not exists public.review_invitations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  token_hash text not null unique default encode(gen_random_bytes(32), 'hex'),
  eligible_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  processing_at timestamptz,
  attempts int not null default 0 check (attempts between 0 and 20),
  last_error text,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create index if not exists review_invitations_due_idx
  on public.review_invitations (eligible_at, sent_at, completed_at)
  where sent_at is null and completed_at is null;

create index if not exists review_invitations_order_idx
  on public.review_invitations (order_id);

create index if not exists review_invitations_product_idx
  on public.review_invitations (product_id);

alter table public.review_invitations enable row level security;
revoke all on public.review_invitations from anon, authenticated;
grant all on public.review_invitations to service_role;

drop policy if exists "admin lit les invitations d'avis" on public.review_invitations;
create policy "admin lit les invitations d'avis"
  on public.review_invitations
  for select to authenticated
  using ((select public.is_admin()));
grant select on public.review_invitations to authenticated;

create or replace function public.create_review_invitations_on_paid()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;

  insert into public.review_invitations (order_id, order_item_id, product_id, eligible_at)
  select
    new.id,
    oi.id,
    oi.product_id,
    case when oi.kind = 'physical'
      then null
      else coalesce(new.paid_at, now()) + interval '3 days'
    end
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = new.id
    and p.allow_reviews
  on conflict (order_id, product_id) do nothing;

  if new.product_id is not null then
    insert into public.review_invitations (order_id, product_id, eligible_at)
    select new.id, p.id, case when p.kind = 'physical'
      then null
      else coalesce(new.paid_at, now()) + interval '3 days'
    end
    from public.products p
    where p.id = new.product_id
      and p.allow_reviews
    on conflict (order_id, product_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.create_review_invitations_on_paid() from public, anon, authenticated;
grant execute on function public.create_review_invitations_on_paid() to service_role;

drop trigger if exists orders_review_invitations_after_paid on public.orders;
create trigger orders_review_invitations_after_paid
  after update of status on public.orders
  for each row
  when (new.status = 'paid' and old.status is distinct from new.status)
  execute function public.create_review_invitations_on_paid();

create or replace function public.activate_review_invitations_after_delivery()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.fulfilment <> 'delivered' or new.delivered_at is null then
    return new;
  end if;
  if old.fulfilment = 'delivered' and old.delivered_at is not distinct from new.delivered_at then
    return new;
  end if;

  update public.review_invitations ri
     set eligible_at = new.delivered_at + interval '3 days'
   where ri.order_id = new.id
     and ri.sent_at is null
     and ri.completed_at is null
     and ri.eligible_at is null
     and exists (
       select 1
       from public.products p
       where p.id = ri.product_id
         and p.kind = 'physical'
         and p.allow_reviews
     );

  return new;
end;
$$;

revoke all on function public.activate_review_invitations_after_delivery() from public, anon, authenticated;
grant execute on function public.activate_review_invitations_after_delivery() to service_role;

drop trigger if exists orders_review_invitations_after_delivery on public.orders;
create trigger orders_review_invitations_after_delivery
  after update of fulfilment, delivered_at on public.orders
  for each row
  when (new.fulfilment = 'delivered' and new.delivered_at is not null)
  execute function public.activate_review_invitations_after_delivery();

commit;
