
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
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_client_request_id is null then
    raise exception 'client_request_id is required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(j.project_id)
    or private.is_job_collaborator(j.id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  select * into existing
  from public.ai_usage_requests
  where user_id=caller and client_request_id=target_client_request_id;

  if found then
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

  insert into public.ai_usage_requests(
    client_request_id,project_id,job_id,user_id,status,provider_called,metadata
  )
  values(
    target_client_request_id,j.project_id,j.id,caller,'pending',false,
    jsonb_build_object('message_fingerprint',md5(btrim(message_content)))
  )
  returning * into request_row;

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
