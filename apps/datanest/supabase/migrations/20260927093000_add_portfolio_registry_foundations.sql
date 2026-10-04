begin;

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null,
  name text not null,
  item_kind text not null check (item_kind in (
    'governed_product','product_candidate','application','module','capability','external_capability'
  )),
  review_state text not null default 'pending_review' check (review_state in (
    'pending_review','classified','deprecated','retired'
  )),
  current_lifecycle text check (current_lifecycle is null or current_lifecycle in (
    'concept','experiment','validating','candidate','active','maintained','deprecated','retired'
  )),
  linked_product_id uuid references public.products(id) on delete set null,
  source_authority text,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_items_slug_nonempty check (length(btrim(slug)) between 1 and 160),
  constraint portfolio_items_name_nonempty check (length(btrim(name)) between 1 and 240),
  constraint portfolio_items_project_slug_key unique (project_id,slug)
);

create index portfolio_items_project_idx
  on public.portfolio_items(project_id,review_state,item_kind);
create unique index portfolio_items_id_project_unique_idx
  on public.portfolio_items(id,project_id);
create index portfolio_items_linked_product_idx
  on public.portfolio_items(linked_product_id)
  where linked_product_id is not null;
create index portfolio_items_created_by_idx
  on public.portfolio_items(created_by)
  where created_by is not null;
create unique index portfolio_items_linked_product_unique_idx
  on public.portfolio_items(linked_product_id)
  where linked_product_id is not null;
create unique index portfolio_items_source_provenance_unique_idx
  on public.portfolio_items(project_id,source_authority,source_reference)
  where source_reference is not null and source_authority is not null;

create table public.portfolio_classifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  classification text not null check (classification in (
    'product_owned','shared_datanest_capability','independent_datanest_product','registered_external_capability'
  )),
  target_product_id uuid references public.products(id) on delete restrict,
  status text not null default 'proposed' check (status in ('proposed','active','superseded','rejected')),
  rationale text,
  evidence_reference text,
  proposed_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  superseded_at timestamptz,
  constraint portfolio_classification_product_target check (
    classification<>'product_owned' or target_product_id is not null
  )
);

create index portfolio_classifications_project_idx
  on public.portfolio_classifications(project_id,status,created_at desc);
create index portfolio_classifications_item_idx
  on public.portfolio_classifications(portfolio_item_id,status,created_at desc);
create index portfolio_classifications_target_product_idx
  on public.portfolio_classifications(target_product_id)
  where target_product_id is not null;
create index portfolio_classifications_proposed_by_idx
  on public.portfolio_classifications(proposed_by);
create index portfolio_classifications_approved_by_idx
  on public.portfolio_classifications(approved_by)
  where approved_by is not null;
create unique index portfolio_classifications_one_active_idx
  on public.portfolio_classifications(portfolio_item_id)
  where status='active';

create table public.portfolio_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  target_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'contains','uses','provides','depends_on','replaces','supersedes','integrates_with','derived_from'
  )),
  criticality text not null default 'normal' check (criticality in ('optional','normal','critical')),
  status text not null default 'proposed' check (status in ('proposed','active','superseded','rejected')),
  rationale text,
  evidence_reference text,
  proposed_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  superseded_at timestamptz,
  constraint portfolio_relationship_no_self_reference check (source_item_id<>target_item_id)
);

create index portfolio_relationships_project_idx
  on public.portfolio_relationships(project_id,status,relationship_type);
create index portfolio_relationships_source_idx
  on public.portfolio_relationships(source_item_id,status,relationship_type);
create index portfolio_relationships_target_idx
  on public.portfolio_relationships(target_item_id,status,relationship_type);
create index portfolio_relationships_proposed_by_idx
  on public.portfolio_relationships(proposed_by);
create index portfolio_relationships_approved_by_idx
  on public.portfolio_relationships(approved_by)
  where approved_by is not null;
create unique index portfolio_relationships_active_unique_idx
  on public.portfolio_relationships(source_item_id,target_item_id,relationship_type)
  where status='active';

create table public.portfolio_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  from_state text check (from_state is null or from_state in (
    'concept','experiment','validating','candidate','active','maintained','deprecated','retired'
  )),
  to_state text not null check (to_state in (
    'concept','experiment','validating','candidate','active','maintained','deprecated','retired'
  )),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  reason text not null,
  evidence_reference text,
  proposed_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index portfolio_lifecycle_events_project_idx
  on public.portfolio_lifecycle_events(project_id,status,created_at desc);
create index portfolio_lifecycle_events_item_idx
  on public.portfolio_lifecycle_events(portfolio_item_id,status,created_at desc);
create index portfolio_lifecycle_events_proposed_by_idx
  on public.portfolio_lifecycle_events(proposed_by);
create index portfolio_lifecycle_events_approved_by_idx
  on public.portfolio_lifecycle_events(approved_by)
  where approved_by is not null;

alter table public.product_surfaces
  add column if not exists portfolio_item_id uuid;
alter table public.product_surfaces
  add constraint product_surfaces_portfolio_item_project_fkey
  foreign key (portfolio_item_id,project_id)
  references public.portfolio_items(id,project_id)
  on delete set null (portfolio_item_id);
create index if not exists product_surfaces_portfolio_item_idx
  on public.product_surfaces(portfolio_item_id)
  where portfolio_item_id is not null;

alter table public.portfolio_items enable row level security;
alter table public.portfolio_classifications enable row level security;
alter table public.portfolio_relationships enable row level security;
alter table public.portfolio_lifecycle_events enable row level security;

revoke all on table public.portfolio_items from anon, authenticated;
revoke all on table public.portfolio_classifications from anon, authenticated;
revoke all on table public.portfolio_relationships from anon, authenticated;
revoke all on table public.portfolio_lifecycle_events from anon, authenticated;

grant select on table public.portfolio_items to authenticated;
grant select on table public.portfolio_classifications to authenticated;
grant select on table public.portfolio_relationships to authenticated;
grant select on table public.portfolio_lifecycle_events to authenticated;

grant select,insert,update,delete on table public.portfolio_items to service_role;
grant select,insert,update,delete on table public.portfolio_classifications to service_role;
grant select,insert,update,delete on table public.portfolio_relationships to service_role;
grant select,insert,update,delete on table public.portfolio_lifecycle_events to service_role;

create policy portfolio_items_select on public.portfolio_items
for select to authenticated
using (private.is_project_stakeholder(project_id) or private.is_project_member(project_id));

create policy portfolio_classifications_select on public.portfolio_classifications
for select to authenticated
using (private.is_project_stakeholder(project_id) or private.is_project_member(project_id));

create policy portfolio_relationships_select on public.portfolio_relationships
for select to authenticated
using (private.is_project_stakeholder(project_id) or private.is_project_member(project_id));

create policy portfolio_lifecycle_events_select on public.portfolio_lifecycle_events
for select to authenticated
using (private.is_project_stakeholder(project_id) or private.is_project_member(project_id));

create or replace view public.portfolio_registry_view
with (security_invoker=true)
as
select
  i.id,
  i.project_id,
  i.slug,
  i.name,
  i.item_kind,
  i.review_state,
  i.current_lifecycle,
  i.linked_product_id,
  i.source_authority,
  i.source_reference,
  i.metadata,
  i.created_by,
  i.created_at,
  i.updated_at,
  c.id as active_classification_id,
  c.classification as active_classification,
  c.target_product_id,
  p.slug as target_product_slug,
  p.name as target_product_name,
  coalesce(rel.outgoing_relationship_count,0)::integer as outgoing_relationship_count,
  coalesce(rel.incoming_relationship_count,0)::integer as incoming_relationship_count,
  coalesce(lab.surface_count,0)::integer as product_lab_surface_count,
  coalesce(lab.test_run_count,0)::integer as product_lab_test_run_count
from public.portfolio_items i
left join public.portfolio_classifications c
  on c.portfolio_item_id=i.id and c.status='active'
left join public.products p
  on p.id=c.target_product_id
left join lateral (
  select
    count(*) filter (where r.source_item_id=i.id and r.status='active') as outgoing_relationship_count,
    count(*) filter (where r.target_item_id=i.id and r.status='active') as incoming_relationship_count
  from public.portfolio_relationships r
  where r.source_item_id=i.id or r.target_item_id=i.id
) rel on true
left join lateral (
  select
    count(distinct s.id) as surface_count,
    count(tr.id) as test_run_count
  from public.product_surfaces s
  left join public.product_test_runs tr on tr.surface_id=s.id
  where s.portfolio_item_id=i.id
) lab on true;

revoke all on public.portfolio_registry_view from anon;
grant select on public.portfolio_registry_view to authenticated, service_role;

commit;
