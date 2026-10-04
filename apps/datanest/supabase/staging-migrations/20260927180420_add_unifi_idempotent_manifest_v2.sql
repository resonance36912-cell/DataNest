begin;

alter table public.jobs
  add column if not exists client_request_id uuid;

create unique index if not exists jobs_project_client_request_id_uidx
  on public.jobs(project_id,client_request_id)
  where client_request_id is not null;

create or replace function public.create_job_manifest_v2(
  target_project uuid,
  target_request_key uuid,
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
  existing_job public.jobs%rowtype;
  new_job public.jobs%rowtype;
  normalized_title text := btrim(coalesce(job_title,''));
  normalized_description text := nullif(btrim(coalesce(job_description,'')),'');
begin
  if not private.has_project_role(target_project, array['owner','admin','operator']) then
    raise insufficient_privilege using message = 'Operator access is required to create jobs.';
  end if;

  if target_request_key is null then
    raise exception 'A client request key is required.';
  end if;

  if normalized_title = '' then
    raise exception 'Job title is required';
  end if;

  if job_priority < 0 or job_priority > 100 then
    raise exception 'Priority must be between 0 and 100';
  end if;

  if nullif(btrim(coalesce(required_capability,'')),'') is null then
    raise exception 'Required capability is required';
  end if;

  select * into existing_job
  from public.jobs
  where project_id=target_project
    and client_request_id=target_request_key;

  if found then
    if existing_job.title is distinct from normalized_title
      or existing_job.description is distinct from normalized_description
      or existing_job.priority is distinct from job_priority
      or existing_job.required_capabilities is distinct from jsonb_build_array(required_capability)
      or ((existing_job.acceptance->>'tests_required')::boolean) is distinct from tests_required
      or ((existing_job.acceptance->>'artifact_required')::boolean) is distinct from artifact_required
    then
      raise exception 'Client request key already exists for a different UNIFI Job Manifest payload.';
    end if;

    return query select existing_job.id, existing_job.job_number;
    return;
  end if;

  insert into public.jobs(
    project_id,client_request_id,title,description,priority,status,
    required_capabilities,requirements,acceptance
  )
  values(
    target_project,
    target_request_key,
    normalized_title,
    normalized_description,
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
    jsonb_build_object(
      'capability',required_capability,
      'priority',job_priority,
      'client_request_id',target_request_key
    )
  );

  return query select new_job.id, new_job.job_number;
end;
$$;

revoke all on function public.create_job_manifest_v2(uuid,uuid,text,text,integer,text,boolean,boolean) from public, anon;
grant execute on function public.create_job_manifest_v2(uuid,uuid,text,text,integer,text,boolean,boolean) to authenticated;

comment on column public.jobs.client_request_id is
  'Browser-generated idempotency key for authoritative UNIFI Job Manifest reconciliation.';

commit;
