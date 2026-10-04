begin;

create table public.certified_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  normalized_knowledge text not null check (length(btrim(normalized_knowledge)) > 0),
  category text not null,
  effective_version bigint not null,
  certification_id uuid not null,
  source_job_ids uuid[] not null default '{}',
  source_trace_ids text[] not null default '{}',
  certification_class text not null,
  confidence numeric,
  policy_version text not null,
  content_hash text not null,
  active boolean not null default true,
  supersedes_memory_id uuid references public.certified_memory(id),
  promoted_at timestamptz not null default now(),
  unique(project_id,content_hash,effective_version)
);

alter table public.certified_memory enable row level security;
revoke all on public.certified_memory from anon,authenticated;

create index certified_memory_project_active_idx
  on public.certified_memory(project_id,active,promoted_at desc);
create index certified_memory_supersedes_idx
  on public.certified_memory(supersedes_memory_id);

alter table public.external_ai_sessions
  add column if not exists staging_trace_id text,
  add column if not exists staging_event_id uuid;

create or replace function private.begin_datanest_ai_request(
  target_job uuid,
  target_client_request_id uuid,
  message_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  j public.jobs%rowtype;
  existing public.ai_usage_requests%rowtype;
  inserted public.ai_usage_requests%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_client_request_id is null or nullif(btrim(message_fingerprint),'') is null then
    raise exception 'client request id and fingerprint are required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;
  if not (private.is_project_member(j.project_id) or private.is_job_collaborator(j.id)) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  insert into public.ai_usage_requests(
    client_request_id,project_id,job_id,user_id,status,provider_called,
    message_fingerprint,metadata
  )
  values(
    target_client_request_id,j.project_id,j.id,caller,'pending',false,
    message_fingerprint,jsonb_build_object('runtime','datanest_ai')
  )
  on conflict (user_id,client_request_id) do nothing
  returning * into inserted;

  if found then
    return jsonb_build_object(
      'id',inserted.id,'is_new',true,'status',inserted.status,
      'project_id',j.project_id,'job_id',j.id
    );
  end if;

  select * into existing
  from public.ai_usage_requests
  where user_id=caller and client_request_id=target_client_request_id;

  if not found then
    raise exception 'Unable to resolve idempotent DataNest AI request.';
  end if;
  if coalesce(existing.message_fingerprint,'') <> message_fingerprint then
    raise exception 'client_request_id payload mismatch.';
  end if;

  return jsonb_build_object(
    'id',existing.id,'is_new',false,'status',existing.status,
    'project_id',existing.project_id,'job_id',existing.job_id,
    'metadata',existing.metadata
  );
end;
$$;

create or replace function public.begin_datanest_ai_request(
  target_job uuid,
  target_client_request_id uuid,
  message_fingerprint text
) returns jsonb
language sql
security definer
set search_path=public,private
as $$
  select private.begin_datanest_ai_request(target_job,target_client_request_id,message_fingerprint);
$$;

create or replace function private.get_certified_memory_context(
  target_project uuid,
  target_job uuid,
  target_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  authorized boolean;
  payload jsonb;
begin
  authorized :=
    private.is_project_member(target_project)
    or (
      private.is_job_collaborator(target_job)
      and exists(
        select 1 from public.jobs j
        where j.id=target_job and j.project_id=target_project
      )
    );

  if not authorized then
    raise insufficient_privilege using message='Project or Job collaboration access is required.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.promoted_at desc),'[]'::jsonb)
  into payload
  from (
    select id,normalized_knowledge,category,effective_version,certification_id,
           source_job_ids,source_trace_ids,certification_class,confidence,
           policy_version,content_hash,supersedes_memory_id,promoted_at
    from public.certified_memory
    where project_id=target_project and active=true
    order by promoted_at desc
    limit greatest(1,least(coalesce(target_limit,50),200))
  ) m;

  return jsonb_build_object('authorized',true,'items',payload);
end;
$$;

create or replace function public.get_certified_memory_context(
  target_project uuid,
  target_job uuid,
  target_limit integer default 50
) returns jsonb
language sql
stable
security definer
set search_path=public,private
as $$
  select private.get_certified_memory_context(target_project,target_job,target_limit);
$$;

create or replace function private.mark_external_ai_session_staged(
  target_session uuid,
  target_staging_event uuid,
  target_trace_id text
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  s public.external_ai_sessions%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into s
  from public.external_ai_sessions
  where id=target_session
  for update;
  if not found then raise exception 'External AI session not found.'; end if;
  if s.user_id <> caller then
    raise insufficient_privilege using message='External AI session ownership is required.';
  end if;
  if not (private.is_project_member(s.project_id) or private.is_job_collaborator(s.job_id)) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  if s.staging_event_id is not null then
    return jsonb_build_object(
      'session_id',s.id,'staging_event_id',s.staging_event_id,
      'trace_id',s.staging_trace_id,'idempotent',true
    );
  end if;

  update public.external_ai_sessions
  set status='imported',
      staging_event_id=target_staging_event,
      staging_trace_id=target_trace_id,
      imported_at=now(),
      updated_at=now()
  where id=s.id;

  return jsonb_build_object(
    'session_id',s.id,'staging_event_id',target_staging_event,
    'trace_id',target_trace_id,'idempotent',false
  );
end;
$$;

create or replace function public.mark_external_ai_session_staged(
  target_session uuid,
  target_staging_event uuid,
  target_trace_id text
) returns jsonb
language sql
security definer
set search_path=public,private
as $$
  select private.mark_external_ai_session_staged(target_session,target_staging_event,target_trace_id);
$$;

create or replace function private.promote_certified_memory(
  target_project uuid,
  target_knowledge text,
  target_category text,
  target_certification_id uuid,
  target_source_job_ids uuid[],
  target_source_trace_ids text[],
  target_certification_class text,
  target_confidence numeric,
  target_policy_version text,
  target_content_hash text,
  target_supersedes uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  next_version bigint;
  existing_id uuid;
  new_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if nullif(btrim(target_knowledge),'') is null
     or nullif(btrim(target_content_hash),'') is null
     or target_certification_id is null then
    raise exception 'Certified knowledge, content hash and certification id are required.';
  end if;

  select id into existing_id
  from public.certified_memory
  where project_id=target_project and content_hash=target_content_hash and active=true
  order by effective_version desc limit 1;
  if found then return existing_id; end if;

  select coalesce(max(effective_version),0)+1 into next_version
  from public.certified_memory where project_id=target_project;

  if target_supersedes is not null then
    update public.certified_memory
    set active=false
    where id=target_supersedes and project_id=target_project and active=true;
    if not found then raise exception 'Superseded memory is not active in this project.'; end if;
  end if;

  insert into public.certified_memory(
    project_id,normalized_knowledge,category,effective_version,certification_id,
    source_job_ids,source_trace_ids,certification_class,confidence,policy_version,
    content_hash,supersedes_memory_id
  )
  values(
    target_project,btrim(target_knowledge),target_category,next_version,target_certification_id,
    coalesce(target_source_job_ids,'{}'),coalesce(target_source_trace_ids,'{}'),
    target_certification_class,target_confidence,target_policy_version,
    target_content_hash,target_supersedes
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.service_promote_certified_memory(
  target_project uuid,
  target_knowledge text,
  target_category text,
  target_certification_id uuid,
  target_source_job_ids uuid[],
  target_source_trace_ids text[],
  target_certification_class text,
  target_confidence numeric,
  target_policy_version text,
  target_content_hash text,
  target_supersedes uuid default null
) returns uuid
language sql
security definer
set search_path=public,private
as $$
  select private.promote_certified_memory(
    target_project,target_knowledge,target_category,target_certification_id,
    target_source_job_ids,target_source_trace_ids,target_certification_class,
    target_confidence,target_policy_version,target_content_hash,target_supersedes
  );
$$;

drop trigger if exists track_development_contribution on public.ai_development_updates;
drop trigger if exists track_dispatched_prompt_contribution on public.ai_prompt_queue;
drop trigger if exists track_job_input_contribution on public.job_inputs;
drop trigger if exists track_product_test_contribution on public.product_test_runs;

revoke execute on function public.accept_contribution(uuid) from public,anon,authenticated;
revoke execute on function public.reject_contribution(uuid,text) from public,anon,authenticated;
revoke execute on function public.reverse_contribution(uuid,text) from public,anon,authenticated;
revoke execute on function public.verify_contribution(uuid) from public,anon,authenticated;
revoke execute on function public.submit_external_ai_credit(uuid,uuid,text,numeric,text,bigint,text,text) from public,anon,authenticated;

create or replace function public.service_finish_ai_request(
  target_request uuid,
  target_status text,
  input_tokens bigint default 0,
  output_tokens bigint default 0,
  estimated_cost_minor bigint default null,
  provider_reported_cost_minor bigint default null,
  reconciled_cost_minor bigint default null,
  target_error_category text default null,
  target_error_message text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  req public.ai_usage_requests%rowtype;
  total bigint;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if target_status not in ('succeeded','failed','unknown','denied','embedded') then
    raise exception 'Invalid AI request terminal status.';
  end if;

  select * into req
  from public.ai_usage_requests
  where id=target_request
  for update;
  if not found then raise exception 'AI request not found.'; end if;

  if req.status in ('succeeded','embedded','failed','denied')
     and req.completed_at is not null then
    return req.id;
  end if;

  total := greatest(coalesce($3,0)+coalesce($4,0),0);

  update public.ai_usage_requests r
  set status=target_status,
      input_tokens=greatest(coalesce($3,0),0),
      output_tokens=greatest(coalesce($4,0),0),
      total_tokens=total,
      estimated_cost_minor=$5,
      provider_reported_cost_minor=$6,
      reconciled_cost_minor=$7,
      error_category=$8,
      error_message=case when $9 is null then null else left($9,500) end,
      reservation_state=case when target_status='unknown' then 'held' else 'released' end,
      reserved_tokens=case when target_status='unknown' then r.reserved_tokens else 0 end,
      reservation_released_at=case when target_status='unknown' then null else now() end,
      reconciliation_state=case when target_status='unknown' then 'pending' else 'not_required' end,
      completed_at=now()
  where r.id=req.id;

  return req.id;
end;
$$;

create or replace function private.reconcile_unknown_ai_request(
  target_request uuid,
  target_outcome text,
  target_input_tokens bigint default 0,
  target_output_tokens bigint default 0,
  target_reconciled_cost_minor bigint default null,
  target_note text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  req public.ai_usage_requests%rowtype;
  total bigint;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_outcome not in ('succeeded','no_charge') then
    raise exception 'Outcome must be succeeded or no_charge.';
  end if;

  select * into req
  from public.ai_usage_requests
  where id=target_request
  for update;
  if not found then raise exception 'AI request not found.'; end if;

  if not private.has_project_role(req.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if req.status <> 'unknown' or req.reconciliation_state <> 'pending' then
    raise exception 'Only pending unknown requests can be reconciled.';
  end if;

  total := greatest(coalesce(target_input_tokens,0)+coalesce(target_output_tokens,0),0);

  if target_outcome='succeeded' then
    update public.ai_usage_requests
    set status='succeeded',
        input_tokens=greatest(coalesce(target_input_tokens,0),0),
        output_tokens=greatest(coalesce(target_output_tokens,0),0),
        total_tokens=total,
        reconciled_cost_minor=target_reconciled_cost_minor,
        reservation_state='released',
        reserved_tokens=0,
        reservation_released_at=now(),
        reconciliation_state='resolved',
        reconciliation_note=left(coalesce(target_note,'Provider completion confirmed.'),1000),
        reconciled_by=caller,
        reconciled_at=now(),
        completed_at=coalesce(completed_at,now())
    where id=req.id;
  else
    update public.ai_usage_requests
    set status='failed',
        error_category='reconciled_no_charge',
        error_message='Unknown provider outcome reconciled as no completion/no charge.',
        reservation_state='released',
        reserved_tokens=0,
        reservation_released_at=now(),
        reconciliation_state='resolved',
        reconciliation_note=left(coalesce(target_note,'Confirmed no completion/no charge.'),1000),
        reconciled_by=caller,
        reconciled_at=now(),
        completed_at=coalesce(completed_at,now())
    where id=req.id;
  end if;

  return req.id;
end;
$$;

revoke execute on function private.begin_datanest_ai_request(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function private.get_certified_memory_context(uuid,uuid,integer) from public,anon,authenticated;
revoke execute on function private.mark_external_ai_session_staged(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function private.promote_certified_memory(uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid) from public,anon,authenticated;

revoke execute on function public.begin_datanest_ai_request(uuid,uuid,text) from public,anon;
grant execute on function public.begin_datanest_ai_request(uuid,uuid,text) to authenticated;

revoke execute on function public.get_certified_memory_context(uuid,uuid,integer) from public,anon;
grant execute on function public.get_certified_memory_context(uuid,uuid,integer) to authenticated;

revoke execute on function public.mark_external_ai_session_staged(uuid,uuid,text) from public,anon;
grant execute on function public.mark_external_ai_session_staged(uuid,uuid,text) to authenticated;

revoke execute on function public.service_promote_certified_memory(
  uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid
) from public,anon,authenticated;
grant execute on function public.service_promote_certified_memory(
  uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid
) to service_role;

revoke execute on function public.service_finish_ai_request(
  uuid,text,bigint,bigint,bigint,bigint,bigint,text,text
) from public,anon,authenticated;
grant execute on function public.service_finish_ai_request(
  uuid,text,bigint,bigint,bigint,bigint,bigint,text,text
) to service_role;

commit;
