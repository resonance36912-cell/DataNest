
grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.projects,
  public.project_context,
  public.tool_registry,
  public.capabilities,
  public.jobs,
  public.job_steps,
  public.dependencies,
  public.reservations,
  public.runs,
  public.checkpoints,
  public.artifacts,
  public.events,
  public.scheduler_policies,
  public.project_members,
  public.job_collaborators,
  public.job_inputs,
  public.ai_messages,
  public.ai_development_updates,
  public.ai_prompt_queue,
  public.stakeholder_profiles,
  public.stake_policies,
  public.ai_provider_connections,
  public.contribution_ledger,
  public.product_surfaces,
  public.product_test_cases,
  public.product_test_runs
to service_role;

grant usage, select on all sequences in schema public to service_role;
