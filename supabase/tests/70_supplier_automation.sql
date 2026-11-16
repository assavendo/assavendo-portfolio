-- Control plane fournisseur : disponibilité fraîche requise au checkout, stock fournisseur et contraintes d'exécution.
create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'ÉCHEC : %', msg; end if;
end $$;

insert into public.supplier_connections (
  id, name, base_url, enabled, auto_order_enabled, webhook_enabled, sync_interval_seconds,
  inventory_method, inventory_path, inventory_response_path, inventory_sku_path, inventory_qty_path,
  order_method, order_path, order_payload_template, auth_header, auth_prefix, status
) values (
  '77777777-7777-7777-7777-777777777771',
  'Fournisseur test live',
  'https://supplier.test',
  true, true, true, 60,
  'GET', '/inventory', 'items', 'sku', 'qty',
  'POST', '/orders', '{}'::jsonb, 'Authorization', 'Bearer', 'healthy'
);

insert into public.products (
  id, slug, title, summary, kind, price_cents, status, published_at,
  track_stock, stock_qty, shipping_cents, seller_type
) values (
  '77777777-7777-7777-7777-777777777772',
  'supplier-live-test',
  'Produit fournisseur live',
  'Produit physique de test du contrôle de fraîcheur fournisseur.',
  'physical', 3900, 'published', now(),
  true, 3, 490, 'supplier'
);

insert into public.product_supplier_mappings (
  id, supplier_connection_id, product_id, variant_id, external_sku,
  enabled, supplier_cost_cents, supplier_currency, supplier_qty, available, last_synced_at
) values (
  '77777777-7777-7777-7777-777777777773',
  '77777777-7777-7777-7777-777777777771',
  '77777777-7777-7777-7777-777777777772',
  null, 'SUP-LIVE-1',
  true, 1800, 'eur', 3, true, null
);

select pg_temp.assert(
  (select error like '%disponibilité fournisseur%' from public.create_cart_order(
    '[{"p":"77777777-7777-7777-7777-777777777772","q":1}]'::jsonb,
    'supplier-stale@example.fr', 'supplier-test-1', 'v1', true, 'iphash'
  )),
  'checkout refusé quand la synchronisation fournisseur est absente'
);

update public.product_supplier_mappings
set last_synced_at = now()
where id = '77777777-7777-7777-7777-777777777773';

create temp table supplier_checkout as
select * from public.create_cart_order(
  '[{"p":"77777777-7777-7777-7777-777777777772","q":1}]'::jsonb,
  'supplier-fresh@example.fr', 'supplier-test-2', 'v1', true, 'iphash'
);

select pg_temp.assert((select error is null from supplier_checkout), 'checkout accepté avec synchronisation fournisseur fraîche');
select pg_temp.assert((select amount_cents = 4390 and has_physical from supplier_checkout), 'prix et livraison recalculés côté base');
select pg_temp.assert(
  (select stock_qty = 2 from public.products where id = '77777777-7777-7777-7777-777777777772'),
  'stock produit décrémenté après réservation'
);
select pg_temp.assert(
  (select row_security from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'supplier_connections'),
  'RLS fournisseur activée'
);
select pg_temp.assert(
  (select row_security from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'supplier_orders'),
  'RLS commandes fournisseur activée'
);