begin;

alter table public.ai_certification_decisions
  add column if not exists evidence_context jsonb not null default '{}'::jsonb;

create table if not exists public.ai_evidence_derivations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  child_event_id uuid not null references public.ai_intake_events(id),
  parent_event_id uuid not null references public.ai_intake_events(id),
  root_event_id uuid not null references public.ai_intake_events(id),
  derivation_kind text not null
    check (derivation_kind in ('translation','paraphrase','summary','transcription','other')),
  transformation_version text not null
    check (length(btrim(transformation_version)) > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(project_id,child_event_id),
  check (child_event_id <> parent_event_id),
  check (child_event_id <> root_event_id)
);

create table if not exists public.ai_evidence_derivation_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  derivation_id uuid not null references public.ai_evidence_derivations(id),
  decision text not null check (decision in ('equivalent','changed')),
  review_basis text not null check (length(btrim(review_basis)) >= 12),
  language_tags text[] not null,
  qualification_ids uuid[] not null,
  reviewer_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.ai_evidence_derivations enable row level security;
alter table public.ai_evidence_derivation_reviews enable row level security;

revoke all on table public.ai_evidence_derivations from public,anon,authenticated;
revoke all on table public.ai_evidence_derivation_reviews from public,anon,authenticated;
revoke update,delete,truncate on table public.ai_evidence_derivations from service_role;
revoke update,delete,truncate on table public.ai_evidence_derivation_reviews from service_role;
grant select,insert on table public.ai_evidence_derivations to service_role;
grant select,insert on table public.ai_evidence_derivation_reviews to service_role;

create index if not exists ai_evidence_derivations_parent_idx
  on public.ai_evidence_derivations(project_id,parent_event_id);
create index if not exists ai_evidence_derivations_root_idx
  on public.ai_evidence_derivations(project_id,root_event_id);
create index if not exists ai_evidence_derivation_reviews_lookup_idx
  on public.ai_evidence_derivation_reviews(project_id,derivation_id,created_at desc);

commit;
