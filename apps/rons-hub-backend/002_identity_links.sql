CREATE TABLE IF NOT EXISTS public.identity_links (
  provider TEXT NOT NULL,
  provider_subject UUID NOT NULL,
  sovereign_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'observed'
    CHECK (status IN ('observed','claimed','revoked')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_identity_links_sovereign_user
  ON public.identity_links(sovereign_user_id);

COMMENT ON TABLE public.identity_links IS
  'Credential-free identity linkage observed from verified hosted authentication. No passwords, tokens, or email addresses are stored.';
