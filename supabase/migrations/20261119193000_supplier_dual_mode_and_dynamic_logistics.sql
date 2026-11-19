begin;

alter table public.supplier_connections
  add column if not exists fulfillment_mode text;

update public.supplier_connections
set fulfillment_mode = case when auto_order_enabled then 'auto' else 'manual' end
where fulfillment_mode is null;

alter table public.supplier_connections
  alter column fulfillment_mode set default 'manual',
  alter column fulfillment_mode set not null;

alter table public.supplier_connections
  drop constraint if exists supplier_connections_fulfillment_mode_check;

alter table public.supplier_connections
  add constraint supplier_connections_fulfillment_mode_check
  check (fulfillment_mode in ('manual','auto'));

alter table public.product_variants
  add column if not exists weight_g integer;

update public.product_variants
set weight_g = case sku
  when 'AV-LMP-01' then 53
  when 'AV-LMP-02' then 53
  when 'AV-LMP-03' then 94
  when 'AV-LMP-04' then 148
  when 'AV-LMP-05' then 141
  when 'AV-LMP-06' then 141
  when 'AV-LMP-07' then 188
  when 'AV-LMP-08' then 188
  when 'AV-LMP-09' then 235
  when 'AV-LMP-10' then 235
  when 'AV-LMP-11' then 282
  when 'AV-LMP-12' then 282
  when 'AV-LMP-13' then 329
  when 'AV-LMP-14' then 329
  when 'AV-LMP-15' then 376
  when 'AV-LMP-16' then 376
  when 'AV-LMP-17' then 492
  when 'AV-LMP-18' then 668
  else weight_g
end
where sku in ('AV-LMP-01','AV-LMP-02','AV-LMP-03','AV-LMP-04','AV-LMP-05','AV-LMP-06','AV-LMP-07','AV-LMP-08','AV-LMP-09','AV-LMP-10','AV-LMP-11','AV-LMP-12','AV-LMP-13','AV-LMP-14','AV-LMP-15','AV-LMP-16','AV-LMP-17','AV-LMP-18');



alter table public.product_variants
  drop constraint if exists product_variants_weight_g_check;

alter table public.product_variants
  add constraint product_variants_weight_g_check
  check (weight_g is null or weight_g > 0);

alter table public.product_supplier_mappings
  add column if not exists logistics_properties text[];

update public.products
set slug = 'lampe-led-detection-mouvement-magnetique',
    description = 'Lampe LED rechargeable à détection de mouvement avec capteur PIR. Elle s’allume automatiquement dans l’obscurité lorsqu’un mouvement est détecté et s’éteint après environ 25 secondes sans mouvement. Fixation sans câblage grâce à un aimant intégré et à un adhésif double face. Recharge USB. Portée indicative de 3 à 6 mètres et angle de détection de 120 degrés selon les caractéristiques communiquées pour ce modèle.'
where id = '54378db7-61c8-4c9f-86f7-55264664b47d'::uuid
  and slug = 'lampe-led-detection-mouvement-magnetique-cj';

update public.product_supplier_mappings
set logistics_properties = array['BATTERY','HAVE_MAGNETISM']::text[]
where product_id = '54378db7-61c8-4c9f-86f7-55264664b47d'::uuid
  and supplier_connection_id = 'a4dece0a-ded4-46e7-87d1-435411a21078'::uuid;


alter table public.product_supplier_mappings
  alter column logistics_properties set default '{}';

update public.product_supplier_mappings
set logistics_properties = case
  when coalesce(logistics_properties, '{}') = '{}' and supplier_connection_id in (
    select id from public.supplier_connections where provider_key = 'cj_dropshipping'
  ) then array['COMMON']::text[]
  else coalesce(logistics_properties, '{}')
end;

alter table public.orders
  add column if not exists shipping_method_code text,
  add column if not exists shipping_method_label text,
  add column if not exists shipping_quote jsonb;

alter table public.supplier_orders
  add column if not exists fulfillment_mode text,
  add column if not exists logistics_name text,
  add column if not exists manual_note text,
  add column if not exists manual_processed_at timestamptz;

alter table public.supplier_orders
  drop constraint if exists supplier_orders_status_check;

alter table public.supplier_orders
  add constraint supplier_orders_status_check
  check (status = any (array[
    'queued','manual_pending','submitting','submitted','confirmed','processing','shipped','delivered','canceled','failed','unknown','needs_review'
  ]));

alter table public.supplier_orders
  drop constraint if exists supplier_orders_fulfillment_mode_check;

alter table public.supplier_orders
  add constraint supplier_orders_fulfillment_mode_check
  check (fulfillment_mode is null or fulfillment_mode in ('manual','auto'));

create index if not exists supplier_connections_fulfillment_mode_idx
  on public.supplier_connections(fulfillment_mode, enabled);

create index if not exists orders_shipping_method_idx
  on public.orders(shipping_method_code);

create index if not exists supplier_orders_manual_pending_idx
  on public.supplier_orders(status, fulfillment_mode, created_at);

drop function if exists public.create_cart_order(jsonb, text, text, text, boolean, text, integer);

create or replace function public.create_cart_order(
  p_lines jsonb,
  p_email text,
  p_visitor text,
  p_terms text,
  p_waiver boolean,
  p_ip_hash text,
  p_hold_minutes integer default 35,
  p_shipping jsonb default null,
  p_shipping_cents integer default null,
  p_shipping_method_code text default null,
  p_shipping_method_label text default null,
  p_shipping_quote jsonb default null
)
returns table(order_id uuid, amount_cents integer, subtotal_cents integer, shipping_cents integer, has_physical boolean, items jsonb, error text)
language plpgsql
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  msg text; l record; p public.products%rowtype; v public.product_variants%rowtype; c public.categories%rowtype;
  oid uuid := gen_random_uuid(); price int; avail int; sub int := 0; ship int := 0; phys boolean := false; has_paid_digital boolean := false;
  out_items jsonb := '[]'::jsonb; seen_phys uuid[] := '{}'; nlines int;
  supplier_enabled boolean; supplier_interval int; supplier_synced_at timestamptz; supplier_mode text; dynamic_shipping_applied boolean := false;
begin
  perform public.expire_stale_orders();
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, 'Panier vide ou invalide.'; return;
  end if;

  if p_shipping_cents is not null and p_shipping_cents < 0 then
    return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, 'Montant de livraison invalide.'; return;
  end if;

  if p_shipping_method_code is not null and char_length(btrim(p_shipping_method_code)) > 120 then
    return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, 'Méthode de livraison invalide.'; return;
  end if;

  insert into public.orders (
    id, product_id, customer_email, amount_cents, status, visitor_id, consent_terms_version, consent_at,
    consent_digital_waiver, consent_ip_hash, stock_reserved, reserved_until, shipping,
    shipping_method_code, shipping_method_label, shipping_quote
  )
  values (
    oid, null, p_email, 0, 'pending', p_visitor, p_terms, now(), coalesce(p_waiver, false), p_ip_hash,
    true, now() + make_interval(mins => greatest(p_hold_minutes, 5)), p_shipping,
    nullif(btrim(p_shipping_method_code), ''), nullif(btrim(p_shipping_method_label), ''), p_shipping_quote
  );

  for l in
    select (x->>'p')::uuid as pid, nullif(x->>'v', '')::uuid as vid, sum(least(greatest((x->>'q')::int, 1), 20)) as qty
    from jsonb_array_elements(p_lines) x group by 1, 2 order by 1, 2
  loop
    select * into p from public.products where id = l.pid and status = 'published' for update;
    if not found then
      raise exception 'indisponible' using errcode = 'P0001', detail = 'Un produit de votre panier n''est plus disponible.';
    end if;

    if p.category_id is not null then
      select * into c from public.categories where id = p.category_id;
      if found and not c.sellable then
        raise exception 'indisponible' using errcode = 'P0001', detail = format('« %s » n''est pas disponible à la vente.', p.title);
      end if;
    end if;

    v := null;
    price := p.price_cents;
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

      if p.seller_type = 'supplier' then
        supplier_enabled := null;
        supplier_mode := null;
        supplier_interval := null;
        supplier_synced_at := null;

        select sc.enabled, sc.fulfillment_mode, sc.sync_interval_seconds, m.last_synced_at
          into supplier_enabled, supplier_mode, supplier_interval, supplier_synced_at
          from public.product_supplier_mappings m
          join public.supplier_connections sc on sc.id = m.supplier_connection_id
         where m.product_id = p.id
           and m.enabled
           and ((m.variant_id is null and v.id is null) or m.variant_id = v.id)
         order by m.available desc, m.last_synced_at desc nulls last
         limit 1;

        if supplier_enabled is null or not supplier_enabled then
          raise exception 'supplier_unavailable' using errcode = 'P0001', detail = format('« %s » est temporairement indisponible : le fournisseur n''est pas correctement connecté.', p.title);
        end if;

        if supplier_synced_at is null or now() - supplier_synced_at > make_interval(secs => greatest(coalesce(supplier_interval, 900), 60) * 3) then
          raise exception 'supplier_stale' using errcode = 'P0001', detail = format('« %s » est temporairement indisponible : la disponibilité fournisseur n''est pas assez récente.', p.title);
        end if;
      end if;

      if p.track_stock then
        avail := case when v.id is not null then v.stock_qty else p.stock_qty end;
        if avail < l.qty then
          raise exception 'stock' using errcode = 'P0001',
            detail = case when avail <= 0 then format('« %s » est épuisé.', p.title)
                          else format('Il ne reste que %s exemplaire(s) de « %s ».', avail, p.title) end;
        end if;
        if v.id is not null then update public.product_variants set stock_qty = stock_qty - l.qty where id = v.id;
        else update public.products set stock_qty = stock_qty - l.qty where id = p.id; end if;
        insert into public.stock_movements (product_id, variant_id, delta, reason, reference)
          values (p.id, v.id, -l.qty, 'vente', oid::text);
      end if;

      if not (p.id = any (seen_phys)) then
        seen_phys := seen_phys || p.id;
        if p.seller_type = 'supplier' and p_shipping_cents is not null then
          if not dynamic_shipping_applied then
            ship := ship + p_shipping_cents;
            dynamic_shipping_applied := true;
          end if;
        else
          ship := ship + coalesce(p.shipping_cents, 0);
        end if;
      end if;
    elsif p.kind = 'digital' and price > 0 then
      has_paid_digital := true;
    end if;

    insert into public.order_items (order_id, product_id, variant_id, title, variant_label, sku, kind, unit_price_cents, qty)
    values (oid, p.id, v.id, p.title, v.label, coalesce(v.sku, p.sku), p.kind, price, l.qty::int);

    sub := sub + price * l.qty::int;
    out_items := out_items || jsonb_build_object(
      'product_id', p.id, 'title', p.title, 'variant_label', v.label, 'unit_price_cents', price,
      'qty', l.qty::int, 'kind', p.kind, 'image', p.images->0->>'url'
    );
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
  get stacked diagnostics msg = pg_exception_detail;
  return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, msg;
end $function$;

commit;