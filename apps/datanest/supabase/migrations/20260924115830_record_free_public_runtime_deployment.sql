
do $$
declare
  p uuid;
  j uuid;
begin
  select id into p from public.projects where slug='resonance-datanest';

  if not exists (
    select 1 from public.jobs
    where project_id=p and title='Publish Resonance DataNest free web runtime'
  ) then
    insert into public.jobs(
      project_id,title,description,priority,status,required_capabilities,requirements,acceptance
    )
    values(
      p,
      'Publish Resonance DataNest free web runtime',
      'Publish the authenticated Resonance DataNest UI using GitHub Pages while retaining Supabase as the live backend and preserving standalone/Docker deployment support.',
      80,
      'VERIFYING',
      '["repository"]'::jsonb,
      '{"source":"UNIFI","commit":"6af7231e1b26c6eb0818b15eda69bff24f44d10c","hosting":"github-pages","cost_policy":"free"}'::jsonb,
      '{"tests_required":true,"artifact_required":true,"public_url_required":true}'::jsonb
    )
    returning id into j;

    insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position) values
      (j,'STEP-1','Preserve standalone deployment path','repository_work','repository','COMPLETED',1),
      (j,'STEP-2','Add static export mode','repository_work','repository','COMPLETED',2),
      (j,'STEP-3','Generate public runtime configuration','configuration','repository','COMPLETED',3),
      (j,'STEP-4','Validate Pages build','verification','repository','RUNNING',4),
      (j,'STEP-5','Deploy GitHub Pages','deployment','repository','PLANNED',5),
      (j,'STEP-6','Verify public application','browser_validation','repository','PLANNED',6);

    insert into public.artifacts(project_id,job_id,name,kind,uri,metadata)
    values(
      p,j,'GitHub Pages deployment commit','git_commit',
      'https://github.com/DataNest-Supository/DataNest/commit/6af7231e1b26c6eb0818b15eda69bff24f44d10c',
      '{"branch":"main","pages_workflow_run":35996120136,"ci_workflow_run":35996120073}'::jsonb
    );
  end if;
end $$;
