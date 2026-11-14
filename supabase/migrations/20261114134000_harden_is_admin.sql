-- Harden RLS by keeping the admin helper invoker-only and separating public/admin SELECT policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.user_id = (SELECT auth.uid())
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

DROP POLICY IF EXISTS "collections publiées" ON public.collections;
CREATE POLICY "collections publiées" ON public.collections
  FOR SELECT TO anon, authenticated
  USING (status = 'published');
DROP POLICY IF EXISTS "admins lisent les collections" ON public.collections;
CREATE POLICY "admins lisent les collections" ON public.collections
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "éléments de collections" ON public.collection_items;
CREATE POLICY "éléments de collections" ON public.collection_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collections c
    WHERE c.id = collection_id AND c.status = 'published'
  ));
DROP POLICY IF EXISTS "admins lisent les éléments de collections" ON public.collection_items;
CREATE POLICY "admins lisent les éléments de collections" ON public.collection_items
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "variantes visibles" ON public.product_variants;
CREATE POLICY "variantes visibles" ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id AND p.status = 'published'
  ));
DROP POLICY IF EXISTS "admins lisent les variantes" ON public.product_variants;
CREATE POLICY "admins lisent les variantes" ON public.product_variants
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
