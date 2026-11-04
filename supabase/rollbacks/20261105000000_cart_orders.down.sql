begin;
drop function if exists public.release_item_download(uuid), public.claim_item_download(text, text, text), public.fulfil_cart_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int),
  public.create_cart_order(jsonb, text, text, text, boolean, text, int), public.expire_stale_orders(), public.release_order_stock(uuid);
drop table if exists public.order_items;
alter table public.orders drop column if exists order_number, drop column if exists subtotal_cents, drop column if exists shipping_cents, drop column if exists access_token,
  drop column if exists fulfilment, drop column if exists tracking_number, drop column if exists tracking_url, drop column if exists stock_reserved, drop column if exists reserved_until;
drop sequence if exists public.order_number_seq;
commit;
