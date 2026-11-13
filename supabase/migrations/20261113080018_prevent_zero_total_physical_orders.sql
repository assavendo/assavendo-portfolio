-- Prevent zero-total physical orders: the free-order checkout path has no shipping-address collection.
begin;

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
  if phys and sub + ship = 0 then
    raise exception 'physical_free' using errcode = 'P0001', detail = 'Un produit physique gratuit doit avoir des frais de livraison avant de pouvoir être commandé.';
  end if;
  if sub + ship > 0 and sub + ship < 50 then
    raise exception 'minimum' using errcode = 'P0001', detail = 'Le montant minimum de paiement est de 0,50 €.';
  end if;
  update public.orders set amount_cents = sub + ship, subtotal_cents = sub, shipping_cents = ship where id = oid;
  return query select oid, sub + ship, sub, ship, phys, out_items, null::text;
exception when sqlstate 'P0001' then
  get stacked diagnostics msg = pg_exception_detail;
  return query select null::uuid, 0, 0, 0, false, '[]'::jsonb, msg;
end $$;

revoke all on function public.create_cart_order(jsonb, text, text, text, boolean, text, int) from public, anon, authenticated;
grant execute on function public.create_cart_order(jsonb, text, text, text, boolean, text, int) to service_role;

commit;
