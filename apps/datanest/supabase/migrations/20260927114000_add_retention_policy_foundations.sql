begin;

create table public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  policy_key text not null check (length(btrim(policy_key))>0),
  version integer not null check (version>0),
  status text not null default 'draft' check (status in ('draft','active','superseded','rejected')),
  applicable_visibility_classes text[] not null default '{}'::text[],
  applicable_reuse_states text[] not null default '{}'::text[],
  applicable_subject_types text[] not null default '{}'::text[],
  default_retention_days integer check (default_retention_days is null or default_retention_days>=0),
  review_interval_days integer check (review_interval_days is null or review_interval_days>0),
  default_disposition_intent text not null default 'retain' check (default_disposition_intent in (
    'retain','review_due','archive','minimize','delete_when_authorized','legal_hold'
  )),
  rules jsonb not null default '{}'::jsonb,
  minimum_evidence jsonb not null default '{}'::jsonb,
  requires_lineage_review boolean not null default true,
  status_reason text,
  effective_from timestamptz,
  review_due_at timestamptz,
  authority_basis text,
  evidence_reference text,
  supersedes_policy_id uuid references public.retention_policies(id),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id,policy_key,version),
  check (applicable_visibility_classes <@ array[
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  ]::text[]),
  check (applicable_reuse_states <@ array[
    'runtime_only','session_context','project_learning_eligible','project_certified_memory',
    'platform_learning_eligible','datanest_certified_knowledge','publicly_reusable'
  ]::text[]),
  check (applicable_subject_types <@ array[
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  ]::text[]),
  check (default_retention_days is not null or (default_retention_days is null and review_interval_days is not null)),
  check (
    default_retention_days is null
    or (
      default_retention_days is not null
      and nullif(btrim(coalesce(authority_basis,'')),'') is not null
      and nullif(btrim(coalesce(evidence_reference,'')),'') is not null
    )
  ),
  check (
    default_disposition_intent<>'delete_when_authorized'
    or (
      default_disposition_intent='delete_when_authorized'
      and nullif(btrim(coalesce(authority_basis,'')),'') is not null
      and nullif(btrim(coalesce(evidence_reference,'')),'') is not null
    )
  )
);

create index retention_policies_project_idx on public.retention_policies(project_id,created_at desc);
create index retention_policies_supersedes_idx on public.retention_policies(supersedes_policy_id) where supersedes_policy_id is not null;
create index retention_policies_created_by_idx on public.retention_policies(created_by);
create index retention_policies_approved_by_idx on public.retention_policies(approved_by) where approved_by is not null;
create unique index retention_policies_one_active_key_uidx
  on public.retention_policies(project_id,policy_key)
  where status='active';

alter table public.data_policy_decisions
  add constraint data_policy_decisions_retention_policy_fkey
  foreign key (retention_policy_id) references public.retention_policies(id) on delete set null;

alter table public.trust_manifests
  add column if not exists retention_policy_id uuid references public.retention_policies(id) on delete set null;

create index if not exists trust_manifests_retention_policy_idx
  on public.trust_manifests(retention_policy_id)
  where retention_policy_id is not null;

create table public.retention_holds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subject_type text not null check (subject_type in (
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  )),
  subject_id uuid,
  subject_reference text,
  hold_type text not null check (hold_type in ('legal','contractual','audit','security','governance','other')),
  reason text not null check (length(btrim(reason))>0),
  evidence_reference text,
  status text not null default 'active' check (status in ('active','released')),
  placed_by uuid not null references auth.users(id),
  placed_at timestamptz not null default now(),
  released_by uuid references auth.users(id),
  released_at timestamptz,
  release_reason text,
  check (subject_id is not null or nullif(btrim(coalesce(subject_reference,'')),'') is not null),
  check (
    (status='active' and released_by is null and released_at is null)
    or
    (status='released' and released_by is not null and released_at is not null)
  )
);

create index retention_holds_project_idx on public.retention_holds(project_id,placed_at desc);
create index retention_holds_subject_idx on public.retention_holds(project_id,subject_type,subject_id);
create index retention_holds_placed_by_idx on public.retention_holds(placed_by);
create index retention_holds_released_by_idx on public.retention_holds(released_by) where released_by is not null;
create unique index retention_holds_one_active_type_uidx
  on public.retention_holds(
    project_id,
    subject_type,
    coalesce(subject_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_reference,''),
    hold_type
  )
  where status='active';

create table public.retention_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  subject_type text not null check (subject_type in (
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  )),
  subject_id uuid,
  subject_reference text,
  retention_policy_id uuid references public.retention_policies(id) on delete set null,
  status text not null default 'pending' check (status in (
    'pending','keep','blocked','approved_for_future_disposition','superseded'
  )),
  proposed_disposition text not null check (proposed_disposition in (
    'retain','review_due','archive','minimize','delete_when_authorized','legal_hold'
  )),
  policy_version text not null,
  rationale text not null,
  hold_state_snapshot jsonb not null default '{}'::jsonb,
  lineage_state_snapshot jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  reviewed_at timestamptz,
  requested_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  evidence_reference text,
  supersedes_review_id uuid references public.retention_reviews(id),
  created_at timestamptz not null default now(),
  check (subject_id is not null or nullif(btrim(coalesce(subject_reference,'')),'') is not null)
);

create index retention_reviews_project_idx on public.retention_reviews(project_id,created_at desc);
create index retention_reviews_subject_idx on public.retention_reviews(project_id,subject_type,subject_id);
create index retention_reviews_policy_idx on public.retention_reviews(retention_policy_id) where retention_policy_id is not null;
create index retention_reviews_requested_by_idx on public.retention_reviews(requested_by);
create index retention_reviews_reviewed_by_idx on public.retention_reviews(reviewed_by) where reviewed_by is not null;
create index retention_reviews_supersedes_idx on public.retention_reviews(supersedes_review_id) where supersedes_review_id is not null;
create unique index retention_reviews_one_pending_subject_uidx
  on public.retention_reviews(
    project_id,
    subject_type,
    coalesce(subject_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_reference,'')
  )
  where status='pending';

create table public.data_policy_lineage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_subject_type text not null check (source_subject_type in (
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  )),
  source_subject_id uuid,
  source_subject_reference text,
  derived_subject_type text not null check (derived_subject_type in (
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  )),
  derived_subject_id uuid,
  derived_subject_reference text,
  relation_type text not null check (relation_type in (
    'derived_from','summarizes','certifies','publishes','references','exports','evaluates'
  )),
  status text not null default 'active' check (status in ('active','superseded','rejected')),
  evidence_reference text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  supersedes_lineage_id uuid references public.data_policy_lineage(id),
  check (source_subject_id is not null or nullif(btrim(coalesce(source_subject_reference,'')),'') is not null),
  check (derived_subject_id is not null or nullif(btrim(coalesce(derived_subject_reference,'')),'') is not null),
  check (
    source_subject_type<>derived_subject_type
    or coalesce(source_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
       <>coalesce(derived_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
    or coalesce(source_subject_reference,'')<>coalesce(derived_subject_reference,'')
  )
);

create index data_policy_lineage_project_idx on public.data_policy_lineage(project_id,created_at desc);
create index data_policy_lineage_source_idx on public.data_policy_lineage(project_id,source_subject_type,source_subject_id);
create index data_policy_lineage_derived_idx on public.data_policy_lineage(project_id,derived_subject_type,derived_subject_id);
create index data_policy_lineage_created_by_idx on public.data_policy_lineage(created_by);
create index data_policy_lineage_supersedes_idx on public.data_policy_lineage(supersedes_lineage_id) where supersedes_lineage_id is not null;

alter table public.retention_policies enable row level security;
alter table public.retention_holds enable row level security;
alter table public.retention_reviews enable row level security;
alter table public.data_policy_lineage enable row level security;

drop policy if exists retention_policies_select on public.retention_policies;
create policy retention_policies_select on public.retention_policies for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists retention_holds_select on public.retention_holds;
create policy retention_holds_select on public.retention_holds for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists retention_reviews_select on public.retention_reviews;
create policy retention_reviews_select on public.retention_reviews for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists data_policy_lineage_select on public.data_policy_lineage;
create policy data_policy_lineage_select on public.data_policy_lineage for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.retention_policies from public,anon,authenticated;
revoke all on table public.retention_holds from public,anon,authenticated;
revoke all on table public.retention_reviews from public,anon,authenticated;
revoke all on table public.data_policy_lineage from public,anon,authenticated;

grant select on table public.retention_policies to authenticated;
grant select on table public.retention_holds to authenticated;
grant select on table public.retention_reviews to authenticated;
grant select on table public.data_policy_lineage to authenticated;

grant select,insert,update,delete on table public.retention_policies to service_role;
grant select,insert,update,delete on table public.retention_holds to service_role;
grant select,insert,update,delete on table public.retention_reviews to service_role;
grant select,insert,update,delete on table public.data_policy_lineage to service_role;

create or replace view public.retention_review_view
with (security_invoker=true)
as
select
  rr.*,
  coalesce((
    select count(*)::integer
    from public.retention_holds h
    where h.project_id=rr.project_id
      and h.subject_type=rr.subject_type
      and h.status='active'
      and coalesce(h.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
          =coalesce(rr.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(h.subject_reference,'')=coalesce(rr.subject_reference,'')
  ),0) as active_hold_count,
  coalesce((
    select count(*)::integer
    from public.data_policy_lineage l
    where l.project_id=rr.project_id
      and l.status='active'
      and (
        (
          l.source_subject_type=rr.subject_type
          and coalesce(l.source_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
              =coalesce(rr.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
          and coalesce(l.source_subject_reference,'')=coalesce(rr.subject_reference,'')
        )
        or
        (
          l.derived_subject_type=rr.subject_type
          and coalesce(l.derived_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
              =coalesce(rr.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
          and coalesce(l.derived_subject_reference,'')=coalesce(rr.subject_reference,'')
        )
      )
  ),0) as active_lineage_count,
  rp.policy_key,
  rp.version as retention_policy_version,
  rp.default_disposition_intent,
  (
    exists(
      select 1 from public.retention_holds h
      where h.project_id=rr.project_id
        and h.subject_type=rr.subject_type
        and h.status='active'
        and coalesce(h.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
            =coalesce(rr.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(h.subject_reference,'')=coalesce(rr.subject_reference,'')
    )
    or
    (
      rp.requires_lineage_review
      and not exists(
        select 1 from public.data_policy_lineage l
        where l.project_id=rr.project_id
          and l.status='active'
          and (
            (
              l.source_subject_type=rr.subject_type
              and coalesce(l.source_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
                  =coalesce(rr.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
              and coalesce(l.source_subject_reference,'')=coalesce(rr.subject_reference,'')
            )
            or
            (
              l.derived_subject_type=rr.subject_type
              and coalesce(l.derived_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
                  =coalesce(rr.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
              and coalesce(l.derived_subject_reference,'')=coalesce(rr.subject_reference,'')
            )
          )
      )
    )
  ) as future_disposition_blocked
from public.retention_reviews rr
left join public.retention_policies rp on rp.id=rr.retention_policy_id;

revoke all on table public.retention_review_view from public,anon,authenticated;
grant select on table public.retention_review_view to authenticated,service_role;

commit;
