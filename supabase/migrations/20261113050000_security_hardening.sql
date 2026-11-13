-- Security hardening: explicit server-only RLS denies, safe admin download renewal, FK indexes.
-- Applied to production and kept in source control for reproducibility.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_agents','ai_keys','ai_runs','ai_settings','ai_tasks',
    'dropship_imports','manus_keys','product_likes','product_shares',
    'rate_limits','stock_movements','stripe_events','problems_backup_20261019'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'deny_client_access', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      'deny_client_access', t
    );
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admins','domains','orders','problems','product_deliverables','products'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON backup_20261020.%I', 'deny_client_access', t);
    EXECUTE format(
      'CREATE POLICY %I ON backup_20261020.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      'deny_client_access', t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_renew_download(
  p_order_id uuid,
  p_ttl_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  o public.orders%rowtype;
  renewed int := 0;
begin
  if not public.is_admin() then
    raise exception 'Administrateur requis.' using errcode = '42501';
  end if;
  if p_ttl_days is null or p_ttl_days < 1 or p_ttl_days > 30 then
    raise exception 'Durée de renouvellement invalide.' using errcode = '22023';
  end if;
  select * into o from public.orders x where x.id = p_order_id for update;
  if not found or o.status <> 'paid' or o.needs_review then return 0; end if;
  if o.product_id is not null then
    if not exists (
      select 1 from public.products p
      join public.product_deliverables d on d.product_id = p.id
      where p.id = o.product_id and p.kind = 'digital'
    ) then return 0; end if;
    update public.orders
      set download_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
          expires_at = now() + make_interval(days => p_ttl_days),
          download_count = 0, download_max = 5
      where id = o.id;
    return 1;
  end if;
  update public.order_items i
    set download_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        expires_at = now() + make_interval(days => p_ttl_days),
        download_count = 0, download_max = 5
    where i.order_id = o.id
      and i.kind = 'digital'
      and exists (select 1 from public.product_deliverables d where d.product_id = i.product_id);
  get diagnostics renewed = row_count;
  return renewed;
end
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_renew_download(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_renew_download(uuid, integer) TO authenticated;

CREATE INDEX IF NOT EXISTS ai_runs_key_id_idx ON public.ai_runs (key_id);
CREATE INDEX IF NOT EXISTS ai_tasks_agent_idx ON public.ai_tasks (agent);
CREATE INDEX IF NOT EXISTS collection_items_product_id_idx ON public.collection_items (product_id);
CREATE INDEX IF NOT EXISTS dropship_imports_manus_key_id_idx ON public.dropship_imports (manus_key_id);
CREATE INDEX IF NOT EXISTS favorites_product_id_idx ON public.favorites (product_id);
CREATE INDEX IF NOT EXISTS markets_updated_by_idx ON public.markets (updated_by);
CREATE INDEX IF NOT EXISTS order_items_variant_id_idx ON public.order_items (variant_id);
CREATE INDEX IF NOT EXISTS problems_tool_key_idx ON public.problems (tool_key);
CREATE INDEX IF NOT EXISTS return_requests_order_id_idx ON public.return_requests (order_id);
CREATE INDEX IF NOT EXISTS stock_movements_variant_id_idx ON public.stock_movements (variant_id);
