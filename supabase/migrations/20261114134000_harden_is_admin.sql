-- Harden the RLS helper used by admin-aware policies.
-- The helper must read the private admins table even when invoked by anon/authenticated.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.user_id = (SELECT auth.uid())
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
