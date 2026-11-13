-- Account/admin hardening: atomic address cap and transactional return processing.
begin;

create or replace function public.add_customer_address(
  p_label text,
  p_full_name text,
  p_line1 text,
  p_line2 text,
  p_postal_code text,
  p_city text,
  p_country text,
  p_phone text
) returns uuid
language plpgsql security invoker set search_path = ''
as $function$
declare
  uid uuid := (select auth.uid());
  n int;
  new_id uuid;
begin
  if uid is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select count(*) into n from public.addresses where user_id = uid;
  if n >= 5 then raise exception 'Vous pouvez enregistrer 5 adresses au maximum.' using errcode = 'P0001'; end if;
  insert into public.addresses(user_id,label,full_name,line1,line2,postal_code,city,country,phone)
  values(uid,btrim(p_label),btrim(p_full_name),btrim(p_line1),nullif(btrim(p_line2),''),btrim(p_postal_code),btrim(p_city),upper(btrim(p_country)),nullif(btrim(p_phone),''))
  returning id into new_id;
  return new_id;
end
$function$;

revoke all on function public.add_customer_address(text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.add_customer_address(text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.admin_process_return(
  p_id uuid,
  p_status text,
  p_admin_note text,
  p_restock boolean default false
) returns void
language plpgsql security invoker set search_path = ''
as $function$
declare
  r record;
  new_status text := btrim(p_status);
  old_status text;
begin
  if new_status not in ('approved','refused','received','refunded') then
    raise exception 'Statut de retour invalide.' using errcode = '22023';
  end if;

  select rr.id, rr.status, o.status as order_status, oi.product_id, oi.variant_id, oi.qty, oi.kind
    into r
  from public.return_requests rr
  join public.order_items oi on oi.id = rr.order_item_id
  join public.orders o on o.id = rr.order_id
  where rr.id = p_id
  for update;

  if not found then raise exception 'Demande de retour introuvable.' using errcode = 'P0002'; end if;
  old_status := r.status;

  if old_status = 'requested' and new_status not in ('approved','refused') then
    raise exception 'Une demande en attente doit être acceptée ou refusée.' using errcode = 'P0001';
  end if;
  if old_status = 'approved' and new_status not in ('received','refused') then
    raise exception 'Transition de retour invalide.' using errcode = 'P0001';
  end if;
  if old_status = 'received' and new_status <> 'refunded' then
    raise exception 'Un retour reçu ne peut être que remboursé ensuite.' using errcode = 'P0001';
  end if;
  if new_status = 'refunded' and r.order_status <> 'refunded' then
    raise exception 'Le remboursement Stripe doit être confirmé avant de clôturer le retour.' using errcode = 'P0001';
  end if;
  if old_status in ('refused','refunded') and new_status <> old_status then
    raise exception 'Ce retour est dans un état final.' using errcode = 'P0001';
  end if;

  if new_status = 'received' and old_status <> 'received' and p_restock and r.kind = 'physical' then
    if r.variant_id is not null then
      update public.product_variants
         set stock_qty = stock_qty + r.qty
       where id = r.variant_id;
      if not found then raise exception 'Déclinaison introuvable : remise en stock impossible.' using errcode = 'P0002'; end if;
    else
      update public.products
         set stock_qty = stock_qty + r.qty
       where id = r.product_id and track_stock;
    end if;
    insert into public.stock_movements(product_id,variant_id,delta,reason,reference)
    values(r.product_id,r.variant_id,r.qty,'retour',p_id::text);
  end if;

  update public.return_requests
     set status = new_status,
         admin_note = coalesce(p_admin_note,''),
         updated_at = now()
   where id = p_id;
end
$function$;

revoke all on function public.admin_process_return(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_process_return(uuid,text,text,boolean) to service_role;

commit;
