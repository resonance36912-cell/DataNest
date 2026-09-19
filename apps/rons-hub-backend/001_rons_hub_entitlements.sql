CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app TEXT NOT NULL CHECK (app IN (
    'epublisher', 'creative_studio', 'sync_vision',
    'youtube_optimizer', 'all_access'
  )),
  tier TEXT NOT NULL CHECK (tier IN (
    'free', 'starter', 'creator', 'pro', 'business', 'all_access',
    'creator_pass', 'studio_pass', 'business_pass'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'active', 'past_due', 'cancelled'
  )),
  payfast_token TEXT,
  payfast_payment_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_by UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  superseded_at TIMESTAMPTZ,
  UNIQUE (user_id, app)
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_payfast_token_idx
  ON public.subscriptions(payfast_token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_superseded_by
  ON public.subscriptions(superseded_by);

COMMENT ON TABLE public.subscriptions IS
  'RONS provider-neutral subscription ledger. Access control is enforced by the loopback gateway and Hub provider adapter.';
