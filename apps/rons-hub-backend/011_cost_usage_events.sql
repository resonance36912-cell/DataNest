-- Authoritative provider/runtime cost evidence for RONSAS costing studies.
-- Prompts, generated content, credentials, provider payloads, and secrets are intentionally excluded.

CREATE TABLE IF NOT EXISTS public.cost_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  app TEXT NOT NULL CHECK (
    app IN ('epublisher','creative_studio','sync_vision','youtube_optimizer','all_access','hub','rons','unknown')
  ),
  operation TEXT NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 120),
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 120),
  model TEXT CHECK (model IS NULL OR char_length(model) BETWEEN 1 AND 200),
  provider_api_cost_usd NUMERIC(20,8) CHECK (
    provider_api_cost_usd IS NULL OR provider_api_cost_usd >= 0
  ),
  infrastructure_cost_status TEXT NOT NULL CHECK (
    infrastructure_cost_status IN ('unmeasured','measured','not_applicable')
  ),
  input_units BIGINT CHECK (input_units IS NULL OR input_units >= 0),
  output_units BIGINT CHECK (output_units IS NULL OR output_units >= 0),
  unit_kind TEXT CHECK (
    unit_kind IS NULL OR unit_kind IN ('tokens','bytes','seconds','frames','operations','requests','pixels')
  ),
  duration_ms BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  evidence_source TEXT NOT NULL CHECK (char_length(evidence_source) BETWEEN 1 AND 120),
  external_provider BOOLEAN NOT NULL DEFAULT FALSE,
  request_id TEXT NOT NULL UNIQUE CHECK (char_length(request_id) BETWEEN 1 AND 200),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cost_usage_events_app_time_idx
  ON public.cost_usage_events(app, occurred_at DESC);
CREATE INDEX IF NOT EXISTS cost_usage_events_provider_time_idx
  ON public.cost_usage_events(provider, occurred_at DESC);

COMMENT ON TABLE public.cost_usage_events IS
  'Sanitized server-authoritative cost/usage evidence. Provider API cost is separate from local infrastructure cost.';
COMMENT ON COLUMN public.cost_usage_events.provider_api_cost_usd IS
  'Observed or provider-derived API charge only; NULL means not measured. Local sovereign providers may record 0.';
COMMENT ON COLUMN public.cost_usage_events.infrastructure_cost_status IS
  'Whether hardware/electricity/depreciation cost is measured independently from provider API charges.';
COMMENT ON COLUMN public.cost_usage_events.metadata IS
  'Sanitized operational measurements only; prompts, generated content, credentials, tokens and raw provider payloads are forbidden.';
