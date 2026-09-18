-- Drop the client-side INSERT policy on user_roles
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;

-- Revoke INSERT from authenticated and anon
REVOKE INSERT ON public.user_roles FROM authenticated, anon;

-- Grant INSERT only to service_role
GRANT INSERT ON public.user_roles TO service_role;