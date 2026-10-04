
alter table public.ai_usage_requests
  add column if not exists message_fingerprint text,
  add column if not exists reserved_tokens bigint not null default 0,
  add column if not exists reservation_state text not null default 'none',
  add column if not exists reservation_released_at timestamptz,
  add column if not exists reconciliation_state text not null default 'not_required',
  add column if not exists reconciliation_note text,
  add column if not exists reconciled_by uuid references auth.users(id),
  add column if not exists reconciled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.ai_usage_requests'::regclass
      and conname='ai_usage_requests_reservation_state_check'
  ) then
    alter table public.ai_usage_requests
      add constraint ai_usage_requests_reservation_state_check
      check (reservation_state in ('none','held','released'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.ai_usage_requests'::regclass
      and conname='ai_usage_requests_reconciliation_state_check'
  ) then
    alter table public.ai_usage_requests
      add constraint ai_usage_requests_reconciliation_state_check
      check (reconciliation_state in ('not_required','pending','resolved'));
  end if;
end $$;

update public.ai_usage_requests
set message_fingerprint=coalesce(message_fingerprint,metadata->>'message_fingerprint',metadata->>'message_sha256')
where message_fingerprint is null;

update public.ai_usage_requests
set reconciliation_state='pending',
    reservation_state=case when reservation_state='none' then 'held' else reservation_state end
where status='unknown' and reconciliation_state='not_required';

create index if not exists ai_usage_requests_reconciliation_idx
  on public.ai_usage_requests(project_id,reconciliation_state,created_at desc);
create index if not exists ai_usage_requests_reconciled_by_idx
  on public.ai_usage_requests(reconciled_by);

create or replace function private.begin_ai_chat_request(
  target_job uuid,
  target_client_request_id uuid,
  message_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  j public.jobs%rowtype;
  existing public.ai_usage_requests%rowtype;
  request_row public.ai_usage_requests%rowtype;
  message_result jsonb;
  assistant_text text;
  fingerprint text := md5(btrim(message_content));
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_client_request_id is null then
    raise exception 'client_request_id is required.';
  end if;

  if nullif(btrim(message_content),'') is null then
    raise exception 'message is required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(j.project_id)
    or private.is_job_collaborator(j.id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  insert into public.ai_usage_requests(
    client_request_id,project_id,job_id,user_id,status,provider_called,
    message_fingerprint,metadata
  )
  values(
    target_client_request_id,j.project_id,j.id,caller,'pending',false,
    fingerprint,jsonb_build_object('message_fingerprint',fingerprint)
  )
  on conflict (user_id,client_request_id) do nothing
  returning * into request_row;

  if not found then
    select * into existing
    from public.ai_usage_requests
    where user_id=caller and client_request_id=target_client_request_id;

    if not found then
      raise exception 'Unable to resolve idempotent AI request.';
    end if;

    if coalesce(existing.message_fingerprint,existing.metadata->>'message_fingerprint',existing.metadata->>'message_sha256','')
       <> fingerprint then
      raise exception 'client_request_id payload mismatch.';
    end if;

    if existing.assistant_message_id is not null then
      select content into assistant_text
      from public.ai_messages where id=existing.assistant_message_id;
    end if;

    return jsonb_build_object(
      'id',existing.id,
      'is_new',false,
      'status',existing.status,
      'provider_called',existing.provider_called,
      'user_message_id',existing.user_message_id,
      'assistant_message_id',existing.assistant_message_id,
      'assistant',assistant_text,
      'error_category',existing.error_category,
      'error_message',existing.error_message
    );
  end if;

  message_result := private.post_job_ai_message(target_job,message_content);

  update public.ai_usage_requests
  set user_message_id=(message_result->>'user_message_id')::uuid
  where id=request_row.id;

  return jsonb_build_object(
    'id',request_row.id,
    'is_new',true,
    'status','pending',
    'provider_called',false,
    'user_message_id',message_result->>'user_message_id'
  );
end;
$$;

create or replace function public.service_authorize_ai_request(
  target_request uuid,
  target_connection uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  req public.ai_usage_requests%rowtype;
  conn public.ai_provider_connections%rowtype;
  budget public.ai_budget_policies%rowtype;
  daily_count bigint;
  monthly_tokens bigint;
  monthly_cost bigint;
  concurrent_count bigint;
  model_allowed boolean;
  host_allowed boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  select * into req
  from public.ai_usage_requests
  where id=target_request
  for update;
  if not found then raise exception 'AI request not found.'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(req.project_id::text || ':' || req.user_id::text,0)
  );

  select * into req
  from public.ai_usage_requests
  where id=target_request
  for update;

  if req.status <> 'pending' or req.provider_called then
    return jsonb_build_object(
      'allowed',false,
      'reason','request_already_started',
      'status',req.status,
      'provider_called',req.provider_called
    );
  end if;

  select * into conn
  from public.ai_provider_connections
  where id=target_connection
    and project_id=req.project_id
    and user_id=req.user_id
    and status='active';
  if not found then
    return jsonb_build_object('allowed',false,'reason','connection_unavailable');
  end if;

  if not exists (
    select 1 from public.stakeholder_profiles sp
    where sp.project_id=req.project_id and sp.user_id=req.user_id and sp.status='active'
  ) and not exists (
    select 1 from public.project_members pm
    where pm.project_id=req.project_id and pm.user_id=req.user_id and pm.status='active'
  ) then
    return jsonb_build_object('allowed',false,'reason','stakeholder_inactive');
  end if;

  host_allowed := (
    (conn.provider='openai' and conn.endpoint_host='api.openai.com')
    or exists (
      select 1 from public.ai_provider_domain_allowlist al
      where al.project_id=req.project_id
        and al.hostname=conn.endpoint_host
        and al.active=true
    )
  );
  if not host_allowed then
    return jsonb_build_object('allowed',false,'reason','provider_host_not_allowed');
  end if;

  select * into budget from private.resolve_ai_budget(req.project_id,req.user_id);
  if not found or not budget.enabled then
    return jsonb_build_object('allowed',false,'reason','budget_disabled');
  end if;

  if not (conn.provider=any(budget.allowed_providers)) then
    return jsonb_build_object('allowed',false,'reason','provider_not_allowed');
  end if;

  model_allowed := ('*'=any(budget.allowed_models) or conn.model=any(budget.allowed_models));
  if not model_allowed then
    return jsonb_build_object('allowed',false,'reason','model_not_allowed');
  end if;

  select count(*) into daily_count
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.provider_called=true
    and r.created_at >= date_trunc('day',now());

  if daily_count >= budget.daily_request_limit then
    update public.ai_usage_requests
    set status='denied',error_category='daily_request_limit',
        reservation_state='released',reserved_tokens=0,
        reservation_released_at=now(),completed_at=now()
    where id=req.id;
    return jsonb_build_object('allowed',false,'reason','daily_request_limit');
  end if;

  select count(*) into concurrent_count
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.provider_called=true
    and r.status='pending';

  if concurrent_count >= budget.concurrency_limit then
    update public.ai_usage_requests
    set status='denied',error_category='concurrency_limit',
        reservation_state='released',reserved_tokens=0,
        reservation_released_at=now(),completed_at=now()
    where id=req.id;
    return jsonb_build_object('allowed',false,'reason','concurrency_limit');
  end if;

  select coalesce(sum(
    case
      when r.status='succeeded' then r.total_tokens
      when r.reservation_state='held' and r.status in ('pending','unknown') then r.reserved_tokens
      else 0
    end
  ),0)
  into monthly_tokens
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.created_at >= date_trunc('month',now());

  if monthly_tokens + budget.max_output_tokens > budget.monthly_token_limit then
    update public.ai_usage_requests
    set status='denied',error_category='monthly_token_reservation_limit',
        reservation_state='released',reserved_tokens=0,
        reservation_released_at=now(),completed_at=now()
    where id=req.id;
    return jsonb_build_object(
      'allowed',false,
      'reason','monthly_token_reservation_limit',
      'tokens_committed_or_reserved',monthly_tokens,
      'requested_reservation',budget.max_output_tokens
    );
  end if;

  select coalesce(sum(coalesce(reconciled_cost_minor,provider_reported_cost_minor,estimated_cost_minor,0)),0)
  into monthly_cost
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.created_at >= date_trunc('month',now())
    and r.status in ('succeeded','unknown');

  if budget.monthly_cost_limit_minor is not null
     and monthly_cost >= budget.monthly_cost_limit_minor then
    update public.ai_usage_requests
    set status='denied',error_category='monthly_cost_limit',
        reservation_state='released',reserved_tokens=0,
        reservation_released_at=now(),completed_at=now()
    where id=req.id;
    return jsonb_build_object('allowed',false,'reason','monthly_cost_limit');
  end if;

  update public.ai_usage_requests
  set connection_id=conn.id,
      provider=conn.provider,
      model=conn.model,
      currency=budget.currency,
      provider_called=true,
      started_at=now(),
      reserved_tokens=budget.max_output_tokens,
      reservation_state='held',
      reservation_released_at=null,
      reconciliation_state='not_required',
      metadata=metadata || jsonb_build_object(
        'budget_policy_id',budget.id,
        'max_output_tokens',budget.max_output_tokens,
        'reserved_tokens',budget.max_output_tokens,
        'authorized_at',now()
      )
  where id=req.id;

  return jsonb_build_object(
    'allowed',true,
    'request_id',req.id,
    'connection_id',conn.id,
    'provider',conn.provider,
    'model',conn.model,
    'max_output_tokens',budget.max_output_tokens,
    'reserved_tokens',budget.max_output_tokens,
    'currency',budget.currency
  );
end;
$$;

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
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  req public.ai_usage_requests%rowtype;
  total bigint;
  qty numeric;
  proposed numeric;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if target_status not in ('succeeded','failed','unknown','denied') then
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

  total := greatest(coalesce(input_tokens,0)+coalesce(output_tokens,0),0);

  update public.ai_usage_requests
  set status=target_status,
      input_tokens=greatest(coalesce(input_tokens,0),0),
      output_tokens=greatest(coalesce(output_tokens,0),0),
      total_tokens=total,
      estimated_cost_minor=estimated_cost_minor,
      provider_reported_cost_minor=provider_reported_cost_minor,
      reconciled_cost_minor=reconciled_cost_minor,
      error_category=target_error_category,
      error_message=case when target_error_message is null then null else left(target_error_message,500) end,
      reservation_state=case when target_status='unknown' then 'held' else 'released' end,
      reserved_tokens=case when target_status='unknown' then reserved_tokens else 0 end,
      reservation_released_at=case when target_status='unknown' then null else now() end,
      reconciliation_state=case when target_status='unknown' then 'pending' else 'not_required' end,
      completed_at=now()
  where id=req.id;

  if target_status='succeeded' and total > 0 then
    qty := total::numeric/1000;
    proposed := qty * private.contribution_weight(req.project_id,'ai_token_1k');

    perform private.insert_contribution(
      req.project_id,req.job_id,req.user_id,'ai_usage',qty,'1k_tokens',
      proposed,true,req.id::text,
      jsonb_build_object(
        'provider',req.provider,
        'model',req.model,
        'connection_id',req.connection_id,
        'request_id',req.id,
        'input_tokens',input_tokens,
        'output_tokens',output_tokens,
        'total_tokens',total,
        'usage_state','verified_not_accepted'
      ),
      coalesce(reconciled_cost_minor,provider_reported_cost_minor),
      req.currency,
      'provider_reported_usage'
    );
  end if;

  return req.id;
end;
$$;

create or replace function private.get_ai_reconciliation_queue(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
begin
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'job_id',r.job_id,
      'user_id',r.user_id,
      'provider',r.provider,
      'model',r.model,
      'status',r.status,
      'reserved_tokens',r.reserved_tokens,
      'reservation_state',r.reservation_state,
      'estimated_cost_minor',r.estimated_cost_minor,
      'provider_reported_cost_minor',r.provider_reported_cost_minor,
      'currency',r.currency,
      'error_category',r.error_category,
      'error_message',r.error_message,
      'started_at',r.started_at,
      'completed_at',r.completed_at,
      'reconciliation_state',r.reconciliation_state
    ) order by r.started_at asc),'[]'::jsonb)
    from public.ai_usage_requests r
    where r.project_id=target_project
      and r.status='unknown'
      and r.reconciliation_state='pending'
  );
end;
$$;

create or replace function public.get_ai_reconciliation_queue(target_project uuid)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.get_ai_reconciliation_queue(target_project);
$$;

create or replace function private.reconcile_unknown_ai_request(
  target_request uuid,
  target_outcome text,
  target_input_tokens bigint default 0,
  target_output_tokens bigint default 0,
  target_reconciled_cost_minor bigint default null,
  target_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  req public.ai_usage_requests%rowtype;
  total bigint;
  qty numeric;
  proposed numeric;
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

    if total > 0 then
      qty := total::numeric/1000;
      proposed := qty * private.contribution_weight(req.project_id,'ai_token_1k');
      perform private.insert_contribution(
        req.project_id,req.job_id,req.user_id,'ai_usage',qty,'1k_tokens',
        proposed,true,req.id::text,
        jsonb_build_object(
          'provider',req.provider,
          'model',req.model,
          'connection_id',req.connection_id,
          'request_id',req.id,
          'input_tokens',target_input_tokens,
          'output_tokens',target_output_tokens,
          'total_tokens',total,
          'usage_state','reconciled_verified_not_accepted'
        ),
        target_reconciled_cost_minor,
        req.currency,
        'provider_reported_usage'
      );
    end if;
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

create or replace function public.reconcile_unknown_ai_request(
  target_request uuid,
  target_outcome text,
  target_input_tokens bigint default 0,
  target_output_tokens bigint default 0,
  target_reconciled_cost_minor bigint default null,
  target_note text default null
)
returns uuid
language sql
security invoker
set search_path = public, private
as $$
  select private.reconcile_unknown_ai_request(
    target_request,target_outcome,target_input_tokens,target_output_tokens,
    target_reconciled_cost_minor,target_note
  );
$$;

revoke all on function public.begin_ai_chat_request(uuid,uuid,text) from public,anon;
grant execute on function public.begin_ai_chat_request(uuid,uuid,text) to authenticated;

revoke all on function public.complete_ai_chat_request(uuid,text,text,jsonb) from public,anon;
grant execute on function public.complete_ai_chat_request(uuid,text,text,jsonb) to authenticated;

revoke all on function public.set_ai_budget_policy(uuid,uuid,integer,bigint,bigint,integer,integer,text[],text[],text) from public,anon;
grant execute on function public.set_ai_budget_policy(uuid,uuid,integer,bigint,bigint,integer,integer,text[],text[],text) to authenticated;

revoke all on function public.record_ai_assistant_response(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.post_job_ai_message(uuid,text) from public,anon,authenticated,service_role;

revoke all on function public.get_ai_reconciliation_queue(uuid) from public,anon;
grant execute on function public.get_ai_reconciliation_queue(uuid) to authenticated;

revoke all on function public.reconcile_unknown_ai_request(uuid,text,bigint,bigint,bigint,text) from public,anon;
grant execute on function public.reconcile_unknown_ai_request(uuid,text,bigint,bigint,bigint,text) to authenticated;

revoke all on function private.get_ai_reconciliation_queue(uuid) from public,anon;
grant execute on function private.get_ai_reconciliation_queue(uuid) to authenticated,service_role;

revoke all on function private.reconcile_unknown_ai_request(uuid,text,bigint,bigint,bigint,text) from public,anon;
grant execute on function private.reconcile_unknown_ai_request(uuid,text,bigint,bigint,bigint,text) to authenticated,service_role;

revoke all on function public.service_authorize_ai_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_authorize_ai_request(uuid,uuid) to service_role;

revoke all on function public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text) to service_role;
