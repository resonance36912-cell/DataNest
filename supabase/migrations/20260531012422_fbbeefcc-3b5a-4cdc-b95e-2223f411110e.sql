CREATE TABLE public.audit_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  channel_input text NOT NULL,
  tier text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_usage_user_created ON public.audit_usage (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_usage TO authenticated;
GRANT ALL ON public.audit_usage TO service_role;

ALTER TABLE public.audit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit usage"
  ON public.audit_usage
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service_role_only_insert_audit_usage"
  ON public.audit_usage
  FOR INSERT
  TO service_role
  WITH CHECK (true);