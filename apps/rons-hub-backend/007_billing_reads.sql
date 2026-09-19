-- Provider-neutral billing read models for sovereign Hub account/admin views.
-- These tables are read only through keyed gateway procedures; generic query access is blocked.
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  number TEXT NOT NULL UNIQUE,
  sku TEXT,
  app TEXT,
  tier TEXT,
  billing_cycle TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL CHECK (status IN ('paid','pending','refunded','failed','cancelled')),
  recipient_email TEXT,
  pf_payment_id TEXT,
  m_payment_id TEXT,
  provider TEXT NOT NULL DEFAULT 'payfast',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at TIMESTAMPTZ,
  pdf_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, pf_payment_id)
);
CREATE INDEX IF NOT EXISTS invoices_user_issued_idx ON public.invoices(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(status);
CREATE INDEX IF NOT EXISTS invoices_app_idx ON public.invoices(app);
CREATE TABLE IF NOT EXISTS public.credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  app TEXT NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency TEXT NOT NULL DEFAULT 'credits',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, app)
);
CREATE INDEX IF NOT EXISTS credit_wallets_user_idx ON public.credit_wallets(user_id);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.credit_wallets(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  app TEXT NOT NULL,
  delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL,
  sku TEXT,
  pf_payment_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_app_idx ON public.credit_ledger(user_id, app, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_pf_idx ON public.credit_ledger(pf_payment_id) WHERE pf_payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.billing_receipts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  sku TEXT,
  app TEXT,
  amount_cents INTEGER,
  pf_payment_id TEXT,
  payment_status TEXT
);
CREATE INDEX IF NOT EXISTS billing_receipts_user_received_idx
  ON public.billing_receipts(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS billing_receipts_pf_idx
  ON public.billing_receipts(pf_payment_id) WHERE pf_payment_id IS NOT NULL;

COMMENT ON TABLE public.invoices IS
  'RONS sovereign invoice read model. Access is limited to keyed billing procedures.';
COMMENT ON TABLE public.credit_wallets IS
  'RONS sovereign credit-wallet read model. Access is limited to keyed billing procedures.';
COMMENT ON TABLE public.credit_ledger IS
  'RONS sovereign credit-ledger read model. Access is limited to keyed billing procedures.';
COMMENT ON TABLE public.billing_receipts IS
  'Sanitized accepted-payment receipt projection; raw PayFast payloads are intentionally not stored.';