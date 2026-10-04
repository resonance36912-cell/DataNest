
create or replace function private.complete_ai_chat_request(
  target_request uuid,
  assistant_content text,
  provider_mode text,
  generated_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  req public.ai_usage_requests%rowtype;
  result jsonb;
  assistant_id uuid;
  final_status text;
begin
  select * into req from public.ai_usage_requests where id=target_request;
  if not found then raise exception 'AI request not found.'; end if;

  if req.user_id <> caller then
    raise insufficient_privilege using message='AI request ownership is required.';
  end if;

  if req.assistant_message_id is not null then
    return jsonb_build_object(
      'request_id',req.id,
      'assistant_message_id',req.assistant_message_id,
      'status',req.status,
      'idempotent',true
    );
  end if;

  result := private.record_ai_assistant_response(
    req.job_id,assistant_content,provider_mode,generated_suggestions
  );
  assistant_id := (result->>'ai_message_id')::uuid;

  final_status := case
    when req.status in ('unknown','failed','denied') then req.status
    when provider_mode='external' and req.status='succeeded' then 'succeeded'
    when provider_mode='embedded' then 'embedded'
    else req.status
  end;

  update public.ai_usage_requests
  set assistant_message_id=assistant_id,
      status=final_status,
      completed_at=case
        when final_status in ('succeeded','embedded','failed','denied') then coalesce(completed_at,now())
        else completed_at
      end
  where id=req.id;

  return result || jsonb_build_object(
    'request_id',req.id,
    'request_status',final_status,
    'idempotent',false
  );
end;
$$;
