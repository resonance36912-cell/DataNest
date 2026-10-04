
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_project_member(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, auth
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.status = 'active'
  );
$$;

create or replace function private.has_project_role(target_project uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = private, public, auth
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

create or replace function private.job_project_id(target_job uuid)
returns uuid
language sql
stable
security definer
set search_path = private, public
as $$
  select project_id from public.jobs where id = target_job;
$$;

revoke all on function private.is_project_member(uuid) from public;
revoke all on function private.has_project_role(uuid,text[]) from public;
revoke all on function private.job_project_id(uuid) from public;
grant execute on function private.is_project_member(uuid) to authenticated, service_role;
grant execute on function private.has_project_role(uuid,text[]) to authenticated, service_role;
grant execute on function private.job_project_id(uuid) to authenticated, service_role;

create index if not exists project_members_user_id_idx
  on public.project_members(user_id);

alter policy project_members_select on public.project_members
using (
  user_id = (select auth.uid())
  or private.has_project_role(project_id, array['owner','admin'])
);

alter policy projects_select on public.projects
using (private.is_project_member(id));

alter policy tool_registry_select on public.tool_registry
using (private.is_project_member(project_id));

alter policy project_context_select on public.project_context
using (private.is_project_member(project_id));

alter policy capabilities_select on public.capabilities
using (private.is_project_member(project_id));

alter policy scheduler_policies_select on public.scheduler_policies
using (private.is_project_member(project_id));

alter policy jobs_select on public.jobs
using (private.is_project_member(project_id));

alter policy jobs_insert on public.jobs
with check (private.has_project_role(project_id, array['owner','admin','operator']));

alter policy jobs_update on public.jobs
using (private.has_project_role(project_id, array['owner','admin','operator']))
with check (private.has_project_role(project_id, array['owner','admin','operator']));

alter policy job_steps_select on public.job_steps
using (private.is_project_member(private.job_project_id(job_id)));

alter policy job_steps_insert on public.job_steps
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy job_steps_update on public.job_steps
using (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']))
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy dependencies_select on public.dependencies
using (private.is_project_member(private.job_project_id(job_id)));

alter policy dependencies_insert on public.dependencies
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy dependencies_delete on public.dependencies
using (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy reservations_select on public.reservations
using (private.is_project_member(private.job_project_id(job_id)));

alter policy reservations_insert on public.reservations
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy reservations_update on public.reservations
using (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']))
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy runs_select on public.runs
using (private.is_project_member(private.job_project_id(job_id)));

alter policy runs_insert on public.runs
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy runs_update on public.runs
using (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']))
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy checkpoints_select on public.checkpoints
using (private.is_project_member(private.job_project_id(job_id)));

alter policy checkpoints_insert on public.checkpoints
with check (private.has_project_role(private.job_project_id(job_id), array['owner','admin','operator']));

alter policy artifacts_select on public.artifacts
using (private.is_project_member(project_id));

alter policy artifacts_insert on public.artifacts
with check (private.has_project_role(project_id, array['owner','admin','operator']));

alter policy events_select on public.events
using (private.is_project_member(project_id));

alter policy events_insert on public.events
with check (private.has_project_role(project_id, array['owner','admin','operator']));

drop function if exists public.is_project_member(uuid);
drop function if exists public.has_project_role(uuid,text[]);
drop function if exists public.job_project_id(uuid);
