
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
        'input_tokens',$3,
        'output_tokens',$4,
        'total_tokens',total,
        'usage_state','verified_not_accepted'
      ),
      coalesce($7,$6),
      req.currency,
      'provider_reported_usage'
    );
  end if;

  return req.id;
end;
$$;

revoke all on function public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text)
from public,anon,authenticated;
grant execute on function public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text)
to service_role;
