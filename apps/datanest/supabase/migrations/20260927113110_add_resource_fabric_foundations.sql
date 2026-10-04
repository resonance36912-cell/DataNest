begin;

create table public.resource_registry (
  id uuid primary key default gen_random_uuid(),
  resource_key text not null unique check (length(btrim(resource_key))>0),
  resource_kind text not null check (resource_kind in (
    'local_node','cloud_worker','gpu_runtime','browser_runtime','model_endpoint',
    'storage_endpoint','api_endpoint','external_service','agent_runtime',
    'product_capability','human_specialist'
  )),
  display_name text not null check (length(btrim(display_name))>0),
  owner_kind text not null default 'project' check (owner_kind in ('project','user','organization','external','system')),
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_label text,
  trust_level text not null default 'unknown' check (trust_level in ('unknown','declared','verified','governed')),
  location_class text not null default 'unknown' check (location_class in (
    'unknown','local_device','local_network','private_cloud','managed_cloud','public_cloud','external','human'
  )),
  region_hint text,
  supported_visibility_classes text[] not null default '{}'::text[]
    check (supported_visibility_classes <@ array[
      'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
    ]::text[]),
  cost_profile jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_profile)='object'),
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits)='object'),
  health_status text not null default 'unknown' check (health_status in ('unknown','healthy','degraded','unhealthy')),
  health_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(health_summary)='object'),
  enabled boolean not null default true,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_by uuid references auth.users(id) on delete set null,
  created_source text not null default 'user' check (created_source in ('user','system_backfill','service')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index resource_registry_kind_health_idx
  on public.resource_registry(resource_kind,enabled,health_status);
create index resource_registry_owner_user_idx
  on public.resource_registry(owner_user_id) where owner_user_id is not null;

create table public.resource_project_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  resource_alias text,
  status text not null default 'proposed' check (status in ('proposed','active','suspended','retired')),
  allowed_capabilities text[] not null default '{}'::text[],
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,resource_id)
);

create index resource_project_bindings_project_status_idx
  on public.resource_project_bindings(project_id,status,updated_at desc);
create index resource_project_bindings_resource_idx
  on public.resource_project_bindings(resource_id,status);
create index resource_project_bindings_created_by_idx
  on public.resource_project_bindings(created_by) where created_by is not null;
create index resource_project_bindings_approved_by_idx
  on public.resource_project_bindings(approved_by) where approved_by is not null;

alter table public.capabilities
  add column if not exists resource_id uuid references public.resource_registry(id) on delete set null;

create index capabilities_resource_idx
  on public.capabilities(resource_id) where resource_id is not null;

create table public.resource_health_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  capability_id uuid references public.capabilities(id) on delete set null,
  health_status text not null check (health_status in ('unknown','healthy','degraded','unhealthy')),
  observed_availability text check (
    observed_availability is null
    or observed_availability in ('AVAILABLE','BUSY','COOLDOWN','EXHAUSTED','UNKNOWN','OFFLINE','DISABLED')
  ),
  source_kind text not null check (source_kind in ('manual','service_probe','runtime_report','provider_status','scheduler')),
  source_key text not null check (length(btrim(source_key))>0),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics)='object'),
  evidence_reference text,
  trace_id text not null check (length(btrim(trace_id))>0),
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index resource_health_observations_project_resource_trace_uidx
  on public.resource_health_observations(project_id,resource_id,trace_id);
create index resource_health_observations_project_observed_idx
  on public.resource_health_observations(project_id,observed_at desc);
create index resource_health_observations_resource_observed_idx
  on public.resource_health_observations(resource_id,observed_at desc);
create index resource_health_observations_capability_idx
  on public.resource_health_observations(capability_id,observed_at desc)
  where capability_id is not null;

create table public.sovereign_node_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  resource_id uuid not null references public.resource_registry(id) on delete restrict,
  version integer not null check (version>0),
  status text not null default 'draft' check (status in ('draft','active','suspended','superseded','retired')),
  allowed_capabilities text[] not null default '{}'::text[],
  resource_ceiling jsonb not null default '{}'::jsonb check (jsonb_typeof(resource_ceiling)='object'),
  schedule_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule_policy)='object'),
  allowed_visibility_classes text[] not null default '{}'::text[]
    check (allowed_visibility_classes <@ array[
      'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
    ]::text[]),
  data_scope jsonb not null default '{}'::jsonb check (jsonb_typeof(data_scope)='object'),
  prohibited_operations text[] not null default '{}'::text[]
    check (prohibited_operations <@ array['observe','prepare','write','execute','promote','destruct']::text[]),
  network_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(network_policy)='object'),
  interactive_remote_control boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  supersedes_policy_id uuid references public.sovereign_node_policies(id) on delete set null,
  created_at timestamptz not null default now(),
  check (interactive_remote_control=false),
  unique(project_id,resource_id,version)
);

create index sovereign_node_policies_project_resource_idx
  on public.sovereign_node_policies(project_id,resource_id,created_at desc);
create index sovereign_node_policies_created_by_idx
  on public.sovereign_node_policies(created_by);
create index sovereign_node_policies_approved_by_idx
  on public.sovereign_node_policies(approved_by) where approved_by is not null;
create index sovereign_node_policies_supersedes_idx
  on public.sovereign_node_policies(supersedes_policy_id) where supersedes_policy_id is not null;
create unique index sovereign_node_policies_one_active_uidx
  on public.sovereign_node_policies(project_id,resource_id)
  where status='active';

-- Conservative compatibility backfill. A legacy account/connector group is not
-- inferred to be a physical computer or a sovereign node.
insert into public.resource_registry(
  resource_key,resource_kind,display_name,owner_kind,trust_level,location_class,
  supported_visibility_classes,cost_profile,limits,health_status,health_summary,
  enabled,metadata,created_by,created_source
)
select
  'legacy:'||c.project_id::text||':'||md5(c.account_key||':'||c.connector_kind),
  'product_capability',
  c.account_key||' · '||c.connector_kind,
  'system',
  'unknown',
  'unknown',
  '{}'::text[],
  '{}'::jsonb,
  '{}'::jsonb,
  'unknown',
  jsonb_build_object('source','legacy-capability-backfill'),
  true,
  jsonb_build_object(
    'legacy_backfill',true,
    'legacy_account_key',c.account_key,
    'legacy_connector_kind',c.connector_kind
  ),
  null,
  'system_backfill'
from (
  select distinct project_id,account_key,connector_kind
  from public.capabilities
) c
on conflict(resource_key) do nothing;

insert into public.resource_project_bindings(
  project_id,resource_id,resource_alias,status,allowed_capabilities,created_by,approved_by,approved_at
)
select
  c.project_id,
  r.id,
  c.account_key,
  'active',
  array_agg(distinct c.capability order by c.capability),
  null,
  null,
  now()
from public.capabilities c
join public.resource_registry r
  on r.resource_key='legacy:'||c.project_id::text||':'||md5(c.account_key||':'||c.connector_kind)
group by c.project_id,r.id,c.account_key
on conflict(project_id,resource_id) do update
set allowed_capabilities=excluded.allowed_capabilities,
    status=case
      when public.resource_project_bindings.status='retired' then public.resource_project_bindings.status
      else 'active'
    end,
    updated_at=now();

update public.capabilities c
set resource_id=r.id
from public.resource_registry r
where c.resource_id is null
  and r.resource_key='legacy:'||c.project_id::text||':'||md5(c.account_key||':'||c.connector_kind);

alter table public.resource_registry enable row level security;
alter table public.resource_project_bindings enable row level security;
alter table public.resource_health_observations enable row level security;
alter table public.sovereign_node_policies enable row level security;

create policy resource_registry_select on public.resource_registry
for select to authenticated
using (
  exists(
    select 1
    from public.resource_project_bindings b
    where b.resource_id=resource_registry.id
      and private.has_project_access(b.project_id)
  )
);

create policy resource_project_bindings_select on public.resource_project_bindings
for select to authenticated
using (private.has_project_access(project_id));

create policy resource_health_observations_select on public.resource_health_observations
for select to authenticated
using (private.has_project_access(project_id));

create policy sovereign_node_policies_select on public.sovereign_node_policies
for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.resource_registry from public,anon,authenticated;
revoke all on table public.resource_project_bindings from public,anon,authenticated;
revoke all on table public.resource_health_observations from public,anon,authenticated;
revoke all on table public.sovereign_node_policies from public,anon,authenticated;

grant select on table public.resource_registry to authenticated;
grant select on table public.resource_project_bindings to authenticated;
grant select on table public.resource_health_observations to authenticated;
grant select on table public.sovereign_node_policies to authenticated;

grant select,insert,update on table public.resource_registry to service_role;
grant select,insert,update on table public.resource_project_bindings to service_role;
grant select,insert on table public.resource_health_observations to service_role;
grant select,insert,update on table public.sovereign_node_policies to service_role;

commit;
