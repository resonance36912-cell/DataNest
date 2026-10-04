-- Remove unattributed legacy rows before enforcing attribution
DELETE FROM public.audit_logs WHERE user_id IS NULL;

-- Enforce strict attribution
ALTER TABLE public.audit_logs
ALTER COLUMN user_id SET NOT NULL;

-- Keep audit_logs server-only for writes
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_only_insert_audit_logs" ON public.audit_logs;

REVOKE INSERT ON public.audit_logs FROM authenticated, anon;
GRANT INSERT ON public.audit_logs TO service_role;

CREATE POLICY "service_role_only_insert_audit_logs"
ON public.audit_logs
FOR INSERT
TO service_role
WITH CHECK (true);