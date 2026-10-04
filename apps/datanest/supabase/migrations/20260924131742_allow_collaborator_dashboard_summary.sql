
create or replace function public.get_project_dashboard_summary(target_project uuid)
returns jsonb
language sql
stable
set search_path = public, private
as $$
  select case
    when not private.has_project_access(target_project) then
      jsonb_build_object('authorized',false)
    else
      jsonb_build_object(
        'authorized',true,
        'total_jobs',(select count(*) from public.jobs where project_id=target_project),
        'active_jobs',(select count(*) from public.jobs where project_id=target_project and status not in ('COMPLETED','FAILED','CANCELLED')),
        'running_jobs',(select count(*) from public.jobs where project_id=target_project and status='RUNNING'),
        'blocked_jobs',(select count(*) from public.jobs where project_id=target_project and status in ('BLOCKED','BLOCKED_DEPENDENCY','MANUAL_ACTION')),
        'available_capabilities',(select count(*) from public.capabilities where project_id=target_project and state='AVAILABLE' and enabled=true),
        'registered_capabilities',(select count(*) from public.capabilities where project_id=target_project)
      )
  end;
$$;
