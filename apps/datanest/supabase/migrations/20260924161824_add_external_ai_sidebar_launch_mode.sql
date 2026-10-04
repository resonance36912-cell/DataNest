
alter table public.external_ai_sessions
  add column if not exists launch_mode text not null default 'external_tab';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.external_ai_sessions'::regclass
      and conname='external_ai_sessions_launch_mode_check'
  ) then
    alter table public.external_ai_sessions
      add constraint external_ai_sessions_launch_mode_check
      check (launch_mode in ('sidebar','popout','external_tab'));
  end if;
end $$;

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
  if mode_value not in ('sidebar','popout') then
    raise exception 'External AI launch mode must be sidebar or popout.';
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
    'EXTERNAL_AI_SIDEBAR_SESSION_STARTED',
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

create or replace function public.start_external_ai_sidebar_session(
  target_job uuid,
  target_provider text,
  target_mode text
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.start_external_ai_sidebar_session(
    target_job,target_provider,target_mode
  );
$$;

revoke all on function public.start_external_ai_sidebar_session(uuid,text,text)
from public,anon;
grant execute on function public.start_external_ai_sidebar_session(uuid,text,text)
to authenticated;

revoke all on function private.start_external_ai_sidebar_session(uuid,text,text)
from public,anon;
grant execute on function private.start_external_ai_sidebar_session(uuid,text,text)
to authenticated,service_role;

create index if not exists external_ai_sessions_mode_idx
  on public.external_ai_sessions(project_id,launch_mode,launched_at desc);
