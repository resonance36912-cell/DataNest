begin;

create table if not exists public.ai_language_reviewer_qualifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  language_tag text not null,
  qualification_scope text not null
    check (qualification_scope in ('source_language_review','semantic_equivalence')),
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  verified_by uuid not null,
  verified_at timestamptz not null default now(),
  revoked_by uuid,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (active=true and revoked_by is null and revoked_at is null)
    or
    (active=false and revoked_by is not null and revoked_at is not null)
  )
);

alter table public.ai_language_reviewer_qualifications enable row level security;

revoke all on table public.ai_language_reviewer_qualifications from public,anon,authenticated;
grant select,insert,update on table public.ai_language_reviewer_qualifications to service_role;

create index if not exists ai_language_reviewer_qualification_lookup_idx
  on public.ai_language_reviewer_qualifications(project_id,user_id,active,language_tag);

create unique index if not exists ai_language_reviewer_active_unique_idx
  on public.ai_language_reviewer_qualifications(project_id,user_id,language_tag,qualification_scope)
  where active=true;

commit;
