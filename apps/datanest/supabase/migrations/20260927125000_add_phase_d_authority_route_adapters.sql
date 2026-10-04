begin;

create or replace function public.transition_job_status(
  target_job uuid,
  target_status text
)
returns table(job_id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid:=auth.uid();
  current_job public.jobs%rowtype;
  normalized text := upper(btrim(target_status));
  allowed boolean := false;
  capability_keys text[];
  authority_decision jsonb;
  authority_trace text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

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

  if current_job.status='RESERVED' and normalized='RUNNING' then
    select coalesce(
      array_agg(distinct lower(btrim(value)) order by lower(btrim(value)))
        filter(where nullif(btrim(value),'') is not null),
      '{}'::text[]
    )
    into capability_keys
    from jsonb_array_elements_text(coalesce(current_job.required_capabilities,'[]'::jsonb)) value;

    authority_trace:='JOBSTART-'||current_job.id::text||'-'||replace(gen_random_uuid()::text,'-','');

    authority_decision:=private.authority_evaluate_execution_v1(
      current_job.project_id,
      caller,
      'job_start',
      'human',
      'user:'||caller::text,
      current_job.id,
      'job_start',
      'resource_execution',
      'A3',
      authority_trace,
      capability_keys,
      'job',
      current_job.id::text,
      null,
      null,
      null,
      true,
      true
    );

    if authority_decision->>'enforcement_mode'='enforced'
       and authority_decision->>'outcome'<>'allow' then
      raise exception 'Execution authority denied: %',coalesce(authority_decision->>'reason_code','authority_denied');
    end if;
  end if;

  update public.jobs
  set status=normalized, updated_at=now()
  where id=current_job.id
  returning * into current_job;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    current_job.project_id,current_job.id,'JOB_'||normalized,'human-control:'||caller::text,
    jsonb_build_object('new_status',normalized)
  );

  return query select current_job.id,current_job.status,current_job.updated_at;
end;
$$;

revoke all on function public.transition_job_status(uuid,text) from public,anon;
grant execute on function public.transition_job_status(uuid,text) to authenticated;

commit;
