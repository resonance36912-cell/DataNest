
do $$
declare
  p uuid;
  j uuid;
begin
  select id into p from public.projects where slug='resonance-datanest';

  if not exists (
    select 1 from public.jobs
    where project_id=p and title='Harden provider-agnostic production runtime'
  ) then
    insert into public.jobs(
      project_id,title,description,priority,status,required_capabilities,requirements,acceptance
    )
    values(
      p,
      'Harden provider-agnostic production runtime',
      'Package Resonance DataNest as a standalone Next.js runtime and Docker container with runtime Supabase public configuration and health checks.',
      80,
      'VERIFYING',
      '["repository"]'::jsonb,
      '{"source":"UNIFI","commit":"ca0fbf99d7e5ed5c5b01042d2c1935f430b54a10","hosting":"provider-agnostic"}'::jsonb,
      '{"tests_required":true,"artifact_required":true,"container_build_required":true}'::jsonb
    )
    returning id into j;

    insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position) values
      (j,'STEP-1','Enable standalone runtime','repository_work','repository','COMPLETED',1),
      (j,'STEP-2','Add runtime configuration injection','repository_work','repository','COMPLETED',2),
      (j,'STEP-3','Add Docker and Windows production launchers','repository_work','repository','COMPLETED',3),
      (j,'STEP-4','Validate TypeScript','verification','repository','COMPLETED',4),
      (j,'STEP-5','Validate production build','verification','repository','RUNNING',5),
      (j,'STEP-6','Validate Docker image build','verification','repository','PLANNED',6);

    insert into public.artifacts(project_id,job_id,name,kind,uri,metadata)
    values(
      p,j,'Provider-agnostic runtime hardening commit','git_commit',
      'https://github.com/DataNest-Supository/DataNest/commit/ca0fbf99d7e5ed5c5b01042d2c1935f430b54a10',
      '{"branch":"main","workflow_run":35995490306}'::jsonb
    );

    insert into public.events(project_id,job_id,event_type,actor,payload)
    values(
      p,j,'RUNTIME_HARDENING_VERIFYING','unifi-bootstrapper',
      '{"commit":"ca0fbf99d7e5ed5c5b01042d2c1935f430b54a10","ci_run":35995490306}'::jsonb
    );
  end if;
end $$;
