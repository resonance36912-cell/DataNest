alter table public.ai_file_submissions
  add column if not exists frozen_session_event_ids uuid[] not null default '{}',
  add column if not exists analysis_attempt_count integer not null default 0,
  add column if not exists last_analysis_error_code text,
  add column if not exists last_analysis_error_message text;

alter table public.ai_file_submissions
  drop constraint if exists ai_file_submissions_analysis_attempt_count_check;
alter table public.ai_file_submissions
  add constraint ai_file_submissions_analysis_attempt_count_check
  check (analysis_attempt_count >= 0);

create or replace function public.service_enqueue_datanest_file_analysis(
  target_submission uuid
) returns bigint
language plpgsql
security definer
set search_path=public,pgmq,auth
as $$
declare
  queued_id bigint;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_submission is null then
    raise exception 'Submission id is required.';
  end if;

  select id into queued_id
  from pgmq.send(
    'datanest_file_analysis',
    jsonb_build_object('submissionId',target_submission::text)
  ) as id;

  return queued_id;
end;
$$;

create or replace function public.service_claim_datanest_file_analysis(
  target_limit integer default 2,
  visibility_seconds integer default 180
) returns table(
  msg_id bigint,
  read_ct bigint,
  message jsonb
)
language plpgsql
security definer
set search_path=public,pgmq,auth
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_limit < 1 or target_limit > 10 then
    raise exception 'Analysis claim limit must be between 1 and 10.';
  end if;
  if visibility_seconds < 60 or visibility_seconds > 900 then
    raise exception 'Analysis visibility timeout must be between 60 and 900 seconds.';
  end if;

  return query
  select r.msg_id, r.read_ct::bigint, r.message
  from pgmq.read('datanest_file_analysis',visibility_seconds,target_limit) r;
end;
$$;

create or replace function public.service_ack_datanest_file_analysis(
  target_message bigint
) returns boolean
language plpgsql
security definer
set search_path=public,pgmq,auth
as $$
declare
  deleted boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_message is null then
    raise exception 'Queue message id is required.';
  end if;

  select pgmq.delete('datanest_file_analysis',target_message) into deleted;
  return coalesce(deleted,false);
end;
$$;

revoke execute on function public.service_enqueue_datanest_file_analysis(uuid)
  from public,anon,authenticated;
grant execute on function public.service_enqueue_datanest_file_analysis(uuid)
  to service_role;

revoke execute on function public.service_claim_datanest_file_analysis(integer,integer)
  from public,anon,authenticated;
grant execute on function public.service_claim_datanest_file_analysis(integer,integer)
  to service_role;

revoke execute on function public.service_ack_datanest_file_analysis(bigint)
  from public,anon,authenticated;
grant execute on function public.service_ack_datanest_file_analysis(bigint)
  to service_role;
