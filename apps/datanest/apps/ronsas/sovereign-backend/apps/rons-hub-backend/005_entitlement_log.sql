CREATE TABLE IF NOT EXISTS public.entitlement_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  app TEXT NOT NULL CHECK (app IN (
    'epublisher', 'creative_studio', 'sync_vision',
    'youtube_optimizer', 'all_access'
  )),
  tier TEXT,
  status TEXT NOT NULL,
  source TEXT,
  error TEXT,
  source_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_log_created_at
  ON public.entitlement_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entitlement_log_user_app
  ON public.entitlement_log (user_id, app, created_at DESC);

COMMENT ON TABLE public.entitlement_log IS
  'RONS provider-neutral entitlement audit ledger. Network access remains loopback-only.';
