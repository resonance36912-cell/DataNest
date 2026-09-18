
CREATE TABLE public.audit_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_input TEXT NOT NULL,
  tier TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_jobs TO authenticated;
GRANT ALL ON public.audit_jobs TO service_role;

ALTER TABLE public.audit_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audit jobs"
  ON public.audit_jobs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all audit jobs"
  ON public.audit_jobs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service_role_insert_audit_jobs"
  ON public.audit_jobs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_update_audit_jobs"
  ON public.audit_jobs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_audit_jobs_user_created ON public.audit_jobs (user_id, created_at DESC);
CREATE INDEX idx_audit_jobs_status ON public.audit_jobs (status);
