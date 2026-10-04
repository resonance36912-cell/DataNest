
with p as (select id from public.projects where slug='resonance-datanest')
insert into public.capabilities
(project_id, account_key, connector_kind, capability, state, observed_at, confidence, concurrency_limit, metadata)
select id,'datanest-github','github','repository','AVAILABLE',now(),1.0,1,
       '{"repository":"DataNest-Supository/DataNest","branch":"main"}'::jsonb from p
on conflict (project_id, account_key, capability) do update
set state=excluded.state, observed_at=excluded.observed_at, confidence=excluded.confidence, metadata=excluded.metadata;

with p as (select id from public.projects where slug='resonance-datanest')
insert into public.capabilities
(project_id, account_key, connector_kind, capability, state, observed_at, confidence, concurrency_limit, metadata)
select id,'datanest-supabase','supabase','database','AVAILABLE',now(),1.0,1,
       '{"project_ref":"sgqdmfgjbprsoqsmgigi","region":"eu-central-1"}'::jsonb from p
on conflict (project_id, account_key, capability) do update
set state=excluded.state, observed_at=excluded.observed_at, confidence=excluded.confidence, metadata=excluded.metadata;

with p as (select id from public.projects where slug='resonance-datanest')
insert into public.capabilities
(project_id, account_key, connector_kind, capability, state, observed_at, confidence, concurrency_limit, metadata)
select id,'datanest-vercel','vercel','deployment','UNKNOWN',now(),0.0,1,
       '{"expected_project":"Resonance DataNest","reason":"connector_returns_zero_teams"}'::jsonb from p
on conflict (project_id, account_key, capability) do update
set state=excluded.state, observed_at=excluded.observed_at, confidence=excluded.confidence, metadata=excluded.metadata;

with p as (select id from public.projects where slug='resonance-datanest')
insert into public.capabilities
(project_id, account_key, connector_kind, capability, state, observed_at, confidence, concurrency_limit, metadata)
select id,'unifi-planner','manual','chat','AVAILABLE',now(),1.0,1,
       '{"tool":"UNIFI","mode":"planning"}'::jsonb from p
on conflict (project_id, account_key, capability) do update
set state=excluded.state, observed_at=excluded.observed_at, confidence=excluded.confidence, metadata=excluded.metadata;

do $$
declare
  p uuid;
  j1 uuid;
  j2 uuid;
  j3 uuid;
begin
  select id into p from public.projects where slug='resonance-datanest';

  if not exists (select 1 from public.jobs where project_id=p and title='Bootstrap Resonance DataNest repository') then
    insert into public.jobs(project_id,title,description,priority,status,required_capabilities,acceptance)
    values(p,'Bootstrap Resonance DataNest repository',
      'Populate the canonical DataNest GitHub repository with the Resonance DataNest application scaffold and UNIFI/TranScheduler architecture.',
      80,'COMPLETED','["repository"]'::jsonb,
      '{"artifact_required":true,"tests_required":false}'::jsonb)
    returning id into j1;

    insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position) values
      (j1,'STEP-1','Establish project identity','analysis','chat','COMPLETED',1),
      (j1,'STEP-2','Create application scaffold','repository_work','repository','COMPLETED',2),
      (j1,'STEP-3','Document authority chain','documentation','repository','COMPLETED',3);

    insert into public.checkpoints(job_id,completed,remaining,resume_instruction)
    values(j1,'["GitHub authority verified","Next.js scaffold committed","architecture documented"]'::jsonb,
      '[]'::jsonb,'Repository bootstrap complete.');

    insert into public.events(project_id,job_id,event_type,actor,payload)
    values(p,j1,'JOB_COMPLETED','bootstrapper','{"commit":"cf5988358c981821e718ddd46693184bdf14b7b7"}'::jsonb);
  end if;

  if not exists (select 1 from public.jobs where project_id=p and title='Provision Resonance DataNest control plane') then
    insert into public.jobs(project_id,title,description,priority,status,required_capabilities,acceptance)
    values(p,'Provision Resonance DataNest control plane',
      'Create and secure the Supabase schema for UNIFI projects/jobs/checkpoints and TranScheduler capabilities/reservations/runs.',
      80,'COMPLETED','["database"]'::jsonb,
      '{"artifact_required":false,"tests_required":true}'::jsonb)
    returning id into j2;

    insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position) values
      (j2,'STEP-1','Apply control-plane schema','database_migration','database','COMPLETED',1),
      (j2,'STEP-2','Enable RLS','security','database','COMPLETED',2),
      (j2,'STEP-3','Apply FK indexes','performance','database','COMPLETED',3),
      (j2,'STEP-4','Run advisors','verification','database','COMPLETED',4);

    insert into public.checkpoints(job_id,completed,remaining,resume_instruction)
    values(j2,'["schema applied","RLS enabled","security advisor clean","foreign-key indexes added"]'::jsonb,
      '[]'::jsonb,'Supabase control plane ready.');

    insert into public.events(project_id,job_id,event_type,actor,payload)
    values(p,j2,'JOB_COMPLETED','bootstrapper','{"migration":"bootstrap_resonance_datanest_control_plane"}'::jsonb);
  end if;

  if not exists (select 1 from public.jobs where project_id=p and title='Link Resonance DataNest Vercel deployment') then
    insert into public.jobs(project_id,title,description,priority,status,required_capabilities,acceptance)
    values(p,'Link Resonance DataNest Vercel deployment',
      'Bind the Vercel project named Resonance DataNest to DataNest-Supository/DataNest and configure Supabase environment variables.',
      80,'MANUAL_ACTION','["deployment"]'::jsonb,
      '{"deployment_required":true,"production_verification":true}'::jsonb)
    returning id into j3;

    insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position,payload) values
      (j3,'STEP-1','Resolve Vercel workspace','authorization','deployment','MANUAL_ACTION',1,
        '{"blocker":"Vercel connector returns zero teams"}'::jsonb),
      (j3,'STEP-2','Import GitHub repository','deployment','deployment','BLOCKED',2,'{}'::jsonb),
      (j3,'STEP-3','Set Supabase environment','configuration','deployment','BLOCKED',3,'{}'::jsonb),
      (j3,'STEP-4','Verify production deployment','browser_validation','deployment','BLOCKED',4,'{}'::jsonb);

    insert into public.checkpoints(job_id,completed,remaining,resume_instruction)
    values(j3,'["GitHub repository prepared with Vercel import link"]'::jsonb,
      '["resolve workspace","import repository","set environment variables","verify deployment"]'::jsonb,
      'Resume when the Vercel connector exposes an authorized workspace/team.');

    insert into public.events(project_id,job_id,event_type,actor,payload)
    values(p,j3,'MANUAL_ACTION_REQUIRED','transcheduler',
      '{"capability":"deployment","state":"UNKNOWN","reason":"connector_returns_zero_teams"}'::jsonb);
  end if;
end $$;
