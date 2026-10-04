-- handle_new_user is only called by an auth trigger; nobody should call it via the API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- has_role is invoked from RLS policies. Restrict direct API execution to authenticated
-- (needed so RLS using has_role() still works); block anon and PUBLIC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;