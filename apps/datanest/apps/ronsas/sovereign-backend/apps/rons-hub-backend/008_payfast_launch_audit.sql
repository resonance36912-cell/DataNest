-- Provider-neutral PayFast launch audit for sovereign checkout.
-- Contains launch metadata only; merchant credentials, passphrases and payment tokens are never stored.
CREATE TABLE IF NOT EXISTS public.payfast_launch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  sku TEXT NOT NULL,
  m_payment_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  action_url TEXT NOT NULL,
  sandbox BOOLEAN NOT NULL DEFAULT false,
  source_ip TEXT,
  user_agent TEXT,
  return_to TEXT
);
CREATE INDEX IF NOT EXISTS payfast_launch_logs_user_idx
  ON public.payfast_launch_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payfast_launch_logs_mpid_idx
  ON public.payfast_launch_logs(m_payment_id);
CREATE INDEX IF NOT EXISTS payfast_launch_logs_created_idx
  ON public.payfast_launch_logs(created_at DESC);
COMMENT ON TABLE public.payfast_launch_logs IS
  'RONS checkout launch audit only; no PayFast merchant secret, passphrase, card data or payment token.';