begin;

-- Phase D approved-spec conformance is additive over the merged PR #135 baseline.

alter table public.authority_envelopes
  alter column job_id drop not null,
  add column status text not null default 'draft',
  add column requested_autonomy text,
  add column granted_autonomy text,
  add column allowed_consequence_classes text[] not null default '{}'::text[],
  add column allowed_operation_keys text[] not null default '{}'::text[],
  add column allowed_tool_keys text[] not null default '{}'::text[],
  add column allowed_target_types text[] not null default '{}'::text[],
  add column allowed_target_references text[] not null default '{}'::text[],
  add column allowed_data_classes text[] not null default '{}'::text[],
  add column allowed_purposes text[] not null default '{}'::text[],
  add column allowed_provider_keys text[] not null default '{}'::text[],
  add column max_operation_count integer,
  add column max_concurrent_executions integer,
  add column max_external_calls integer,
  add column max_retry_count integer,
  add column max_runtime_seconds integer,
  add column max_target_count integer,
  add column max_file_change_count integer,
  add column max_external_recipients integer,
  add column resource_limits jsonb not null default '{}'::jsonb,
  add column require_capability_lease boolean not null default true,
  add column require_independent_approval boolean not null default false,
  add column exact_evidence_identity text,
  add column evidence_reference text,
  add column status_reason text,
  add column supersedes_envelope_id uuid references public.authority_envelopes(id) on delete set null;

alter table public.authority_envelopes
  add constraint authority_envelopes_status_check
    check (status in ('draft','proposed','approved','active','paused','exhausted','expired','revoked','superseded','rejected')),
  add constraint authority_envelopes_requested_autonomy_check
    check (requested_autonomy is null or requested_autonomy in ('A0','A1','A2','A3','A4')),
  add constraint authority_envelopes_granted_autonomy_check
    check (granted_autonomy is null or granted_autonomy in ('A0','A1','A2','A3','A4')),
  add constraint authority_envelopes_consequence_classes_check
    check (allowed_consequence_classes <@ array[
      'read_only','advisory','preparatory','reversible_write','external_communication',
      'externally_visible_change','resource_execution','production_change','destructive',
      'legal_commitment','financial_commitment','ownership_or_governance','constitutional'
    ]::text[]),
  add constraint authority_envelopes_resource_limits_object_check
    check (jsonb_typeof(resource_limits)='object'),
  add constraint authority_envelopes_max_operation_count_check
    check (max_operation_count is null or max_operation_count>0),
  add constraint authority_envelopes_max_concurrent_executions_check
    check (max_concurrent_executions is null or max_concurrent_executions>0),
  add constraint authority_envelopes_max_external_calls_check
    check (max_external_calls is null or max_external_calls>0),
  add constraint authority_envelopes_max_retry_count_check
    check (max_retry_count is null or max_retry_count>0),
  add constraint authority_envelopes_max_runtime_seconds_check
    check (max_runtime_seconds is null or max_runtime_seconds>0),
  add constraint authority_envelopes_max_target_count_check
    check (max_target_count is null or max_target_count>0),
  add constraint authority_envelopes_max_file_change_count_check
    check (max_file_change_count is null or max_file_change_count>0),
  add constraint authority_envelopes_max_external_recipients_check
    check (max_external_recipients is null or max_external_recipients>0);

update public.authority_envelopes
set requested_autonomy=autonomy_level,
    granted_autonomy=case when approval_state='approved' then autonomy_level else null end,
    allowed_operation_keys=coalesce(permitted_operations,'{}'::text[]),
    allowed_consequence_classes='{}'::text[],
    status=case approval_state
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'revoked' then 'revoked'
      when 'expired' then 'expired'
      else 'draft'
    end;

alter table public.authority_envelopes
  alter column requested_autonomy set not null;

create index authority_envelopes_canonical_scope_idx
  on public.authority_envelopes(project_id,job_id,status,expires_at);
create index authority_envelopes_supersedes_idx
  on public.authority_envelopes(supersedes_envelope_id)
  where supersedes_envelope_id is not null;

create table public.authority_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  authority_envelope_id uuid not null references public.authority_envelopes(id) on delete cascade,
  approval_type text not null check (approval_type in ('ordinary','independent','exact_action')),
  status text not null check (status in ('approved','rejected','revoked','expired')),
  approver_user_id uuid not null references auth.users(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete cascade,
  operation_key text,
  target_type text,
  target_reference text,
  exact_evidence_identity text,
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions)='object'),
  evidence_reference text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text
);

create index authority_approvals_project_envelope_idx
  on public.authority_approvals(project_id,authority_envelope_id,created_at desc);
create index authority_approvals_exact_action_idx
  on public.authority_approvals(authority_envelope_id,approval_type,status,expires_at)
  where approval_type='exact_action';

alter table public.authority_approvals enable row level security;

create policy authority_approvals_select on public.authority_approvals
for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.authority_approvals from public,anon,authenticated;
grant select on table public.authority_approvals to authenticated;
grant select,insert,update on table public.authority_approvals to service_role;

alter table public.capability_leases
  drop constraint if exists capability_leases_status_check;

update public.capability_leases
set status='cancelled'
where status='released';

alter table public.capability_leases
  add column capability_key text,
  add column allowed_target_types text[] not null default '{}'::text[],
  add column allowed_target_references text[] not null default '{}'::text[],
  add column allowed_consequence_classes text[] not null default '{}'::text[],
  add column evidence_reference text,
  add column supersedes_lease_id uuid references public.capability_leases(id) on delete set null,
  add constraint capability_leases_status_check
    check (status in ('proposed','active','exhausted','expired','paused','revoked','superseded','cancelled')),
  add constraint capability_leases_consequence_classes_check
    check (allowed_consequence_classes <@ array[
      'read_only','advisory','preparatory','reversible_write','external_communication',
      'externally_visible_change','resource_execution','production_change','destructive',
      'legal_commitment','financial_commitment','ownership_or_governance','constitutional'
    ]::text[]);

update public.capability_leases l
set capability_key=c.capability,
    allowed_consequence_classes='{}'::text[]
from public.capabilities c
where c.id=l.capability_id;

alter table public.capability_leases
  alter column capability_key set not null;

create index capability_leases_capability_key_idx
  on public.capability_leases(project_id,capability_key,status,expires_at);
create index capability_leases_supersedes_idx
  on public.capability_leases(supersedes_lease_id)
  where supersedes_lease_id is not null;

alter table public.execution_circuit_breakers
  drop constraint if exists execution_circuit_breakers_category_check,
  drop constraint if exists execution_circuit_breakers_state_check,
  alter column updated_by drop not null,
  add column updated_actor text not null default 'system:phase-d-approved-conformance',
  add column evidence_reference text;

update public.execution_circuit_breakers
set category=case category
      when 'autonomous_write' then 'autonomous_writes'
      when 'deployment' then 'deployments'
      when 'external_communication' then 'external_communications'
      else category
    end,
    state=case state
      when 'open' then 'enabled'
      when 'halted' then 'blocked'
      else state
    end,
    updated_actor=case
      when updated_by is not null then 'user:'||updated_by::text
      else 'system:phase-d-approved-conformance'
    end;

alter table public.execution_circuit_breakers
  add constraint execution_circuit_breakers_category_check
    check (category in ('autonomous_writes','external_communications','deployments','resource_execution')),
  add constraint execution_circuit_breakers_state_check
    check (state in ('enabled','paused','blocked'));

create or replace function private.seed_phase_d_execution_circuit_breakers()
returns trigger
language plpgsql
security definer
set search_path=public,private,auth
as $$
begin
  insert into public.execution_circuit_breakers(
    project_id,category,state,reason,updated_by,updated_actor,updated_at
  )
  select new.id,category,'enabled','Seeded by Phase D approved-spec conformance.',null,
         'system:phase-d-approved-conformance',now()
  from unnest(array[
    'autonomous_writes','external_communications','deployments','resource_execution'
  ]::text[]) category
  on conflict(project_id,category) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_phase_d_execution_circuit_breakers() from public,anon,authenticated;

insert into public.execution_circuit_breakers(
  project_id,category,state,reason,updated_by,updated_actor,updated_at
)
select p.id,category,'enabled','Seeded by Phase D approved-spec conformance.',null,
       'system:phase-d-approved-conformance',now()
from public.projects p
cross join unnest(array[
  'autonomous_writes','external_communications','deployments','resource_execution'
]::text[]) category
on conflict(project_id,category) do nothing;

drop trigger if exists seed_phase_d_execution_circuit_breakers on public.projects;
create trigger seed_phase_d_execution_circuit_breakers
after insert on public.projects
for each row execute function private.seed_phase_d_execution_circuit_breakers();

alter table public.execution_authority_decisions
  add column route_key text,
  add column requesting_user_id uuid references auth.users(id) on delete set null,
  add column actor_type text,
  add column actor_reference text,
  add column requested_consequence_class text,
  add column requested_autonomy text,
  add column granted_autonomy text,
  add column capability_keys text[] not null default '{}'::text[],
  add column capability_lease_ids uuid[] not null default '{}'::uuid[],
  add column breaker_category text,
  add column breaker_state text,
  add column phase_c_decision_id uuid references public.data_policy_decisions(id) on delete set null,
  add column provider_request_id uuid,
  add column reservation_id uuid references public.reservations(id) on delete set null,
  add column exact_evidence_identity text,
  add column enforcement_mode text,
  add column ceiling_snapshot jsonb not null default '{}'::jsonb,
  add constraint execution_authority_decisions_route_key_check
    check (route_key is null or route_key in ('external_ai_provider','job_start')),
  add constraint execution_authority_decisions_consequence_check
    check (requested_consequence_class is null or requested_consequence_class in (
      'read_only','advisory','preparatory','reversible_write','external_communication',
      'externally_visible_change','resource_execution','production_change','destructive',
      'legal_commitment','financial_commitment','ownership_or_governance','constitutional'
    )),
  add constraint execution_authority_decisions_requested_autonomy_check
    check (requested_autonomy is null or requested_autonomy in ('A0','A1','A2','A3','A4')),
  add constraint execution_authority_decisions_granted_autonomy_check
    check (granted_autonomy is null or granted_autonomy in ('A0','A1','A2','A3','A4')),
  add constraint execution_authority_decisions_breaker_state_check
    check (breaker_state is null or breaker_state in ('enabled','paused','blocked')),
  add constraint execution_authority_decisions_enforcement_mode_check
    check (enforcement_mode is null or enforcement_mode in ('report_only','enforced')),
  add constraint execution_authority_decisions_ceiling_snapshot_object_check
    check (jsonb_typeof(ceiling_snapshot)='object');

create index execution_authority_decisions_route_idx
  on public.execution_authority_decisions(project_id,route_key,created_at desc)
  where route_key is not null;
create index execution_authority_decisions_phase_c_idx
  on public.execution_authority_decisions(phase_c_decision_id)
  where phase_c_decision_id is not null;

alter table public.runs
  add column authority_envelope_id uuid references public.authority_envelopes(id) on delete set null,
  add column execution_authority_decision_id uuid references public.execution_authority_decisions(id) on delete set null,
  add column authority_trace_id text;

create index runs_authority_envelope_idx
  on public.runs(authority_envelope_id)
  where authority_envelope_id is not null;
create index runs_execution_authority_decision_idx
  on public.runs(execution_authority_decision_id)
  where execution_authority_decision_id is not null;

commit;
