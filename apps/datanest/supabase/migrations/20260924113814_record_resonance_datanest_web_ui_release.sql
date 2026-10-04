
do $$
declare
  p uuid;
  j uuid;
begin
  select id into p from public.projects where slug='resonance-datanest';

  if not exists (
    select 1 from public.jobs
    where project_id=p and title='Build Resonance DataNest web UI'
  ) then
    insert into public.jobs(
      project_id,title,description,priority,status,required_capabilities,requirements,acceptance
    )
    values(
      p,
      'Build Resonance DataNest web UI',
      'Build the authenticated Resonance DataNest web control plane with UNIFI Planner, TranScheduler queue, capabilities, runs, checkpoints, audit and settings.',
      80,
      'VERIFYING',
      '["repository","database","deployment"]'::jsonb,
      '{"source":"UNIFI","commit":"36444e68df6b1876e8062475c4b1bcd027028bc8"}'::jsonb,
      '{"tests_required":true,"artifact_required":true,"production_build_required":true}'::jsonb
    )
    returning id into j;

    insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position) values
      (j,'STEP-1','Build application UI','repository_work','repository','COMPLETED',1),
      (j,'STEP-2','Validate TypeScript','verification','repository','COMPLETED',2),
      (j,'STEP-3','Validate production build','verification','repository','RUNNING',3),
      (j,'STEP-4','Deploy to Vercel','deployment','deployment','BLOCKED',4);

    insert into public.artifacts(project_id,job_id,name,kind,uri,metadata)
    values(
      p,j,'Resonance DataNest web UI commit','git_commit',
      'https://github.com/DataNest-Supository/DataNest/commit/36444e68df6b1876e8062475c4b1bcd027028bc8',
      '{"branch":"main","workflow_run":35994078578}'::jsonb
    );

    insert into public.events(project_id,job_id,event_type,actor,payload)
    values(
      p,j,'BUILD_VERIFYING','unifi-bootstrapper',
      '{"commit":"36444e68df6b1876e8062475c4b1bcd027028bc8","ci_run":35994078578}'::jsonb
    );
  end if;
end $$;
