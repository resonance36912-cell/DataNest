begin;

create table public.ilm_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version>0),
  status text not null default 'draft' check (status in ('draft','active','suspended','superseded','retired')),
  profile_key text not null check (length(btrim(profile_key))>0),
  display_name text not null check (length(btrim(display_name))>0),
  allowed_purposes text[] not null default '{}'::text[],
  default_capability text not null default 'chat' check (length(btrim(default_capability))>0),
  allowed_resource_kinds text[] not null default '{}'::text[]
    check (allowed_resource_kinds <@ array[
      'local_node','cloud_worker','gpu_runtime','browser_runtime','model_endpoint',
      'storage_endpoint','api_endpoint','external_service','agent_runtime',
      'product_capability','human_specialist'
    ]::text[]),
  memory_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(memory_policy)='object'),
  routing_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(routing_policy)='object'),
  evaluation_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(evaluation_policy)='object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  supersedes_profile_id uuid references public.ilm_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id,profile_key,version)
);

create unique index ilm_profiles_one_active_idx
  on public.ilm_profiles(project_id,profile_key)
  where status='active';
create index ilm_profiles_project_status_idx
  on public.ilm_profiles(project_id,status,created_at desc);
create index ilm_profiles_created_by_idx
  on public.ilm_profiles(created_by,created_at desc);
create index ilm_profiles_approved_by_idx
  on public.ilm_profiles(approved_by)
  where approved_by is not null;
create index ilm_profiles_supersedes_idx
  on public.ilm_profiles(supersedes_profile_id)
  where supersedes_profile_id is not null;

create table public.intelligence_route_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  ai_usage_request_id uuid references public.ai_usage_requests(id) on delete set null,
  trace_id text not null check (length(btrim(trace_id))>0),
  profile_id uuid not null references public.ilm_profiles(id) on delete restrict,
  profile_version integer not null check (profile_version>0),
  purpose text not null check (length(btrim(purpose))>0),
  visibility_class text not null check (visibility_class in (
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  )),
  requested_operation text not null check (requested_operation in ('observe','prepare','write','execute','promote','destruct')),
  requested_capability text not null check (length(btrim(requested_capability))>0),
  certified_memory_ids uuid[] not null default '{}'::uuid[],
  resource_id uuid references public.resource_registry(id) on delete set null,
  capability_id uuid references public.capabilities(id) on delete set null,
  provider_connection_id uuid references public.ai_provider_connections(id) on delete set null,
  provider_key text,
  model_label text,
  route_kind text not null check (route_kind in ('provider_model','local_model','managed_model','tool_agent','memory_only')),
  decision text not null check (decision in ('selected','rejected','review_required')),
  reason_codes text[] not null default '{}'::text[],
  policy_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(policy_evidence)='object'),
  resource_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(resource_evidence)='object'),
  created_at timestamptz not null default now()
);

create unique index intelligence_route_decisions_project_trace_uidx
  on public.intelligence_route_decisions(project_id,trace_id);
create index intelligence_route_decisions_project_created_idx
  on public.intelligence_route_decisions(project_id,created_at desc);
create index intelligence_route_decisions_job_idx
  on public.intelligence_route_decisions(job_id,created_at desc)
  where job_id is not null;
create index intelligence_route_decisions_usage_idx
  on public.intelligence_route_decisions(ai_usage_request_id)
  where ai_usage_request_id is not null;
create index intelligence_route_decisions_profile_idx
  on public.intelligence_route_decisions(profile_id,created_at desc);
create index intelligence_route_decisions_resource_idx
  on public.intelligence_route_decisions(resource_id,capability_id,created_at desc)
  where resource_id is not null;
create index intelligence_route_decisions_provider_idx
  on public.intelligence_route_decisions(provider_connection_id,created_at desc)
  where provider_connection_id is not null;

create table public.intelligence_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  route_decision_id uuid not null references public.intelligence_route_decisions(id) on delete restrict,
  evaluation_key text not null check (length(btrim(evaluation_key))>0),
  evaluation_version text not null check (length(btrim(evaluation_version))>0),
  evaluator_kind text not null check (evaluator_kind in ('deterministic','policy','human_review','certification_suite')),
  status text not null check (status in ('passed','failed','review_required')),
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions)='object'),
  findings jsonb not null default '{}'::jsonb check (jsonb_typeof(findings)='object'),
  evidence_reference text,
  trace_id text not null check (length(btrim(trace_id))>0),
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index intelligence_evaluation_runs_project_trace_uidx
  on public.intelligence_evaluation_runs(project_id,trace_id);
create index intelligence_evaluation_runs_route_idx
  on public.intelligence_evaluation_runs(route_decision_id,evaluated_at desc);
create index intelligence_evaluation_runs_project_idx
  on public.intelligence_evaluation_runs(project_id,evaluated_at desc);

create table public.intelligence_capability_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  capability_id uuid not null references public.capabilities(id) on delete restrict,
  route_decision_id uuid references public.intelligence_route_decisions(id) on delete set null,
  evaluation_run_id uuid references public.intelligence_evaluation_runs(id) on delete set null,
  purpose text not null check (length(btrim(purpose))>0),
  evidence_kind text not null check (evidence_kind in ('route_result','evaluation','certification','operator_review')),
  status text not null check (status in ('supported','degraded','unsupported','unknown')),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics)='object'),
  evidence_reference text,
  trace_id text not null check (length(btrim(trace_id))>0),
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index intelligence_capability_evidence_project_trace_uidx
  on public.intelligence_capability_evidence(project_id,trace_id);
create index intelligence_capability_evidence_resource_idx
  on public.intelligence_capability_evidence(resource_id,capability_id,observed_at desc);
create index intelligence_capability_evidence_route_idx
  on public.intelligence_capability_evidence(route_decision_id)
  where route_decision_id is not null;
create index intelligence_capability_evidence_evaluation_idx
  on public.intelligence_capability_evidence(evaluation_run_id)
  where evaluation_run_id is not null;
create index intelligence_capability_evidence_project_idx
  on public.intelligence_capability_evidence(project_id,observed_at desc);

alter table public.ilm_profiles enable row level security;
alter table public.intelligence_route_decisions enable row level security;
alter table public.intelligence_evaluation_runs enable row level security;
alter table public.intelligence_capability_evidence enable row level security;

create policy ilm_profiles_select on public.ilm_profiles
for select to authenticated
using (private.has_project_access(project_id));

create policy intelligence_route_decisions_select on public.intelligence_route_decisions
for select to authenticated
using (private.has_project_access(project_id));

create policy intelligence_evaluation_runs_select on public.intelligence_evaluation_runs
for select to authenticated
using (private.has_project_access(project_id));

create policy intelligence_capability_evidence_select on public.intelligence_capability_evidence
for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.ilm_profiles from public,anon,authenticated;
revoke all on table public.intelligence_route_decisions from public,anon,authenticated;
revoke all on table public.intelligence_evaluation_runs from public,anon,authenticated;
revoke all on table public.intelligence_capability_evidence from public,anon,authenticated;

grant select on table public.ilm_profiles to authenticated;
grant select on table public.intelligence_route_decisions to authenticated;
grant select on table public.intelligence_evaluation_runs to authenticated;
grant select on table public.intelligence_capability_evidence to authenticated;

grant select,insert,update on table public.ilm_profiles to service_role;
grant select,insert on table public.intelligence_route_decisions to service_role;
grant select,insert on table public.intelligence_evaluation_runs to service_role;
grant select,insert on table public.intelligence_capability_evidence to service_role;

commit;
