BEGIN;

CREATE TABLE IF NOT EXISTS public.hub_rop_nonces (
  app_id uuid NOT NULL REFERENCES public.hub_apps(id) ON DELETE CASCADE,
  nonce text NOT NULL CHECK (char_length(nonce) BETWEEN 1 AND 64),
  request_timestamp bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, nonce)
);

CREATE INDEX IF NOT EXISTS hub_rop_nonces_expires_at_idx
  ON public.hub_rop_nonces (expires_at);

ALTER TABLE public.hub_rop_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hub_rop_nonces FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.hub_rop_nonces TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rop_nonce(
  _app_id uuid,
  _nonce text,
  _request_timestamp bigint,
  _ttl_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count integer;
  bounded_ttl integer;
BEGIN
  IF _nonce IS NULL OR char_length(_nonce) < 1 OR char_length(_nonce) > 64 THEN
    RETURN false;
  END IF;

  bounded_ttl := GREATEST(1, LEAST(COALESCE(_ttl_seconds, 600), 3600));

  DELETE FROM public.hub_rop_nonces
  WHERE expires_at <= now();

  INSERT INTO public.hub_rop_nonces (app_id, nonce, request_timestamp, expires_at)
  VALUES (
    _app_id,
    _nonce,
    _request_timestamp,
    now() + make_interval(secs => bounded_ttl)
  )
  ON CONFLICT (app_id, nonce) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rop_nonce(uuid, text, bigint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rop_nonce(uuid, text, bigint, integer)
  TO service_role;

COMMIT;
