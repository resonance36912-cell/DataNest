
-- 1) Pin search_path on the email queue helpers (previously mutable)
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb)              SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint)              SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)  SET search_path = public, pgmq;

-- 2) Revoke public/anon EXECUTE on SECURITY DEFINER helpers so anonymous callers cannot invoke them
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake()                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)         FROM PUBLIC, anon;

-- Grant back only to the roles that legitimately need to call these
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)              TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint)              TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)  TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch()                  TO service_role;
