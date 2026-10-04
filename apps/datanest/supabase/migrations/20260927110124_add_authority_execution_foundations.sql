begin;

create table public.authority_envelopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_type text not null check (actor_type in ('human','agent','application','model','service','workflow')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_key text not null check (length(btrim(actor_key))>0),
  sponsor_user_id uuid not null references auth.users(id),
  purpose text not null check (length(btrim(purpose))>0),
  autonomy_level text not null check (autonomy_level in ('A0','A1','A2','A3','A4')),
  permitted_capabilities text[] not null default '{}'::text[],
  permitted_operations text[] not null default '{}'::text[]
    check (permitted_operations <@ array['observe','prepare','write','execute','promote','destruct']::text[]),
  data_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(data_scope)='object'),
  resource_ceiling jsonb not null default '{}'::jsonb check (jsonb_typeof(resource_ceiling)='object'),
  reversibility text not null default 'reversible'
    check (reversibility in ('reversible','conditionally_reversible','irreversible')),
  evidence_requirements jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_requirements)='object'),
  approval_state text not null default 'draft'
    check (approval_state in ('draft','approved','rejected','revoked','expired')),
  trace_key text not null check (length(btrim(trace_key))>0),
  effective_from timestamptz,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  check (expires_at>created_at),
  check ((actor_type='human' and actor_user_id is not null) or actor_type<>'human')
);

create unique index authority_envelopes_project_trace_uidx
  on public.authority_envelopes(project_id,trace_key);
create index authority_envelopes_project_job_state_expiry_idx
  on public.authority_envelopes(project_id,job_id,approval_state,expires_at);
create index authority_envelopes_sponsor_idx
  on public.authority_envelopes(sponsor_user_id);
create index authority_envelopes_product_idx
  on public.authority_envelopes(product_id) where product_id is not null;
create index authority_envelopes_actor_user_idx
  on public.authority_envelopes(actor_user_id) where actor_user_id is not null;
create index authority_envelopes_approved_current_idx
  on public.authority_envelopes(project_id,job_id,expires_at)
  where approval_state='approved' and revoked_at is null;

create table public.capability_leases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  authority_envelope_id uuid not null references public.authority_envelopes(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id) on delete restrict,
  actor_key text not null check (length(btrim(actor_key))>0),
  allowed_operations text[] not null default '{}'::text[]
    check (allowed_operations <@ array['observe','prepare','write','execute','promote','destruct']::text[]),
  data_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(data_scope)='object'),
  resource_ceiling jsonb not null default '{}'::jsonb check (jsonb_typeof(resource_ceiling)='object'),
  approval_level text not null check (approval_level in ('A0','A1','A2','A3')),
  trace_key text not null check (length(btrim(trace_key))>0),
  status text not null default 'active'
    check (status in ('active','released','expired','revoked','exhausted')),
  max_operations integer not null check (max_operations>0),
  used_operations integer not null default 0 check (used_operations>=0 and used_operations<=max_operations),
  expires_at timestamptz not null,
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  last_used_at timestamptz,
  released_at timestamptz,
  release_reason text,
  check (expires_at>issued_at)
);

create unique index capability_leases_project_trace_uidx
  on public.capability_leases(project_id,trace_key);
create index capability_leases_project_job_status_expiry_idx
  on public.capability_leases(project_id,job_id,status,expires_at);
create index capability_leases_envelope_idx
  on public.capability_leases(authority_envelope_id);
create index capability_leases_capability_idx
  on public.capability_leases(capability_id);
create unique index capability_leases_one_active_actor_capability_uidx
  on public.capability_leases(authority_envelope_id,capability_id,actor_key)
  where status='active';

create table public.execution_circuit_breakers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null
    check (category in ('autonomous_write','deployment','external_communication','resource_execution')),
  state text not null default 'open' check (state in ('open','halted')),
  reason text,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(project_id,category)
);

create index execution_circuit_breakers_updated_by_idx
  on public.execution_circuit_breakers(updated_by);

create table public.execution_authority_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_key text not null,
  sponsor_user_id uuid references auth.users(id) on delete set null,
  authority_envelope_id uuid references public.authority_envelopes(id) on delete restrict,
  capability_lease_id uuid references public.capability_leases(id) on delete restrict,
  capability_id uuid references public.capabilities(id) on delete restrict,
  requested_operation text not null
    check (requested_operation in ('observe','prepare','write','execute','promote','destruct')),
  purpose text not null,
  autonomy_level text check (autonomy_level is null or autonomy_level in ('A0','A1','A2','A3','A4')),
  outcome text not null check (outcome in ('allow','deny','review_required')),
  reason_code text not null,
  breaker_snapshot jsonb not null default '{}'::jsonb,
  capability_state_snapshot jsonb not null default '{}'::jsonb,
  resource_usage_snapshot jsonb not null default '{}'::jsonb,
  trace_id text not null,
  created_at timestamptz not null default now()
);

create unique index execution_authority_decisions_idempotency_uidx
  on public.execution_authority_decisions(project_id,trace_id,requested_operation);
create index execution_authority_decisions_project_created_idx
  on public.execution_authority_decisions(project_id,created_at desc);
create index execution_authority_decisions_job_created_idx
  on public.execution_authority_decisions(job_id,created_at desc);
create index execution_authority_decisions_envelope_idx
  on public.execution_authority_decisions(authority_envelope_id) where authority_envelope_id is not null;
create index execution_authority_decisions_lease_idx
  on public.execution_authority_decisions(capability_lease_id) where capability_lease_id is not null;
create index execution_authority_decisions_capability_idx
  on public.execution_authority_decisions(capability_id) where capability_id is not null;
create index execution_authority_decisions_sponsor_idx
  on public.execution_authority_decisions(sponsor_user_id) where sponsor_user_id is not null;

alter table public.reservations
  add column authority_lease_id uuid references public.capability_leases(id) on delete set null;

create index reservations_authority_lease_idx
  on public.reservations(authority_lease_id) where authority_lease_id is not null;

alter table public.authority_envelopes enable row level security;
alter table public.capability_leases enable row level security;
alter table public.execution_circuit_breakers enable row level security;
alter table public.execution_authority_decisions enable row level security;

create policy authority_envelopes_select on public.authority_envelopes
for select to authenticated
using (private.has_project_access(project_id));

create policy capability_leases_select on public.capability_leases
for select to authenticated
using (private.has_project_access(project_id));

create policy execution_circuit_breakers_select on public.execution_circuit_breakers
for select to authenticated
using (private.has_project_access(project_id));

create policy execution_authority_decisions_select on public.execution_authority_decisions
for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.authority_envelopes from public,anon,authenticated;
revoke all on table public.capability_leases from public,anon,authenticated;
revoke all on table public.execution_circuit_breakers from public,anon,authenticated;
revoke all on table public.execution_authority_decisions from public,anon,authenticated;

grant select on table public.authority_envelopes to authenticated;
grant select on table public.capability_leases to authenticated;
grant select on table public.execution_circuit_breakers to authenticated;
grant select on table public.execution_authority_decisions to authenticated;

grant select,insert,update on table public.authority_envelopes to service_role;
grant select,insert,update on table public.capability_leases to service_role;
grant select,insert,update on table public.execution_circuit_breakers to service_role;
grant select,insert on table public.execution_authority_decisions to service_role;

commit;
