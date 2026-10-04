
grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.projects,
  public.tool_registry,
  public.project_context,
  public.jobs,
  public.job_steps,
  public.dependencies,
  public.capabilities,
  public.reservations,
  public.runs,
  public.checkpoints,
  public.artifacts,
  public.events,
  public.scheduler_policies
to authenticated;

revoke truncate, references, trigger on table
  public.projects,
  public.tool_registry,
  public.project_context,
  public.jobs,
  public.job_steps,
  public.dependencies,
  public.capabilities,
  public.reservations,
  public.runs,
  public.checkpoints,
  public.artifacts,
  public.events,
  public.scheduler_policies
from authenticated;

grant usage, select on all sequences in schema public to authenticated;
