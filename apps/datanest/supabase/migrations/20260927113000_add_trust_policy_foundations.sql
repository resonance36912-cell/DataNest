begin;

create schema if not exists private;

create table public.data_policy_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subject_type text not null check (subject_type in (
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  )),
  subject_id uuid,
  subject_reference text,
  visibility_class text not null check (visibility_class in (
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  )),
  reuse_state text not null check (reuse_state in (
    'runtime_only','session_context','project_learning_eligible','project_certified_memory',
    'platform_learning_eligible','datanest_certified_knowledge','publicly_reusable'
  )),
  publication_authorized boolean not null default false,
  status text not null default 'proposed' check (status in ('proposed','active','superseded','rejected')),
  rationale text not null check (length(btrim(rationale))>0),
  evidence_reference text,
  proposed_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  supersedes_binding_id uuid references public.data_policy_bindings(id),
  created_at timestamptz not null default now(),
  check (subject_id is not null or nullif(btrim(coalesce(subject_reference,'')),'') is not null)
);

create index data_policy_bindings_project_idx on public.data_policy_bindings(project_id,created_at desc);
create index data_policy_bindings_subject_idx on public.data_policy_bindings(project_id,subject_type,subject_id);
create index data_policy_bindings_proposed_by_idx on public.data_policy_bindings(proposed_by);
create index data_policy_bindings_approved_by_idx on public.data_policy_bindings(approved_by) where approved_by is not null;
create index data_policy_bindings_supersedes_idx on public.data_policy_bindings(supersedes_binding_id) where supersedes_binding_id is not null;
create unique index data_policy_bindings_one_active_subject_uidx
  on public.data_policy_bindings(
    project_id,
    subject_type,
    coalesce(subject_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_reference,'')
  )
  where status='active';

create table public.trust_manifests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scope_type text not null check (scope_type in ('project','product')),
  product_id uuid references public.products(id) on delete cascade,
  version integer not null check (version>0),
  status text not null default 'draft' check (status in ('draft','active','superseded','rejected')),
  default_visibility_class text not null check (default_visibility_class in (
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  )),
  default_reuse_state text not null check (default_reuse_state in (
    'runtime_only','session_context','project_learning_eligible','project_certified_memory',
    'platform_learning_eligible','datanest_certified_knowledge','publicly_reusable'
  )),
  publication_policy text not null default 'governed_only' check (publication_policy in ('disabled','governed_only')),
  export_policy text not null default 'governed_only' check (export_policy in ('disabled','governed_only')),
  certified_memory_policy text not null default 'existing_governed_pipeline'
    check (certified_memory_policy='existing_governed_pipeline'),
  evidence_state text not null default 'unknown' check (evidence_state in ('verified','partial','planned','unknown')),
  evidence_reference text,
  known_limitations text,
  policy_version text not null check (length(btrim(policy_version))>0),
  effective_from timestamptz,
  review_due_at timestamptz,
  enforcement_mode text not null default 'report_only' check (enforcement_mode in ('report_only','enforced')),
  approved_provider_keys text[] not null default '{}'::text[],
  supersedes_manifest_id uuid references public.trust_manifests(id),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (scope_type='project' and product_id is null)
    or
    (scope_type='product' and product_id is not null)
  )
);

create index trust_manifests_project_idx on public.trust_manifests(project_id,created_at desc);
create index trust_manifests_product_idx on public.trust_manifests(product_id) where product_id is not null;
create index trust_manifests_created_by_idx on public.trust_manifests(created_by);
create index trust_manifests_approved_by_idx on public.trust_manifests(approved_by) where approved_by is not null;
create index trust_manifests_supersedes_idx on public.trust_manifests(supersedes_manifest_id) where supersedes_manifest_id is not null;
create unique index trust_manifests_project_version_uidx
  on public.trust_manifests(project_id,scope_type,version)
  where scope_type='project';
create unique index trust_manifests_product_version_uidx
  on public.trust_manifests(product_id,version)
  where scope_type='product';
create unique index trust_manifests_one_active_project_uidx
  on public.trust_manifests(project_id)
  where status='active' and scope_type='project';
create unique index trust_manifests_one_active_product_uidx
  on public.trust_manifests(product_id)
  where status='active' and scope_type='product';

create table public.provider_trust_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider_connection_id uuid references public.ai_provider_connections(id) on delete set null,
  provider_key text not null check (length(btrim(provider_key))>0),
  provider_category text not null check (provider_category in (
    'ai_model','storage','execution','search','communications','other'
  )),
  status text not null default 'draft' check (status in ('draft','active','restricted','suspended','retired')),
  allowed_visibility_classes text[] not null default '{}'::text[],
  allowed_purposes text[] not null default '{}'::text[],
  prohibited_purposes text[] not null default '{}'::text[],
  allowed_regions text[] not null default '{}'::text[],
  retention_posture text,
  training_reuse_posture text,
  security_evidence_reference text,
  contractual_evidence_reference text,
  data_locality_guarantees text,
  credential_boundary_description text,
  evidence_state text not null default 'unknown' check (evidence_state in ('verified','partial','planned','unknown')),
  policy_version text not null check (length(btrim(policy_version))>0),
  effective_from timestamptz,
  review_due_at timestamptz,
  known_limitations text,
  supersedes_profile_id uuid references public.provider_trust_profiles(id),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (allowed_visibility_classes <@ array[
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  ]::text[]),
  check (allowed_purposes <@ array[
    'job_execution','user_requested_analysis','certification_review','project_learning','platform_learning',
    'product_operation','external_provider_processing','publication','audit','security_investigation',
    'export','retention_management'
  ]::text[]),
  check (prohibited_purposes <@ array[
    'job_execution','user_requested_analysis','certification_review','project_learning','platform_learning',
    'product_operation','external_provider_processing','publication','audit','security_investigation',
    'export','retention_management'
  ]::text[]),
  check (
    status<>'active'
    or (
      cardinality(allowed_visibility_classes)>0
      and cardinality(allowed_purposes)>0
      and evidence_state<>'unknown'
      and nullif(btrim(coalesce(retention_posture,'')),'') is not null
      and nullif(btrim(coalesce(training_reuse_posture,'')),'') is not null
    )
  )
);

create index provider_trust_profiles_project_idx on public.provider_trust_profiles(project_id,created_at desc);
create index provider_trust_profiles_connection_idx on public.provider_trust_profiles(provider_connection_id) where provider_connection_id is not null;
create index provider_trust_profiles_created_by_idx on public.provider_trust_profiles(created_by);
create index provider_trust_profiles_approved_by_idx on public.provider_trust_profiles(approved_by) where approved_by is not null;
create index provider_trust_profiles_supersedes_idx on public.provider_trust_profiles(supersedes_profile_id) where supersedes_profile_id is not null;
create index provider_trust_profiles_key_idx on public.provider_trust_profiles(project_id,provider_key,status);
create unique index provider_trust_profiles_one_current_uidx
  on public.provider_trust_profiles(
    project_id,
    coalesce(provider_connection_id,'00000000-0000-0000-0000-000000000000'::uuid),
    provider_key
  )
  where status in ('active','restricted','suspended');


create table public.data_policy_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trace_id text not null check (length(btrim(trace_id))>0),
  actor_user_id uuid references auth.users(id),
  subject_type text not null check (subject_type in (
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  )),
  subject_id uuid,
  subject_reference text,
  purpose text not null check (purpose in (
    'job_execution','user_requested_analysis','certification_review','project_learning','platform_learning',
    'product_operation','external_provider_processing','publication','audit','security_investigation',
    'export','retention_management'
  )),
  requested_operation text not null check (length(btrim(requested_operation))>0),
  outcome text not null check (outcome in ('allow','deny','review_required')),
  reason_code text not null check (length(btrim(reason_code))>0),
  effective_visibility_class text check (effective_visibility_class is null or effective_visibility_class in (
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  )),
  effective_reuse_state text check (effective_reuse_state is null or effective_reuse_state in (
    'runtime_only','session_context','project_learning_eligible','project_certified_memory',
    'platform_learning_eligible','datanest_certified_knowledge','publicly_reusable'
  )),
  publication_authorized boolean not null default false,
  manifest_id uuid references public.trust_manifests(id) on delete set null,
  binding_id uuid references public.data_policy_bindings(id) on delete set null,
  provider_profile_id uuid references public.provider_trust_profiles(id) on delete set null,
  retention_policy_id uuid,
  enforcement_mode text not null check (enforcement_mode in ('report_only','enforced')),
  policy_version text not null check (length(btrim(policy_version))>0),
  created_at timestamptz not null default now(),
  check (subject_id is not null or nullif(btrim(coalesce(subject_reference,'')),'') is not null)
);

create index data_policy_decisions_project_time_idx on public.data_policy_decisions(project_id,created_at desc);
create index data_policy_decisions_trace_idx on public.data_policy_decisions(trace_id);
create index data_policy_decisions_actor_idx on public.data_policy_decisions(actor_user_id) where actor_user_id is not null;
create index data_policy_decisions_manifest_idx on public.data_policy_decisions(manifest_id) where manifest_id is not null;
create index data_policy_decisions_binding_idx on public.data_policy_decisions(binding_id) where binding_id is not null;
create index data_policy_decisions_provider_profile_idx on public.data_policy_decisions(provider_profile_id) where provider_profile_id is not null;
create index data_policy_decisions_retention_policy_idx on public.data_policy_decisions(retention_policy_id) where retention_policy_id is not null;
create index data_policy_decisions_subject_idx on public.data_policy_decisions(project_id,subject_type,subject_id);
create unique index data_policy_decisions_trace_operation_uidx
  on public.data_policy_decisions(project_id,trace_id,purpose,requested_operation);

alter table public.data_policy_bindings enable row level security;
alter table public.trust_manifests enable row level security;
alter table public.provider_trust_profiles enable row level security;
alter table public.data_policy_decisions enable row level security;

drop policy if exists data_policy_bindings_select on public.data_policy_bindings;
create policy data_policy_bindings_select on public.data_policy_bindings
for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists trust_manifests_select on public.trust_manifests;
create policy trust_manifests_select on public.trust_manifests
for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists provider_trust_profiles_select on public.provider_trust_profiles;
create policy provider_trust_profiles_select on public.provider_trust_profiles
for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists data_policy_decisions_select on public.data_policy_decisions;
create policy data_policy_decisions_select on public.data_policy_decisions
for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.data_policy_bindings from public,anon,authenticated;
revoke all on table public.trust_manifests from public,anon,authenticated;
revoke all on table public.provider_trust_profiles from public,anon,authenticated;
revoke all on table public.data_policy_decisions from public,anon,authenticated;

grant select on table public.data_policy_bindings to authenticated;
grant select on table public.trust_manifests to authenticated;
grant select on table public.provider_trust_profiles to authenticated;
grant select on table public.data_policy_decisions to authenticated;

grant select,insert,update,delete on table public.data_policy_bindings to service_role;
grant select,insert,update,delete on table public.trust_manifests to service_role;
grant select,insert,update,delete on table public.provider_trust_profiles to service_role;
grant select,insert on table public.data_policy_decisions to service_role;

create or replace view public.active_data_policy_binding_view
with (security_invoker=true)
as
select *
from public.data_policy_bindings
where status='active';

create or replace view public.active_trust_manifest_view
with (security_invoker=true)
as
select *
from public.trust_manifests
where status='active';

create or replace view public.active_provider_trust_profile_view
with (security_invoker=true)
as
select *
from public.provider_trust_profiles
where status='active';

revoke all on table public.active_data_policy_binding_view from public,anon,authenticated;
revoke all on table public.active_trust_manifest_view from public,anon,authenticated;
revoke all on table public.active_provider_trust_profile_view from public,anon,authenticated;

grant select on table public.active_data_policy_binding_view to authenticated,service_role;
grant select on table public.active_trust_manifest_view to authenticated,service_role;
grant select on table public.active_provider_trust_profile_view to authenticated,service_role;

commit;
