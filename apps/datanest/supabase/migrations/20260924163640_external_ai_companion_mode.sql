
alter table public.external_ai_sessions
  drop constraint if exists external_ai_sessions_launch_mode_check;

alter table public.external_ai_sessions
  add constraint external_ai_sessions_launch_mode_check
  check (launch_mode in ('sidebar','companion','popout','external_tab'));

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
begin
  if mode_value not in ('sidebar','companion','popout') then
    raise exception 'External AI launch mode must be sidebar, companion, or popout.';
  end if;

  payload := private.start_external_ai_session(target_job,target_provider);
  sid := (payload->>'session_id')::uuid;

  update public.external_ai_sessions
  set launch_mode=mode_value,
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
      'contribution_awarded',false
    )
  from public.external_ai_sessions s
  where s.id=sid;

  return payload || jsonb_build_object('launch_mode',mode_value);
end;
$$;
