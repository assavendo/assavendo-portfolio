-- Restore the previous invoker helper and the mixed public/admin SELECT policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.user_id = (SELECT auth.uid())
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;

DROP POLICY IF EXISTS "admins lisent les collections" ON public.collections;
DROP POLICY IF EXISTS "collections publiées" ON public.collections;
CREATE POLICY "collections publiées" ON public.collections
  FOR SELECT TO anon, authenticated
  USING (status = 'published' OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "admins lisent les éléments de collections" ON public.collection_items;
DROP POLICY IF EXISTS "éléments de collections" ON public.collection_items;
CREATE POLICY "éléments de collections" ON public.collection_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.collections c
    WHERE c.id = collection_id AND (c.status = 'published' OR (SELECT public.is_admin()))
  ));

DROP POLICY IF EXISTS "admins lisent les variantes" ON public.product_variants;
DROP POLICY IF EXISTS "variantes visibles" ON public.product_variants;
CREATE POLICY "variantes visibles" ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id AND (p.status = 'published' OR (SELECT public.is_admin()))
  ));
