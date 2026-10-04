
create table if not exists public.job_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'contributor'
    check (role in ('contributor','reviewer','observer')),
  status text not null default 'invited'
    check (status in ('invited','accepted','declined','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_input_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,user_id)
);

create unique index if not exists job_collaborators_job_email_uidx
  on public.job_collaborators(job_id, lower(email));
create index if not exists job_collaborators_project_idx
  on public.job_collaborators(project_id);
create index if not exists job_collaborators_user_idx
  on public.job_collaborators(user_id);
create index if not exists job_collaborators_job_idx
  on public.job_collaborators(job_id);

create table if not exists public.job_inputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  actor_label text not null,
  input_type text not null default 'comment'
    check (input_type in ('comment','requirement','decision','feedback','answer','chat')),
  content text not null,
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_inputs_job_created_idx
  on public.job_inputs(job_id, created_at desc);
create index if not exists job_inputs_user_idx
  on public.job_inputs(user_id);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_type text not null
    check (author_type in ('user','ai','system')),
  author_label text not null,
  content text not null,
  status text not null default 'posted'
    check (status in ('posted','queued','processing','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_job_created_idx
  on public.ai_messages(job_id, created_at);

create table if not exists public.ai_development_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  source text not null default 'system'
    check (source in ('ai','user','system')),
  stage text not null
    check (stage in ('planning','architecture','scheduling','implementation','validation','release')),
  status text not null default 'planned'
    check (status in ('planned','in_progress','blocked','review','complete')),
  progress smallint not null default 0
    check (progress between 0 and 100),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_development_updates_job_created_idx
  on public.ai_development_updates(job_id, created_at desc);

create table if not exists public.ai_prompt_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  prompt text not null,
  suggestion_type text not null default 'next_action'
    check (suggestion_type in ('analysis','implementation','test','risk','review','next_action','collaboration')),
  priority smallint not null default 50
    check (priority between 0 and 100),
  status text not null default 'queued'
    check (status in ('queued','selected','dispatched','completed','dismissed')),
  created_by_type text not null default 'system'
    check (created_by_type in ('ai','system','user')),
  created_by_user uuid references auth.users(id) on delete set null,
  clicked_by uuid references auth.users(id) on delete set null,
  clicked_at timestamptz,
  dispatched_step_id uuid references public.job_steps(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_prompt_queue_job_prompt_uidx
  on public.ai_prompt_queue(job_id, prompt);
create index if not exists ai_prompt_queue_job_status_idx
  on public.ai_prompt_queue(job_id, status, priority desc);

alter table public.job_collaborators enable row level security;
alter table public.job_inputs enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_development_updates enable row level security;
alter table public.ai_prompt_queue enable row level security;

create or replace function private.is_job_collaborator(target_job uuid)returns boolean language sql stable security definer set search_path=private,public,auth as $$ select exists(select 1 from public.job_collaborators jc where jc.job_id=target_job and jc.user_id=auth.uid()and jc.status='accepted');$$;create or replace function private.has_project_access(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, auth
as $$
  select
    private.is_project_member(target_project)
    or exists (
      select 1
      from public.job_collaborators jc
      where jc.project_id = target_project
        and jc.user_id = auth.uid()
        and jc.status = 'accepted'
    );
$$;

revoke all on function private.is_job_collaborator(uuid) from public;
revoke all on function private.has_project_access(uuid) from public;
grant execute on function private.is_job_collaborator(uuid) to authenticated, service_role;
grant execute on function private.has_project_access(uuid) to authenticated, service_role;

alter policy projects_select on public.projects
using (private.has_project_access(id));

alter policy jobs_select on public.jobs
using (
  private.is_project_member(project_id)
  or private.is_job_collaborator(id)
);

alter policy job_steps_select on public.job_steps
using (
  private.is_project_member(private.job_project_id(job_id))
  or private.is_job_collaborator(job_id)
);

alter policy dependencies_select on public.dependencies
using (
  private.is_project_member(private.job_project_id(job_id))
  or private.is_job_collaborator(job_id)
);

alter policy reservations_select on public.reservations
using (
  private.is_project_member(private.job_project_id(job_id))
  or private.is_job_collaborator(job_id)
);

alter policy runs_select on public.runs
using (
  private.is_project_member(private.job_project_id(job_id))
  or private.is_job_collaborator(job_id)
);

alter policy checkpoints_select on public.checkpoints
using (
  private.is_project_member(private.job_project_id(job_id))
  or private.is_job_collaborator(job_id)
);

alter policy artifacts_select on public.artifacts
using (
  private.is_project_member(project_id)
  or (job_id is not null and private.is_job_collaborator(job_id))
);

alter policy events_select on public.events
using (
  private.is_project_member(project_id)
  or (job_id is not null and private.is_job_collaborator(job_id))
);

drop policy if exists job_collaborators_select on public.job_collaborators;
create policy job_collaborators_select
on public.job_collaborators for select to authenticated
using (
  private.is_project_member(project_id)
  or user_id = (select auth.uid())
);

drop policy if exists job_inputs_select on public.job_inputs;
create policy job_inputs_select
on public.job_inputs for select to authenticated
using (
  private.is_project_member(project_id)
  or private.is_job_collaborator(job_id)
);

drop policy if exists ai_messages_select on public.ai_messages;
create policy ai_messages_select
on public.ai_messages for select to authenticated
using (
  private.is_project_member(project_id)
  or private.is_job_collaborator(job_id)
);

drop policy if exists ai_development_updates_select on public.ai_development_updates;
create policy ai_development_updates_select
on public.ai_development_updates for select to authenticated
using (
  private.is_project_member(project_id)
  or private.is_job_collaborator(job_id)
);

drop policy if exists ai_development_updates_insert on public.ai_development_updates;
create policy ai_development_updates_insert
on public.ai_development_updates for insert to authenticated
with check (
  private.has_project_role(project_id, array['owner','admin','operator'])
);

drop policy if exists ai_prompt_queue_select on public.ai_prompt_queue;
create policy ai_prompt_queue_select
on public.ai_prompt_queue for select to authenticated
using (
  private.is_project_member(project_id)
  or private.is_job_collaborator(job_id)
);

revoke all on table
  public.job_collaborators,
  public.job_inputs,
  public.ai_messages,
  public.ai_development_updates,
  public.ai_prompt_queue
from anon, authenticated;

grant select on
  public.job_collaborators,
  public.job_inputs,
  public.ai_messages,
  public.ai_prompt_queue
to authenticated;

grant select, insert on public.ai_development_updates to authenticated;

create or replace function public.accept_pending_job_invites()
returns integer
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  accepted_count integer := 0;
begin
  if caller is null then
    raise insufficient_privilege using message = 'Authentication is required.';
  end if;

  update public.job_collaborators
  set status='accepted',
      accepted_at=coalesce(accepted_at,now()),
      updated_at=now()
  where user_id=caller
    and status='invited';

  get diagnostics accepted_count = row_count;

  if accepted_count > 0 then
    insert into public.events(project_id,job_id,event_type,actor,payload)
    select
      jc.project_id,
      jc.job_id,
      'JOB_INVITE_ACCEPTED',
      coalesce(auth.jwt()->>'email',caller::text),
      jsonb_build_object('collaborator_id',jc.id,'role',jc.role)
    from public.job_collaborators jc
    where jc.user_id=caller
      and jc.status='accepted'
      and jc.accepted_at >= now() - interval '5 seconds';
  end if;

  return accepted_count;
end;
$$;

revoke all on function public.accept_pending_job_invites() from public, anon;
grant execute on function public.accept_pending_job_invites() to authenticated;

create or replace function public.resolve_auth_user_id_by_email(target_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id
  from auth.users
  where lower(email)=lower(btrim(target_email))
  order by created_at
  limit 1;
$$;

revoke all on function public.resolve_auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.resolve_auth_user_id_by_email(text) to service_role;

create or replace function public.register_job_invite(
  target_job uuid,
  target_user uuid,
  target_email text,
  target_job_role text,
  invited_by_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_project uuid;
  collab public.job_collaborators%rowtype;
begin
  if target_job_role not in ('contributor','reviewer','observer') then
    raise exception 'Invalid collaborator role.';
  end if;

  select project_id into target_project
  from public.jobs
  where id=target_job;

  if target_project is null then
    raise exception 'Job not found.';
  end if;

  insert into public.job_collaborators(
    project_id,job_id,user_id,email,role,status,invited_by,invited_at,metadata
  )
  values(
    target_project,target_job,target_user,lower(btrim(target_email)),
    target_job_role,'invited',invited_by_user,now(),
    jsonb_build_object('invite_source','UNIFI Job Manifest Planner')
  )
  on conflict (job_id,user_id) do update
  set email=excluded.email,
      role=excluded.role,
      status=case
        when public.job_collaborators.status='accepted' then 'accepted'
        else 'invited'
      end,
      invited_by=excluded.invited_by,
      invited_at=now(),
      updated_at=now()
  returning * into collab;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,target_job,'JOB_INVITE_SENT','unifi-invite',
    jsonb_build_object(
      'collaborator_id',collab.id,
      'email',collab.email,
      'role',collab.role
    )
  );

  return jsonb_build_object(
    'id',collab.id,
    'job_id',collab.job_id,
    'email',collab.email,
    'role',collab.role,
    'status',collab.status
  );
end;
$$;

revoke all on function public.register_job_invite(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.register_job_invite(uuid,uuid,text,text,uuid) to service_role;

create or replace function public.submit_job_input(
  target_job uuid,
  target_input_type text,
  input_content text
)
returns table(input_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  target_project uuid;
  inserted public.job_inputs%rowtype;
  actor text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_input_type not in ('comment','requirement','decision','feedback','answer') then
    raise exception 'Invalid input type.';
  end if;

  if nullif(btrim(input_content),'') is null then
    raise exception 'Input is required.';
  end if;

  select project_id into target_project from public.jobs where id=target_job;
  if target_project is null then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(target_project)
    or private.is_job_collaborator(target_job)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  actor := coalesce(auth.jwt()->>'email',caller::text);

  insert into public.job_inputs(
    project_id,job_id,user_id,actor_label,input_type,content,metadata
  )
  values(
    target_project,target_job,caller,actor,target_input_type,btrim(input_content),
    jsonb_build_object('source','R&D Dashboard')
  )
  returning * into inserted;

  update public.job_collaborators
  set last_input_at=now(), updated_at=now()
  where job_id=target_job and user_id=caller and status='accepted';

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,target_job,'RND_INPUT_ADDED',actor,
    jsonb_build_object('input_id',inserted.id,'input_type',target_input_type)
  );

  return query select inserted.id,inserted.created_at;
end;
$$;

revoke all on function public.submit_job_input(uuid,text,text) from public, anon;
grant execute on function public.submit_job_input(uuid,text,text) to authenticated;

create or replace function private.seed_job_ai_suggestions(target_job uuid)
returns integer
language plpgsql
security definer
set search_path = private, public
as $$
declare
  j public.jobs%rowtype;
  added integer := 0;
begin
  select * into j from public.jobs where id=target_job;
  if not found then return 0; end if;

  insert into public.ai_prompt_queue(
    project_id,job_id,prompt,suggestion_type,priority,status,created_by_type
  )
  values
    (
      j.project_id,j.id,
      'Review the Job Manifest for "'||j.title||'" and identify missing requirements, assumptions, dependencies, and owner decisions.',
      'analysis',95,'queued','ai'
    ),
    (
      j.project_id,j.id,
      'Break "'||j.title||'" into the smallest executable development steps and map each step to the required UNIFI or TranScheduler capability.',
      'implementation',90,'queued','ai'
    ),
    (
      j.project_id,j.id,
      'Generate acceptance tests and evidence requirements for "'||j.title||'" from the current manifest and acceptance criteria.',
      'test',85,'queued','ai'
    ),
    (
      j.project_id,j.id,
      'Identify technical, security, integration, and deployment risks that could block "'||j.title||'", then propose mitigations.',
      'risk',80,'queued','ai'
    ),
    (
      j.project_id,j.id,
      'Recommend the next highest-value action for "'||j.title||'" based on its current status ('||j.status||') and available project evidence.',
      'next_action',75,'queued','ai'
    )
  on conflict (job_id,prompt) do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function private.seed_job_ai_suggestions(uuid) from public;
grant execute on function private.seed_job_ai_suggestions(uuid) to authenticated, service_role;

create or replace function public.post_job_ai_message(
  target_job uuid,
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
  actor text;
  user_message public.ai_messages%rowtype;
  ai_message public.ai_messages%rowtype;
  next_prompt text;
  response_text text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if nullif(btrim(message_content),'') is null then
    raise exception 'Message is required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(j.project_id)
    or private.is_job_collaborator(j.id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  actor := coalesce(auth.jwt()->>'email',caller::text);

  insert into public.ai_messages(
    project_id,job_id,user_id,author_type,author_label,content,status,metadata
  )
  values(
    j.project_id,j.id,caller,'user',actor,btrim(message_content),'posted',
    jsonb_build_object('source','R&D AI Collaboration')
  )
  returning * into user_message;

  insert into public.job_inputs(
    project_id,job_id,user_id,actor_label,input_type,content,metadata
  )
  values(
    j.project_id,j.id,caller,actor,'chat',btrim(message_content),
    jsonb_build_object('ai_message_id',user_message.id,'source','R&D AI Collaboration')
  );

  insert into public.ai_prompt_queue(
    project_id,job_id,prompt,suggestion_type,priority,status,created_by_type,created_by_user
  )
  values(
    j.project_id,j.id,
    'Collaborate on this Job Manifest input: '||btrim(message_content),
    'collaboration',88,'queued','user',caller
  )
  on conflict (job_id,prompt) do update
  set priority=greatest(public.ai_prompt_queue.priority,excluded.priority),
      updated_at=now();

  perform private.seed_job_ai_suggestions(j.id);

  select prompt into next_prompt
  from public.ai_prompt_queue
  where job_id=j.id
    and status in ('queued','selected')
  order by priority desc,created_at
  limit 1;

  response_text :=
    'UNIFI has logged your collaboration input for JOB-'||
    lpad(j.job_number::text,5,'0')||
    '. Current manifest status: '||j.status||
    '. Your message is queued for AI-assisted development review.'||
    case when next_prompt is not null
      then ' Suggested prompt: '||next_prompt
      else ' No additional prompt is queued yet.'
    end;

  insert into public.ai_messages(
    project_id,job_id,user_id,author_type,author_label,content,status,metadata
  )
  values(
    j.project_id,j.id,null,'ai','UNIFI Copilot',response_text,'posted',
    jsonb_build_object('mode','queue-backed','external_model_required_for_generation',true)
  )
  returning * into ai_message;

  update public.job_collaborators
  set last_input_at=now(), updated_at=now()
  where job_id=j.id and user_id=caller and status='accepted';

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    j.project_id,j.id,'AI_COLLABORATION_MESSAGE',actor,
    jsonb_build_object('user_message_id',user_message.id,'ai_message_id',ai_message.id)
  );

  return jsonb_build_object(
    'user_message_id',user_message.id,
    'ai_message_id',ai_message.id,
    'assistant_message',ai_message.content
  );
end;
$$;

revoke all on function public.post_job_ai_message(uuid,text) from public, anon;
grant execute on function public.post_job_ai_message(uuid,text) to authenticated;

create or replace function public.click_ai_suggestion(target_suggestion uuid)
returns text
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  s public.ai_prompt_queue%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into s from public.ai_prompt_queue where id=target_suggestion;
  if not found then raise exception 'Suggestion not found.'; end if;

  if not (
    private.is_project_member(s.project_id)
    or private.is_job_collaborator(s.job_id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  update public.ai_prompt_queue
  set status=case when status='queued' then 'selected' else status end,
      clicked_by=caller,
      clicked_at=now(),
      updated_at=now()
  where id=s.id;

  return s.prompt;
end;
$$;

revoke all on function public.click_ai_suggestion(uuid) from public, anon;
grant execute on function public.click_ai_suggestion(uuid) to authenticated;

create or replace function public.dispatch_ai_suggestion(target_suggestion uuid)
returns table(step_id uuid, step_key text)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  s public.ai_prompt_queue%rowtype;
  new_step public.job_steps%rowtype;
  next_position integer;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into s from public.ai_prompt_queue where id=target_suggestion for update;
  if not found then raise exception 'Suggestion not found.'; end if;

  if not private.has_project_role(s.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required to dispatch AI suggestions.';
  end if;

  if s.status in ('dispatched','completed','dismissed') then
    raise exception 'Suggestion cannot be dispatched from status %.',s.status;
  end if;

  select coalesce(max(position),0)+1 into next_position
  from public.job_steps where job_id=s.job_id;

  insert into public.job_steps(
    job_id,step_key,title,step_type,capability,status,position,payload
  )
  values(
    s.job_id,
    'AI-'||upper(left(replace(s.id::text,'-',''),8)),
    'AI suggestion: '||left(s.prompt,90),
    'ai_collaboration',
    'chat',
    'PLANNED',
    next_position,
    jsonb_build_object('prompt',s.prompt,'suggestion_id',s.id)
  )
  returning * into new_step;

  update public.ai_prompt_queue
  set status='dispatched',
      clicked_by=coalesce(clicked_by,caller),
      clicked_at=coalesce(clicked_at,now()),
      dispatched_step_id=new_step.id,
      updated_at=now()
  where id=s.id;

  insert into public.ai_development_updates(
    project_id,job_id,source,stage,status,progress,summary,details,created_by
  )
  values(
    s.project_id,s.job_id,'ai','implementation','in_progress',25,
    'AI suggestion dispatched into the Job Manifest execution plan.',
    jsonb_build_object('suggestion_id',s.id,'step_id',new_step.id,'prompt',s.prompt),
    caller
  );

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    s.project_id,s.job_id,'AI_SUGGESTION_DISPATCHED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('suggestion_id',s.id,'step_id',new_step.id,'step_key',new_step.step_key)
  );

  return query select new_step.id,new_step.step_key;
end;
$$;

revoke all on function public.dispatch_ai_suggestion(uuid) from public, anon;
grant execute on function public.dispatch_ai_suggestion(uuid) to authenticated;

create or replace function public.record_ai_development_update(
  target_job uuid,
  target_stage text,
  target_status text,
  target_progress integer,
  update_summary text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  target_project uuid;
  inserted_id uuid;
begin
  select project_id into target_project from public.jobs where id=target_job;
  if target_project is null then raise exception 'Job not found.'; end if;

  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required to record development updates.';
  end if;

  if target_stage not in ('planning','architecture','scheduling','implementation','validation','release') then
    raise exception 'Invalid development stage.';
  end if;

  if target_status not in ('planned','in_progress','blocked','review','complete') then
    raise exception 'Invalid development status.';
  end if;

  if target_progress < 0 or target_progress > 100 then
    raise exception 'Progress must be between 0 and 100.';
  end if;

  if nullif(btrim(update_summary),'') is null then
    raise exception 'Update summary is required.';
  end if;

  insert into public.ai_development_updates(
    project_id,job_id,source,stage,status,progress,summary,created_by
  )
  values(
    target_project,target_job,'user',target_stage,target_status,target_progress,btrim(update_summary),caller
  )
  returning id into inserted_id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,target_job,'AI_DEVELOPMENT_UPDATE',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('update_id',inserted_id,'stage',target_stage,'status',target_status,'progress',target_progress)
  );

  return inserted_id;
end;
$$;

revoke all on function public.record_ai_development_update(uuid,text,text,integer,text) from public, anon;
grant execute on function public.record_ai_development_update(uuid,text,text,integer,text) to authenticated;

create or replace function public.refresh_job_ai_suggestions(target_job uuid)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_project uuid;
begin
  select project_id into target_project from public.jobs where id=target_job;
  if target_project is null then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(target_project)
    or private.is_job_collaborator(target_job)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  return private.seed_job_ai_suggestions(target_job);
end;
$$;

revoke all on function public.refresh_job_ai_suggestions(uuid) from public, anon;
grant execute on function public.refresh_job_ai_suggestions(uuid) to authenticated;

create or replace function public.create_job_manifest(
  target_project uuid,
  job_title text,
  job_description text default null,
  job_priority integer default 50,
  required_capability text default 'chat',
  tests_required boolean default true,
  artifact_required boolean default true
)
returns table(job_id uuid, job_number bigint)
language plpgsql
set search_path = public, private
as $$
declare
  new_job public.jobs%rowtype;
begin
  if not private.has_project_role(target_project, array['owner','admin','operator']) then
    raise insufficient_privilege using message = 'Operator access is required to create jobs.';
  end if;

  if nullif(btrim(job_title),'') is null then
    raise exception 'Job title is required';
  end if;

  if job_priority < 0 or job_priority > 100 then
    raise exception 'Priority must be between 0 and 100';
  end if;

  insert into public.jobs(
    project_id,title,description,priority,status,
    required_capabilities,requirements,acceptance
  )
  values(
    target_project,
    btrim(job_title),
    nullif(btrim(coalesce(job_description,'')),''),
    job_priority,
    'PLANNED',
    jsonb_build_array(required_capability),
    jsonb_build_object('source','UNIFI Planner'),
    jsonb_build_object(
      'tests_required',tests_required,
      'artifact_required',artifact_required
    )
  )
  returning * into new_job;

  insert into public.job_steps(job_id,step_key,title,step_type,capability,status,position)
  values
    (new_job.id,'STEP-1','Prepare execution package','analysis','chat','PLANNED',1),
    (new_job.id,'STEP-2','Execute requested work','execution',required_capability,'PLANNED',2),
    (new_job.id,'STEP-3','Verify acceptance criteria','verification','chat','PLANNED',3);

  insert into public.ai_development_updates(
    project_id,job_id,source,stage,status,progress,summary
  )
  values(
    target_project,new_job.id,'system','planning','planned',5,
    'Job Manifest created. AI development tracking initialized.'
  );

  perform private.seed_job_ai_suggestions(new_job.id);

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,new_job.id,'JOB_PLANNED','unifi-planner',
    jsonb_build_object(
      'capability',required_capability,
      'priority',job_priority,
      'ai_suggestions_seeded',true,
      'rnd_tracking_initialized',true
    )
  );

  return query select new_job.id, new_job.job_number;
end;
$$;

create or replace function public.transition_job_status(target_job uuid, target_status text)
returns table(job_id uuid, status text, updated_at timestamptz)
language plpgsql
set search_path = public, private
as $$
declare
  current_job public.jobs%rowtype;
  normalized text := upper(btrim(target_status));
  allowed boolean := false;
  dev_stage text := 'planning';
  dev_status text := 'in_progress';
  dev_progress integer := 10;
begin
  select * into current_job from public.jobs where id=target_job for update;
  if not found then
    raise exception 'Job not found';
  end if;

  if not private.has_project_role(current_job.project_id, array['owner','admin','operator']) then
    raise insufficient_privilege using message = 'Operator access is required to change job status.';
  end if;

  if normalized = current_job.status then
    return query select current_job.id,current_job.status,current_job.updated_at;
    return;
  end if;

  allowed := case current_job.status
    when 'PLANNED' then normalized in ('READY','PAUSED','CANCELLED')
    when 'READY' then normalized in ('QUEUED','PAUSED','CANCELLED')
    when 'QUEUED' then normalized in ('MATCHING','PAUSED','CANCELLED')
    when 'MATCHING' then normalized in ('RESERVED','PAUSED','CANCELLED')
    when 'RESERVED' then normalized in ('RUNNING','PAUSED','CANCELLED')
    when 'RUNNING' then normalized in ('VERIFYING','COMPLETED','PAUSED','CANCELLED','FAILED')
    when 'VERIFYING' then normalized in ('COMPLETED','FAILED','RETRY_WAIT','PAUSED','CANCELLED')
    when 'PAUSED' then normalized in ('READY','CANCELLED')
    when 'BLOCKED' then normalized in ('READY','PAUSED','CANCELLED')
    when 'BLOCKED_DEPENDENCY' then normalized in ('READY','PAUSED','CANCELLED')
    when 'MANUAL_ACTION' then normalized in ('READY','PAUSED','CANCELLED')
    when 'RETRY_WAIT' then normalized in ('READY','CANCELLED')
    else false
  end;

  if not allowed then
    raise exception 'Invalid job transition: % -> %', current_job.status, normalized;
  end if;

  update public.jobs
  set status=normalized, updated_at=now()
  where id=current_job.id
  returning * into current_job;

  select
    case normalized
      when 'READY' then 'planning'
      when 'QUEUED' then 'scheduling'
      when 'MATCHING' then 'scheduling'
      when 'RESERVED' then 'scheduling'
      when 'RUNNING' then 'implementation'
      when 'VERIFYING' then 'validation'
      when 'COMPLETED' then 'release'
      else 'implementation'
    end,
    case normalized
      when 'COMPLETED' then 'complete'
      when 'FAILED' then 'blocked'
      when 'CANCELLED' then 'blocked'
      when 'PAUSED' then 'blocked'
      when 'BLOCKED' then 'blocked'
      when 'BLOCKED_DEPENDENCY' then 'blocked'
      else 'in_progress'
    end,
    case normalized
      when 'READY' then 15
      when 'QUEUED' then 25
      when 'MATCHING' then 30
      when 'RESERVED' then 35
      when 'RUNNING' then 60
      when 'VERIFYING' then 85
      when 'COMPLETED' then 100
      when 'FAILED' then 100
      when 'CANCELLED' then 100
      else 40
    end
  into dev_stage,dev_status,dev_progress;

  insert into public.ai_development_updates(
    project_id,job_id,source,stage,status,progress,summary,details
  )
  values(
    current_job.project_id,current_job.id,'system',
    dev_stage,dev_status,dev_progress,
    'Job status changed to '||normalized||'.',
    jsonb_build_object('job_status',normalized)
  );

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    current_job.project_id,current_job.id,'JOB_'||normalized,'human-control',
    jsonb_build_object('new_status',normalized,'development_progress',dev_progress)
  );

  return query select current_job.id,current_job.status,current_job.updated_at;
end;
$$;

do $$
declare
  j record;
begin
  for j in select id,project_id,status from public.jobs loop
    perform private.seed_job_ai_suggestions(j.id);

    if not exists (
      select 1 from public.ai_development_updates d where d.job_id=j.id
    ) then
      insert into public.ai_development_updates(
        project_id,job_id,source,stage,status,progress,summary
      )
      values(
        j.project_id,j.id,'system',
        case
          when j.status in ('VERIFYING') then 'validation'
          when j.status in ('COMPLETED') then 'release'
          when j.status in ('RUNNING','RESERVED','MATCHING','QUEUED') then 'implementation'
          else 'planning'
        end,
        case
          when j.status='COMPLETED' then 'complete'
          when j.status in ('FAILED','CANCELLED','BLOCKED','BLOCKED_DEPENDENCY','PAUSED') then 'blocked'
          else 'in_progress'
        end,
        case
          when j.status='COMPLETED' then 100
          when j.status='VERIFYING' then 85
          when j.status='RUNNING' then 60
          when j.status in ('QUEUED','MATCHING','RESERVED') then 30
          else 10
        end,
        'R&D development tracking initialized for existing Job Manifest.'
      );
    end if;
  end loop;
end $$;
