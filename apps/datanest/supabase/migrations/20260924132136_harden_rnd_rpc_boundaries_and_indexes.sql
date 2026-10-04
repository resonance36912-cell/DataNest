
alter function public.accept_pending_job_invites() set schema private;
alter function public.submit_job_input(uuid,text,text) set schema private;
alter function public.post_job_ai_message(uuid,text) set schema private;
alter function public.click_ai_suggestion(uuid) set schema private;
alter function public.dispatch_ai_suggestion(uuid) set schema private;
alter function public.record_ai_development_update(uuid,text,text,integer,text) set schema private;
alter function public.refresh_job_ai_suggestions(uuid) set schema private;

revoke all on function private.accept_pending_job_invites() from public, anon;
revoke all on function private.submit_job_input(uuid,text,text) from public, anon;
revoke all on function private.post_job_ai_message(uuid,text) from public, anon;
revoke all on function private.click_ai_suggestion(uuid) from public, anon;
revoke all on function private.dispatch_ai_suggestion(uuid) from public, anon;
revoke all on function private.record_ai_development_update(uuid,text,text,integer,text) from public, anon;
revoke all on function private.refresh_job_ai_suggestions(uuid) from public, anon;

grant execute on function private.accept_pending_job_invites() to authenticated;
grant execute on function private.submit_job_input(uuid,text,text) to authenticated;
grant execute on function private.post_job_ai_message(uuid,text) to authenticated;
grant execute on function private.click_ai_suggestion(uuid) to authenticated;
grant execute on function private.dispatch_ai_suggestion(uuid) to authenticated;
grant execute on function private.record_ai_development_update(uuid,text,text,integer,text) to authenticated;
grant execute on function private.refresh_job_ai_suggestions(uuid) to authenticated;

create or replace function public.accept_pending_job_invites()
returns integer
language sql
set search_path = public, private
as $$
  select private.accept_pending_job_invites();
$$;

create or replace function public.submit_job_input(
  target_job uuid,
  target_input_type text,
  input_content text
)
returns table(input_id uuid, created_at timestamptz)
language sql
set search_path = public, private
as $$
  select * from private.submit_job_input(target_job,target_input_type,input_content);
$$;

create or replace function public.post_job_ai_message(
  target_job uuid,
  message_content text
)
returns jsonb
language sql
set search_path = public, private
as $$
  select private.post_job_ai_message(target_job,message_content);
$$;

create or replace function public.click_ai_suggestion(target_suggestion uuid)
returns text
language sql
set search_path = public, private
as $$
  select private.click_ai_suggestion(target_suggestion);
$$;

create or replace function public.dispatch_ai_suggestion(target_suggestion uuid)
returns table(step_id uuid, step_key text)
language sql
set search_path = public, private
as $$
  select * from private.dispatch_ai_suggestion(target_suggestion);
$$;

create or replace function public.record_ai_development_update(
  target_job uuid,
  target_stage text,
  target_status text,
  target_progress integer,
  update_summary text
)
returns uuid
language sql
set search_path = public, private
as $$
  select private.record_ai_development_update(
    target_job,target_stage,target_status,target_progress,update_summary
  );
$$;

create or replace function public.refresh_job_ai_suggestions(target_job uuid)
returns integer
language sql
set search_path = public, private
as $$
  select private.refresh_job_ai_suggestions(target_job);
$$;

revoke all on function public.accept_pending_job_invites() from public, anon;
revoke all on function public.submit_job_input(uuid,text,text) from public, anon;
revoke all on function public.post_job_ai_message(uuid,text) from public, anon;
revoke all on function public.click_ai_suggestion(uuid) from public, anon;
revoke all on function public.dispatch_ai_suggestion(uuid) from public, anon;
revoke all on function public.record_ai_development_update(uuid,text,text,integer,text) from public, anon;
revoke all on function public.refresh_job_ai_suggestions(uuid) from public, anon;

grant execute on function public.accept_pending_job_invites() to authenticated;
grant execute on function public.submit_job_input(uuid,text,text) to authenticated;
grant execute on function public.post_job_ai_message(uuid,text) to authenticated;
grant execute on function public.click_ai_suggestion(uuid) to authenticated;
grant execute on function public.dispatch_ai_suggestion(uuid) to authenticated;
grant execute on function public.record_ai_development_update(uuid,text,text,integer,text) to authenticated;
grant execute on function public.refresh_job_ai_suggestions(uuid) to authenticated;

create index if not exists ai_development_updates_created_by_idx
  on public.ai_development_updates(created_by);
create index if not exists ai_development_updates_project_idx
  on public.ai_development_updates(project_id);
create index if not exists ai_messages_project_idx
  on public.ai_messages(project_id);
create index if not exists ai_messages_user_idx
  on public.ai_messages(user_id);
create index if not exists ai_prompt_queue_clicked_by_idx
  on public.ai_prompt_queue(clicked_by);
create index if not exists ai_prompt_queue_created_by_user_idx
  on public.ai_prompt_queue(created_by_user);
create index if not exists ai_prompt_queue_dispatched_step_idx
  on public.ai_prompt_queue(dispatched_step_id);
create index if not exists ai_prompt_queue_project_idx
  on public.ai_prompt_queue(project_id);
create index if not exists job_collaborators_invited_by_idx
  on public.job_collaborators(invited_by);
create index if not exists job_inputs_project_idx
  on public.job_inputs(project_id);
