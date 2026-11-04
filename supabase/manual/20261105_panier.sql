-- Assavendo : panier, commandes à lignes, stock réservé. À coller TEL QUEL dans Supabase > SQL Editor > Run, APRÈS 20261104_catalogue.sql. Idempotent.
-- Assavendo : panier multi-produits, commandes à lignes, stock réservé, téléchargements par ligne (cahier §§ commandes, stock, livraison).
-- Additive : les commandes existantes (un produit par commande, jeton sur la commande) restent valides et téléchargeables.
-- Retour arrière : supabase/rollbacks/20261105000000_cart_orders.down.sql
begin;

alter table public.orders alter column product_id drop not null;
create sequence if not exists public.order_number_seq start 1001;
alter table public.orders
  add column if not exists order_number text unique default ('AV-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  add column if not exists subtotal_cents int not null default 0 check (subtotal_cents >= 0),
  add column if not exists shipping_cents int not null default 0 check (shipping_cents >= 0),
  add column if not exists access_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists fulfilment text not null default 'none' check (fulfilment in ('none', 'to_prepare', 'preparing', 'shipped', 'delivered')),
  add column if not exists tracking_number text,
  add column if not exists tracking_url text check (tracking_url is null or tracking_url ~ '^https://'),
  add column if not exists stock_reserved boolean not null default false,
  add column if not exists reserved_until timestamptz;
create index if not exists orders_reserved_idx on public.orders (reserved_until) where stock_reserved and status = 'pending';

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id) on delete set null,
  title text not null,
  variant_label text,
  sku text,
  kind public.product_kind not null,
  unit_price_cents int not null check (unit_price_cents >= 0),
  qty int not null check (qty between 1 and 20),
  line_cents int generated always as (unit_price_cents * qty) stored,
  download_token text unique,
  download_count int not null default 0,
  download_max int not null default 5 check (download_max between 1 and 100),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
alter table public.order_items enable row level security;
drop policy if exists "admin lit les lignes de commande" on public.order_items;
create policy "admin lit les lignes de commande" on public.order_items for select to authenticated using ((select public.is_admin()));
drop policy if exists "admin modifie les lignes de commande" on public.order_items;
create policy "admin modifie les lignes de commande" on public.order_items for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.order_items to authenticated;
grant update (download_token, expires_at, download_max) on public.order_items to authenticated;
grant update (fulfilment, tracking_number, tracking_url) on public.orders to authenticated;

-- ------------------------------------------------------------ libération du stock réservé (commande annulée ou expirée)
create or replace function public.release_order_stock(p_order_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare o public.orders%rowtype; i record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not o.stock_reserved then return; end if;
  for i in select oi.* from public.order_items oi join public.products p on p.id = oi.product_id where oi.order_id = p_order_id and oi.kind = 'physical' and p.track_stock loop
    if i.variant_id is not null then update public.product_variants set stock_qty = stock_qty + i.qty where id = i.variant_id;
    else update public.products set stock_qty = stock_qty + i.qty where id = i.product_id; end if;
    insert into public.stock_movements (product_id, variant_id, delta, reason, reference) values (i.product_id, i.variant_id, i.qty, 'reservation_expiree', o.id::text);
  end loop;
  update public.orders set stock_reserved = false where id = p_order_id;
end $$;
revoke all on function public.release_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.release_order_stock(uuid) to service_role;

create or replace function public.expire_stale_orders() returns int
language plpgsql security invoker set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.orders where status = 'pending' and stock_reserved and reserved_until < now() for update skip locked loop
    perform public.release_order_stock(r.id);
    update public.orders set status = 'canceled' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;
grant execute on function public.expire_stale_orders() to service_role;

-- ------------------------------------------------------------ création atomique d'une commande depuis un panier
-- Les prix, la disponibilité, le stock et la livraison sont TOUS recalculés ici : le client ne transmet que des identifiants et des quantités.
create or replace function public.create_cart_order(
  p_lines jsonb, p_email text, p_visitor text, p_terms text, p_waiver boolean, p_ip_hash text, p_hold_minutes int default 35
) returns table (order_id uuid, amount_cents int, subtotal_cents int, shipping_cents int, has_physical boolean, items jsonb, error text)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  msg text; l record; p public.products%rowtype; v public.product_variants%rowtype; c public.categories%rowtype;
  oid uuid := gen_random_uuid(); price int; avail int; sub int := 0; ship int := 0; phys boolean := false; has_paid_digital boolean := false;
  out_items jsonb := '[]'::jsonb; seen_phys uuid[] := '{}'; nlines int;
begin
  perform public.expire_stale_orders();
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, 'Panier vide ou invalide.'; return;
  end if;
  insert into public.orders (id, product_id, customer_email, amount_cents, status, visitor_id, consent_terms_version, consent_at, consent_digital_waiver, consent_ip_hash, stock_reserved, reserved_until)
  values (oid, null, p_email, 0, 'pending', p_visitor, p_terms, now(), coalesce(p_waiver, false), p_ip_hash, true, now() + make_interval(mins => p_hold_minutes));
  nlines := 0;
  for l in select (x->>'p')::uuid as pid, nullif(x->>'v', '')::uuid as vid, sum(least(greatest((x->>'q')::int, 1), 20)) as qty
             from jsonb_array_elements(p_lines) x group by 1, 2 order by 1, 2 loop
    nlines := nlines + 1;
    select * into p from public.products where id = l.pid and status = 'published' for update;
    if not found then raise exception 'indisponible' using errcode = 'P0001', detail = 'Un produit de votre panier n''est plus disponible.'; end if;
    if p.category_id is not null then
      select * into c from public.categories where id = p.category_id;
      if found and not c.sellable then raise exception 'indisponible' using errcode = 'P0001', detail = format('« %s » n''est pas disponible à la vente.', p.title); end if;
    end if;
    v := null; price := p.price_cents;
    if l.vid is not null then
      select * into v from public.product_variants where id = l.vid and product_id = p.id and active for update;
      if not found then raise exception 'indisponible' using errcode = 'P0001', detail = format('La déclinaison choisie pour « %s » n''est plus disponible.', p.title); end if;
      price := coalesce(v.price_cents, p.price_cents);
    elsif p.kind = 'physical' and exists (select 1 from public.product_variants x where x.product_id = p.id and x.active) then
      raise exception 'indisponible' using errcode = 'P0001', detail = format('Choisissez une déclinaison pour « %s ».', p.title);
    end if;
    if l.qty > 1 and p.kind <> 'physical' then
      raise exception 'indisponible' using errcode = 'P0001', detail = format('« %s » ne se commande qu''en un exemplaire.', p.title);
    end if;
    if p.kind = 'physical' then
      phys := true;
      if p.track_stock then
        avail := case when v.id is not null then v.stock_qty else p.stock_qty end;
        if avail < l.qty then raise exception 'stock' using errcode = 'P0001', detail = case when avail <= 0 then format('« %s » est épuisé.', p.title) else format('Il ne reste que %s exemplaire(s) de « %s ».', avail, p.title) end; end if;
        if v.id is not null then update public.product_variants set stock_qty = stock_qty - l.qty where id = v.id;
        else update public.products set stock_qty = stock_qty - l.qty where id = p.id; end if;
        insert into public.stock_movements (product_id, variant_id, delta, reason, reference) values (p.id, v.id, -l.qty, 'vente', oid::text);
      end if;
      if not (p.id = any (seen_phys)) then seen_phys := seen_phys || p.id; ship := ship + p.shipping_cents; end if;
    elsif p.kind = 'digital' and price > 0 then has_paid_digital := true; end if;
    insert into public.order_items (order_id, product_id, variant_id, title, variant_label, sku, kind, unit_price_cents, qty)
    values (oid, p.id, v.id, p.title, v.label, coalesce(v.sku, p.sku), p.kind, price, l.qty::int);
    sub := sub + price * l.qty::int;
    out_items := out_items || jsonb_build_object('product_id', p.id, 'title', p.title, 'variant_label', v.label, 'unit_price_cents', price, 'qty', l.qty::int, 'kind', p.kind, 'image', p.images->0->>'url');
  end loop;
  if has_paid_digital and not coalesce(p_waiver, false) then
    raise exception 'waiver' using errcode = 'P0001', detail = 'Pour un contenu numérique payant, vous devez accepter la renonciation au droit de rétractation.';
  end if;
  if sub + ship > 0 and sub + ship < 50 then
    raise exception 'minimum' using errcode = 'P0001', detail = 'Le montant minimum de paiement est de 0,50 €.';
  end if;
  update public.orders set amount_cents = sub + ship, subtotal_cents = sub, shipping_cents = ship where id = oid;
  return query select oid, sub + ship, sub, ship, phys, out_items, null::text;
exception when sqlstate 'P0001' then
  -- toute exception annule aussi la réservation de stock et la commande créées plus haut dans ce bloc
  get stacked diagnostics msg = pg_exception_detail;
  return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, msg;
end $$;
revoke all on function public.create_cart_order(jsonb, text, text, text, boolean, text, int) from public, anon, authenticated;
grant execute on function public.create_cart_order(jsonb, text, text, text, boolean, text, int) to service_role;

-- ------------------------------------------------------------ finalisation d'une commande à lignes (webhook Stripe ou commande gratuite)
create or replace function public.fulfil_cart_order(
  p_order_id uuid, p_session_id text, p_amount int, p_currency text, p_payment_intent text,
  p_email text, p_paid_at timestamptz, p_shipping jsonb, p_billing jsonb, p_ttl_days int default 30
) returns table (result text, order_id uuid, customer_email text, email_sent boolean)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare o public.orders%rowtype; phys boolean;
begin
  select * into o from public.orders x where x.id = p_order_id for update;
  if not found then return query select 'not_found'::text, p_order_id, null::text, false; return; end if;
  if o.status = 'refunded' then return query select 'ignored'::text, o.id, o.customer_email, o.email_sent_at is not null; return; end if;
  if o.amount_cents <> p_amount or lower(o.currency) <> lower(p_currency) then
    update public.orders set needs_review = true, review_note = format('Montant ou devise inattendus : attendu %s %s, reçu %s %s', o.amount_cents, o.currency, p_amount, p_currency) where id = o.id;
    return query select 'mismatch'::text, o.id, o.customer_email, false; return;
  end if;
  if o.status = 'paid' then return query select 'already'::text, o.id, o.customer_email, o.email_sent_at is not null; return; end if;
  select exists (select 1 from public.order_items where order_id = o.id and kind = 'physical') into phys;
  update public.orders set
    status = 'paid', paid_at = coalesce(p_paid_at, now()), payment_intent_id = coalesce(p_payment_intent, payment_intent_id),
    stripe_session_id = coalesce(stripe_session_id, p_session_id), customer_email = coalesce(nullif(btrim(p_email), ''), customer_email),
    shipping = coalesce(p_shipping, shipping), billing = coalesce(p_billing, billing), stock_reserved = false,
    fulfilment = case when phys then 'to_prepare' else 'none' end,
    needs_review = needs_review or o.status = 'canceled',
    review_note = case when o.status = 'canceled' then 'Paiement reçu après l''expiration de la réservation : vérifiez le stock avant d''expédier.' else review_note end
  where id = o.id;
  update public.order_items i set
    download_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    expires_at = now() + make_interval(days => greatest(p_ttl_days, 1))
  where i.order_id = o.id and i.kind = 'digital' and exists (select 1 from public.product_deliverables d where d.product_id = i.product_id);
  return query select 'fulfilled'::text, o.id, coalesce(nullif(btrim(p_email), ''), o.customer_email), false;
end $$;
revoke all on function public.fulfil_cart_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int) from public, anon, authenticated;
grant execute on function public.fulfil_cart_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int) to service_role;

-- ------------------------------------------------------------ téléchargement par ligne de commande (même garantie atomique que claim_download)
create or replace function public.claim_item_download(p_token text, p_ip_hash text default null, p_user_agent text default null)
returns table (storage_path text, file_name text, order_id uuid, item_id uuid)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare r record;
begin
  update public.order_items i set download_count = i.download_count + 1
    from public.orders o, public.product_deliverables d
   where i.download_token = p_token and o.id = i.order_id and o.status = 'paid' and d.product_id = i.product_id
     and i.download_count < i.download_max and (i.expires_at is null or i.expires_at > now())
  returning d.storage_path as sp, d.file_name as fn, o.id as oid, i.id as iid into r;
  if r.oid is null then return; end if;
  update public.orders set last_download_at = now() where id = r.oid;
  insert into public.order_downloads (order_id, ip_hash, user_agent) values (r.oid, p_ip_hash, left(p_user_agent, 300));
  return query select r.sp, r.fn, r.oid, r.iid;
end $$;
revoke all on function public.claim_item_download(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_item_download(text, text, text) to service_role;
create or replace function public.release_item_download(p_item_id uuid) returns void
language sql security invoker set search_path = public as $$
  update public.order_items set download_count = greatest(download_count - 1, 0) where id = p_item_id;
$$;
revoke all on function public.release_item_download(uuid) from public, anon, authenticated;
grant execute on function public.release_item_download(uuid) to service_role;

commit;
