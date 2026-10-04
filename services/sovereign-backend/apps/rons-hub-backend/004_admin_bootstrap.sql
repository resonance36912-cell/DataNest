CREATE TABLE IF NOT EXISTS admin_bootstrap_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  claimed_by UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_bootstrap_email_challenges (
  user_id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '15 minutes'),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

LOCK TABLE user_roles IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO admin_bootstrap_state (claimed_by, claimed_at)
SELECT user_id, created_at FROM user_roles WHERE role = 'admin'
ORDER BY created_at, id LIMIT 1
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_first_admin_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $rons$
BEGIN
  IF NEW.role <> 'admin' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM admin_bootstrap_state
    WHERE singleton = TRUE AND claimed_by = NEW.user_id
  ) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'first administrator requires the one-time bootstrap claim'
    USING ERRCODE = '42501';
END;
$rons$;

DO $rons$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_first_admin_claim'
      AND tgrelid = 'user_roles'::regclass
  ) THEN
    CREATE TRIGGER enforce_first_admin_claim
    BEFORE INSERT ON user_roles
    FOR EACH ROW EXECUTE FUNCTION enforce_first_admin_claim();
  END IF;
END;
$rons$;

COMMENT ON TABLE admin_bootstrap_state IS
  'Permanent local marker for the one-time first-admin bootstrap.';
COMMENT ON TABLE admin_bootstrap_email_challenges IS
  'Private hash-only email ownership proofs for first-admin bootstrap.';
