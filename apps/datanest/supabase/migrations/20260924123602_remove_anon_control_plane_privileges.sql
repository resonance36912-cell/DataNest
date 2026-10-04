
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
from anon;

revoke all on all sequences in schema public from anon;
