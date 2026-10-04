
create or replace function private.start_external_ai_sidebar_session(
  target_job uuid,
  target_provider text,
  target_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  payload jsonb;
  sid uuid;
  mode_value text := lower(btrim(target_mode));
  job_number_value bigint;
  trace_key text;
  delivery_mode text;
begin
  if mode_value not in ('sidebar','companion','popout') then
    raise exception 'External AI launch mode must be sidebar, companion, or popout.';
  end if;

  payload := private.start_external_ai_session(target_job,target_provider);
  sid := (payload->>'session_id')::uuid;
  job_number_value := coalesce((payload->'context'->>'job_number')::bigint,0);
  trace_key := 'DN-JOB-' || lpad(job_number_value::text,5,'0') || '-' || left(replace(sid::text,'-',''),12);

  delivery_mode := case
    when lower(btrim(target_provider))='chatgpt' and mode_value='companion' then 'url_prefill'
    when mode_value='sidebar' then 'iframe_or_fallback'
    else 'clipboard'
  end;

  update public.external_ai_sessions
  set launch_mode=mode_value,
      context_snapshot=coalesce(context_snapshot,'{}'::jsonb) || jsonb_build_object(
        'trace_key',trace_key,
        'prompt_delivery',delivery_mode
      ),
      updated_at=now()
  where id=sid;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  select
    s.project_id,
    s.job_id,
    case when mode_value='companion'
      then 'EXTERNAL_AI_COMPANION_SESSION_STARTED'
      else 'EXTERNAL_AI_SIDEBAR_SESSION_STARTED'
    end,
    coalesce(auth.jwt()->>'email',auth.uid()::text),
    jsonb_build_object(
      'external_ai_session_id',s.id,
      'provider',s.provider,
      'launch_mode',mode_value,
      'trace_key',trace_key,
      'prompt_delivery',delivery_mode,
      'contribution_awarded',false
    )
  from public.external_ai_sessions s
  where s.id=sid;

  return payload || jsonb_build_object(
    'launch_mode',mode_value,
    'trace_key',trace_key,
    'prompt_delivery',delivery_mode
  );
end;
$$;
