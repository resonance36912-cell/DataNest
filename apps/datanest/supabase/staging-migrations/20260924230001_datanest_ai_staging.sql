begin;

create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  job_id uuid not null,
  user_id uuid not null,
  client_session_id uuid not null,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_session_id)
);

create table public.ai_intake_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null unique,
  project_id uuid not null,
  job_id uuid not null,
  session_id uuid not null references public.ai_sessions(id),
  source_type text not null check (source_type in ('human','ai_companion','datanest_ai','legacy_import')),
  source_user_id uuid,
  source_provider text,
  external_ai_session_id uuid,
  parent_event_id uuid references public.ai_intake_events(id),
  client_request_id uuid,
  content text not null check (length(btrim(content)) > 0),
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index ai_intake_human_request_once
on public.ai_intake_events(source_user_id,client_request_id,source_type)
where client_request_id is not null and source_type='human';

create table public.ai_reasoning_envelopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  job_id uuid not null,
  session_id uuid not null references public.ai_sessions(id),
  output_event_id uuid not null unique references public.ai_intake_events(id),
  provider_route text not null,
  policy_version text not null,
  input_event_ids uuid[] not null default '{}',
  certified_memory_ids uuid[] not null default '{}',
  uncertified_event_ids uuid[] not null default '{}',
  request_status text not null,
  created_at timestamptz not null default now()
);

create table public.ai_trend_clusters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  trend_key text not null,
  category text not null,
  normalized_label text not null,
  evidence_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(project_id,trend_key)
);

create table public.ai_trend_evidence (
  cluster_id uuid not null references public.ai_trend_clusters(id) on delete cascade,
  event_id uuid not null references public.ai_intake_events(id),
  created_at timestamptz not null default now(),
  primary key(cluster_id,event_id)
);

create table public.ai_learning_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  normalized_knowledge text not null,
  category text not null,
  risk_class text not null check (risk_class in ('low','normal','high')),
  lifecycle_state text not null default 'INTAKE'
    check (lifecycle_state in (
      'INTAKE','AUDITED','VERIFIED','VALIDATED','STRESS_TESTED',
      'CERTIFICATION_REVIEW','CERTIFIED','NEEDS_EVIDENCE','REJECTED'
    )),
  evidence_count integer not null default 0,
  has_conflict boolean not null default false,
  confidence numeric,
  policy_version text not null,
  content_hash text not null,
  certified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_candidate_evidence (
  candidate_id uuid not null references public.ai_learning_candidates(id) on delete cascade,
  event_id uuid not null references public.ai_intake_events(id),
  created_at timestamptz not null default now(),
  primary key(candidate_id,event_id)
);

create table public.ai_validation_runs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.ai_learning_candidates(id),
  gate text not null check (gate in ('AUDIT','VERIFY','VALIDATE','STRESS_TEST')),
  suite_version text not null,
  passed boolean not null,
  results jsonb not null,
  actor_type text not null check (actor_type in ('automation','human')),
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create table public.ai_certification_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.ai_learning_candidates(id),
  decision text not null check (decision in ('certified','rejected','needs_evidence')),
  authority text not null check (authority in ('automation','admin','owner')),
  actor_user_id uuid,
  risk_class text not null check (risk_class in ('low','normal','high')),
  reason text not null,
  policy_version text not null,
  content_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_memory_supersessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  candidate_id uuid not null references public.ai_learning_candidates(id),
  production_memory_id uuid not null,
  supersedes_memory_id uuid,
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.ai_sessions enable row level security;
alter table public.ai_intake_events enable row level security;
alter table public.ai_reasoning_envelopes enable row level security;
alter table public.ai_trend_clusters enable row level security;
alter table public.ai_trend_evidence enable row level security;
alter table public.ai_learning_candidates enable row level security;
alter table public.ai_candidate_evidence enable row level security;
alter table public.ai_validation_runs enable row level security;
alter table public.ai_certification_decisions enable row level security;
alter table public.ai_memory_supersessions enable row level security;

revoke all on public.ai_sessions from anon, authenticated;
revoke all on public.ai_intake_events from anon, authenticated;
revoke all on public.ai_reasoning_envelopes from anon, authenticated;
revoke all on public.ai_trend_clusters from anon, authenticated;
revoke all on public.ai_trend_evidence from anon, authenticated;
revoke all on public.ai_learning_candidates from anon, authenticated;
revoke all on public.ai_candidate_evidence from anon, authenticated;
revoke all on public.ai_validation_runs from anon, authenticated;
revoke all on public.ai_certification_decisions from anon, authenticated;
revoke all on public.ai_memory_supersessions from anon, authenticated;

create index ai_intake_events_session_time_idx
  on public.ai_intake_events(project_id,job_id,session_id,created_at);
create index ai_learning_candidates_project_state_idx
  on public.ai_learning_candidates(project_id,lifecycle_state,updated_at);
create index ai_validation_runs_candidate_gate_idx
  on public.ai_validation_runs(candidate_id,gate,created_at desc);
create index ai_certification_decisions_candidate_time_idx
  on public.ai_certification_decisions(candidate_id,created_at desc);
create index ai_intake_events_parent_event_idx
  on public.ai_intake_events(parent_event_id);
create index ai_intake_events_session_idx
  on public.ai_intake_events(session_id);
create index ai_reasoning_envelopes_session_idx
  on public.ai_reasoning_envelopes(session_id);
create index ai_trend_evidence_event_idx
  on public.ai_trend_evidence(event_id);
create index ai_candidate_evidence_event_idx
  on public.ai_candidate_evidence(event_id);
create index ai_memory_supersessions_candidate_idx
  on public.ai_memory_supersessions(candidate_id);

commit;
