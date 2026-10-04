
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','operator','viewer')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_members enable row level security;

-- Replay-safe bootstrap membership:
-- production had concrete project/user UUIDs at first application, but preview/local
-- databases generate a fresh project UUID and do not copy production auth users.
with p as (
  select id
  from public.projects
  where slug = 'resonance-datanest'
),
u as (
  select id
  from auth.users
  where id = 'd4519e05-b184-476d-85cf-3da806cca822'::uuid
)
insert into public.project_members(project_id,user_id,role,status)
select p.id, u.id, 'owner', 'active'
from p
cross join u
on conflict (project_id,user_id) do update
set role='owner', status='active', updated_at=now();

create or replace function public.is_project_member(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.status = 'active'
  );
$$;

create or replace function public.has_project_role(target_project uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.status = 'active'
      and pm.role = any(allowed_roles)
  );
$$;

create or replace function public.job_project_id(target_job uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select project_id from public.jobs where id = target_job;
$$;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.has_project_role(uuid,text[]) from public;
revoke all on function public.job_project_id(uuid) from public;
grant execute on function public.is_project_member(uuid) to authenticated, service_role;
grant execute on function public.has_project_role(uuid,text[]) to authenticated, service_role;
grant execute on function public.job_project_id(uuid) to authenticated, service_role;

drop policy if exists authenticated_access on public.projects;
drop policy if exists authenticated_access on public.tool_registry;
drop policy if exists authenticated_access on public.project_context;
drop policy if exists authenticated_access on public.capabilities;
drop policy if exists authenticated_access on public.jobs;
drop policy if exists authenticated_access on public.job_steps;
drop policy if exists authenticated_access on public.dependencies;
drop policy if exists authenticated_access on public.reservations;
drop policy if exists authenticated_access on public.runs;
drop policy if exists authenticated_access on public.checkpoints;
drop policy if exists authenticated_access on public.artifacts;
drop policy if exists authenticated_access on public.events;
drop policy if exists authenticated_access on public.scheduler_policies;

create policy project_members_select
on public.project_members for select to authenticated
using (
  user_id = auth.uid()
  or public.has_project_role(project_id, array['owner','admin'])
);

create policy projects_select
on public.projects for select to authenticated
using (public.is_project_member(id));

create policy tool_registry_select
on public.tool_registry for select to authenticated
using (public.is_project_member(project_id));

create policy project_context_select
on public.project_context for select to authenticated
using (public.is_project_member(project_id));

create policy capabilities_select
on public.capabilities for select to authenticated
using (public.is_project_member(project_id));

create policy scheduler_policies_select
on public.scheduler_policies for select to authenticated
using (public.is_project_member(project_id));

create policy jobs_select
on public.jobs for select to authenticated
using (public.is_project_member(project_id));

create policy jobs_insert
on public.jobs for insert to authenticated
with check (public.has_project_role(project_id, array['owner','admin','operator']));

create policy jobs_update
on public.jobs for update to authenticated
using (public.has_project_role(project_id, array['owner','admin','operator']))
with check (public.has_project_role(project_id, array['owner','admin','operator']));

create policy job_steps_select
on public.job_steps for select to authenticated
using (public.is_project_member(public.job_project_id(job_id)));

create policy job_steps_insert
on public.job_steps for insert to authenticated
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy job_steps_update
on public.job_steps for update to authenticated
using (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']))
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy dependencies_select
on public.dependencies for select to authenticated
using (public.is_project_member(public.job_project_id(job_id)));

create policy dependencies_insert
on public.dependencies for insert to authenticated
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy dependencies_delete
on public.dependencies for delete to authenticated
using (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy reservations_select
on public.reservations for select to authenticated
using (public.is_project_member(public.job_project_id(job_id)));

create policy reservations_insert
on public.reservations for insert to authenticated
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy reservations_update
on public.reservations for update to authenticated
using (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']))
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy runs_select
on public.runs for select to authenticated
using (public.is_project_member(public.job_project_id(job_id)));

create policy runs_insert
on public.runs for insert to authenticated
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy runs_update
on public.runs for update to authenticated
using (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']))
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy checkpoints_select
on public.checkpoints for select to authenticated
using (public.is_project_member(public.job_project_id(job_id)));

create policy checkpoints_insert
on public.checkpoints for insert to authenticated
with check (public.has_project_role(public.job_project_id(job_id), array['owner','admin','operator']));

create policy artifacts_select
on public.artifacts for select to authenticated
using (public.is_project_member(project_id));

create policy artifacts_insert
on public.artifacts for insert to authenticated
with check (public.has_project_role(project_id, array['owner','admin','operator']));

create policy events_select
on public.events for select to authenticated
using (public.is_project_member(project_id));

create policy events_insert
on public.events for insert to authenticated
with check (public.has_project_role(project_id, array['owner','admin','operator']));

revoke all on table
  public.project_members,
  public.projects,
  public.tool_registry,
  public.project_context,
  public.capabilities,
  public.jobs,
  public.job_steps,
  public.dependencies,
  public.reservations,
  public.runs,
  public.checkpoints,
  public.artifacts,
  public.events,
  public.scheduler_policies
from authenticated;

grant select on public.project_members to authenticated;
grant select on public.projects to authenticated;
grant select on public.tool_registry to authenticated;
grant select on public.project_context to authenticated;
grant select on public.capabilities to authenticated;
grant select on public.scheduler_policies to authenticated;

grant select, insert, update on public.jobs to authenticated;
grant select, insert, update on public.job_steps to authenticated;
grant select, insert, delete on public.dependencies to authenticated;
grant select, insert, update on public.reservations to authenticated;
grant select, insert, update on public.runs to authenticated;
grant select, insert on public.checkpoints to authenticated;
grant select, insert on public.artifacts to authenticated;
grant select, insert on public.events to authenticated;

grant usage, select on all sequences in schema public to authenticated;
