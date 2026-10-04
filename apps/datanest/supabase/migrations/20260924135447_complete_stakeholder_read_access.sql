
create or replace function private.has_project_access(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, auth
as $$
  select
    private.is_project_member(target_project)
    or private.is_project_stakeholder(target_project)
    or exists (
      select 1
      from public.job_collaborators jc
      where jc.project_id=target_project
        and jc.user_id=auth.uid()
        and jc.status='accepted'
    );
$$;

alter policy tool_registry_select on public.tool_registry
using (private.has_project_access(project_id));

alter policy capabilities_select on public.capabilities
using (private.has_project_access(project_id));

alter policy project_context_select on public.project_context
using (private.has_project_access(project_id));

alter policy scheduler_policies_select on public.scheduler_policies
using (private.has_project_access(project_id));
