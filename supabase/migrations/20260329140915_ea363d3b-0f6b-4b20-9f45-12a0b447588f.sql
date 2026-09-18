-- Add user_id column to audit_logs for attribution
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id uuid;

-- Drop the permissive client-side INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Revoke INSERT from authenticated and anon roles
REVOKE INSERT ON public.audit_logs FROM authenticated, anon;

-- Grant INSERT only to service_role (used by edge functions)
GRANT INSERT ON public.audit_logs TO service_role;