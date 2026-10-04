
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.monitoring_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL CHECK (kind IN ('uptime','db_health','gsc_drift','edge_health')),
  ok BOOLEAN NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error')),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  alerted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS monitoring_snapshots_ran_at_idx
  ON public.monitoring_snapshots (ran_at DESC);
CREATE INDEX IF NOT EXISTS monitoring_snapshots_kind_ran_idx
  ON public.monitoring_snapshots (kind, ran_at DESC);

GRANT SELECT ON public.monitoring_snapshots TO authenticated;
GRANT ALL ON public.monitoring_snapshots TO service_role;

ALTER TABLE public.monitoring_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read monitoring snapshots"
  ON public.monitoring_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages snapshots"
  ON public.monitoring_snapshots
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
