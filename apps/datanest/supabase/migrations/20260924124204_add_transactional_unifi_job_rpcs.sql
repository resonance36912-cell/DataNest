
create or replace function public.create_job_manifest(
  target_project uuid,
  job_title text,
  job_description text default null,
  job_priority integer default 50,
  required_capability text default 'chat',
  tests_required boolean default true,
  artifact_required boolean default true
)
returns table(job_id uuid, job_number bigint)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  new_job public.jobs%rowtype;
begin
  if not private.has_project_role(target_project, array['owner','admin','operator']) then
    raise insufficient_privilege using message = 'Operator access is required to create jobs.';
  end if;

  if nullif(btrim(job_title),'') is null then
    raise exception 'Job title is required';
  end if;

  if job_priority < 0 or job_priority > 100 then
    raise exception 'Priority must be between 0 and 100';
  end if;

  insert into public.jobs(
    project_id,title,description,priority,status,
    required_capabilities,requirements,acceptance
  )
  values(
    target_project,
    btrim(job_title),
    nullif(btrim(coalesce(job_description,'')),''),
    job_priority,
    'PLANNED',
    jsonb_build_array(required_capability),
    jsonb_build_object('source','UNIFI Planner'),
    jsonb_build_object(
      'tests_required',tests_required,
      'artifact_required',artifact_required
    )
  )
  returning * into new_job;

  insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position)
  values
    (new_job.id,'STEP-1','Prepare execution package','analysis','chat','PLANNED',1),
    (new_job.id,'STEP-2','Execute requested work','execution',required_capability,'PLANNED',2),
    (new_job.id,'STEP-3','Verify acceptance criteria','verification','chat','PLANNED',3);

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,new_job.id,'JOB_PLANNED','unifi-planner',
    jsonb_build_object('capability',required_capability,'priority',job_priority)
  );

  return query select new_job.id, new_job.job_number;
end;
$$;

revoke all on function public.create_job_manifest(uuid,text,text,integer,text,boolean,boolean) from public, anon;
grant execute on function public.create_job_manifest(uuid,text,text,integer,text,boolean,boolean) to authenticated;

create or replace function public.transition_job_status(
  target_job uuid,
  target_status text
)
returns table(job_id uuid, status text, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  current_job public.jobs%rowtype;
  normalized text := upper(btrim(target_status));
  allowed boolean := false;
begin
  select * into current_job from public.jobs where id=target_job for update;
  if not found then
    raise exception 'Job not found';
  end if;

  if not private.has_project_role(current_job.project_id, array['owner','admin','operator']) then
    raise insufficient_privilege using message = 'Operator access is required to change job status.';
  end if;

  if normalized = current_job.status then
    return query select current_job.id,current_job.status,current_job.updated_at;
    return;
  end if;

  allowed := case current_job.status
    when 'PLANNED' then normalized in ('READY','PAUSED','CANCELLED')
    when 'READY' then normalized in ('QUEUED','PAUSED','CANCELLED')
    when 'QUEUED' then normalized in ('MATCHING','PAUSED','CANCELLED')
    when 'MATCHING' then normalized in ('RESERVED','PAUSED','CANCELLED')
    when 'RESERVED' then normalized in ('RUNNING','PAUSED','CANCELLED')
    when 'RUNNING' then normalized in ('VERIFYING','COMPLETED','PAUSED','CANCELLED','FAILED')
    when 'VERIFYING' then normalized in ('COMPLETED','FAILED','RETRY_WAIT','PAUSED','CANCELLED')
    when 'PAUSED' then normalized in ('READY','CANCELLED')
    when 'BLOCKED' then normalized in ('READY','PAUSED','CANCELLED')
    when 'BLOCKED_DEPENDENCY' then normalized in ('READY','PAUSED','CANCELLED')
    when 'MANUAL_ACTION' then normalized in ('READY','PAUSED','CANCELLED')
    when 'RETRY_WAIT' then normalized in ('READY','CANCELLED')
    else false
  end;

  if not allowed then
    raise exception 'Invalid job transition: % -> %', current_job.status, normalized;
  end if;

  update public.jobs
  set status=normalized, updated_at=now()
  where id=current_job.id
  returning * into current_job;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    current_job.project_id,current_job.id,'JOB_'||normalized,'human-control',
    jsonb_build_object('new_status',normalized)
  );

  return query select current_job.id,current_job.status,current_job.updated_at;
end;
$$;

revoke all on function public.transition_job_status(uuid,text) from public, anon;
grant execute on function public.transition_job_status(uuid,text) to authenticated;
