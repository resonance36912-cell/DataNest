-- Provider-neutral CI settings for the sovereign Hub backend.
-- Authorization is enforced by authenticated Hub server functions.
CREATE TABLE IF NOT EXISTS ci_alert_config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  recipient_email TEXT,
  repos TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_branch_only BOOLEAN NOT NULL DEFAULT TRUE,
  slack_webhook_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ci_alert_config_singleton CHECK (id = 1)
);

INSERT INTO ci_alert_config (id, repos, enabled, default_branch_only)
VALUES (1, '{}', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ci_repo_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  repos TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
