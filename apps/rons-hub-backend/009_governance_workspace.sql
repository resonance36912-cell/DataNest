CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS governance_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('human','ai','service')),
  user_id UUID,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT governance_participant_identity CHECK (
    (kind='human' AND user_id IS NOT NULL) OR (kind<>'human' AND user_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS governance_participants_user_idx
  ON governance_participants(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS governance_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 1200),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 20 AND 20000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','decision_ready','approved','declined','deferred','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS governance_proposals_status_idx ON governance_proposals(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS governance_proposals_creator_idx ON governance_proposals(created_by,created_at DESC);

CREATE TABLE IF NOT EXISTS governance_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 180),
  kind TEXT NOT NULL CHECK (kind IN ('reference','artifact','hash','note')),
  uri TEXT CHECK (uri IS NULL OR char_length(uri)<=2000),
  sha256 TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[A-Fa-f0-9]{64}$'),
  summary TEXT CHECK (summary IS NULL OR char_length(summary)<=2000),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT governance_evidence_content CHECK (uri IS NOT NULL OR sha256 IS NOT NULL OR summary IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS governance_evidence_proposal_idx ON governance_evidence(proposal_id,created_at);

CREATE TABLE IF NOT EXISTS governance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES governance_participants(id),
  stance TEXT NOT NULL CHECK (stance IN ('support','oppose','neutral','abstain')),
  rationale TEXT NOT NULL CHECK (char_length(rationale) BETWEEN 10 AND 8000),
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS governance_reviews_proposal_idx ON governance_reviews(proposal_id,created_at);
CREATE INDEX IF NOT EXISTS governance_reviews_participant_idx ON governance_reviews(participant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS governance_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL UNIQUE REFERENCES governance_proposals(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','declined','deferred')),
  rationale TEXT NOT NULL CHECK (char_length(rationale) BETWEEN 10 AND 10000),
  decided_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance_events (
  id BIGSERIAL PRIMARY KEY,
  proposal_id UUID REFERENCES governance_proposals(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 120),
  actor_user_id UUID,
  participant_id UUID REFERENCES governance_participants(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS governance_events_proposal_idx ON governance_events(proposal_id,created_at DESC);
CREATE INDEX IF NOT EXISTS governance_events_type_idx ON governance_events(event_type,created_at DESC);

COMMENT ON TABLE governance_proposals IS 'Provider-neutral RONSAS governance proposal ledger.';
COMMENT ON TABLE governance_decisions IS 'Human-admin canonical governance decisions; AI/service participants are advisory.';
