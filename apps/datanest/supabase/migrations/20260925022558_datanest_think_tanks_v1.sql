begin;

do $$
begin
  if to_regclass('public.certified_memory') is null
     or to_regclass('public.contribution_ledger') is null
     or to_regclass('public.ai_usage_requests') is null then
    raise exception 'Think Tanks require certified memory, contribution ledger and AI usage request foundations.';
  end if;
end $$;

alter table public.contribution_ledger
  drop constraint if exists contribution_ledger_contribution_type_check;

alter table public.contribution_ledger
  add constraint contribution_ledger_contribution_type_check
  check (contribution_type = any(array[
    'human_input'::text,
    'development_update'::text,
    'test_run'::text,
    'review'::text,
    'dispatched_prompt'::text,
    'ai_usage'::text,
    'manual_ai_credit'::text,
    'reusable_knowledge'::text
  ]));

create table if not exists public.think_tank_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel_key text not null,
  name text not null,
  description text,
  scope text not null default 'project' check (scope in ('project','job')),
  job_id uuid references public.jobs(id) on delete cascade,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,channel_key),
  check (
    (scope='project' and job_id is null)
    or
    (scope='job' and job_id is not null)
  )
);

create index if not exists think_tank_channels_project_idx
  on public.think_tank_channels(project_id,status,created_at);
create index if not exists think_tank_channels_job_idx
  on public.think_tank_channels(job_id)
  where job_id is not null;
create index if not exists think_tank_channels_created_by_idx
  on public.think_tank_channels(created_by)
  where created_by is not null;

create table if not exists public.think_tank_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  channel_id uuid not null references public.think_tank_channels(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open','closed','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists think_tank_threads_channel_idx
  on public.think_tank_threads(channel_id,status,updated_at desc);
create index if not exists think_tank_threads_project_idx
  on public.think_tank_threads(project_id,updated_at desc);
create index if not exists think_tank_threads_created_by_idx
  on public.think_tank_threads(created_by);

create table if not exists public.think_tank_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.think_tank_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(thread_id,user_id)
);

create index if not exists think_tank_ai_sessions_user_idx
  on public.think_tank_ai_sessions(user_id,updated_at desc);
create index if not exists think_tank_ai_sessions_project_idx
  on public.think_tank_ai_sessions(project_id,thread_id);

create table if not exists public.think_tank_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.think_tank_threads(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  initiated_by uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('human','datanest_ai','system')),
  message_type text not null default 'discussion' check (
    message_type in ('discussion','ai_command','ai_response','system')
  ),
  command_name text check (
    command_name is null
    or command_name in ('answer','summarize','record_decision','extract_actions','propose_learning')
  ),
  body text not null,
  source_request_id uuid references public.ai_usage_requests(id) on delete set null,
  source_trace_id text,
  created_at timestamptz not null default now(),
  check (
    (actor_kind='human' and author_user_id is not null)
    or
    (actor_kind='datanest_ai' and initiated_by is not null and source_request_id is not null and source_trace_id is not null)
    or
    actor_kind='system'
  )
);

create index if not exists think_tank_messages_thread_idx
  on public.think_tank_messages(thread_id,created_at);
create index if not exists think_tank_messages_author_idx
  on public.think_tank_messages(author_user_id,created_at desc)
  where author_user_id is not null;
create index if not exists think_tank_messages_initiated_by_idx
  on public.think_tank_messages(initiated_by,created_at desc)
  where initiated_by is not null;
create unique index if not exists think_tank_messages_ai_request_uidx
  on public.think_tank_messages(source_request_id)
  where source_request_id is not null and actor_kind='datanest_ai';

create table if not exists public.think_tank_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.think_tank_threads(id) on delete cascade,
  trace_key text not null unique,
  title text not null,
  decision_text text not null,
  status text not null default 'proposed' check (status in ('proposed','confirmed','rejected','superseded')),
  proposed_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  supersedes_decision_id uuid references public.think_tank_decisions(id),
  created_at timestamptz not null default now()
);

create index if not exists think_tank_decisions_thread_idx
  on public.think_tank_decisions(thread_id,status,created_at desc);
create index if not exists think_tank_decisions_proposed_by_idx
  on public.think_tank_decisions(proposed_by,created_at desc);
create index if not exists think_tank_decisions_reviewed_by_idx
  on public.think_tank_decisions(reviewed_by)
  where reviewed_by is not null;
create index if not exists think_tank_decisions_supersedes_idx
  on public.think_tank_decisions(supersedes_decision_id)
  where supersedes_decision_id is not null;

create table if not exists public.think_tank_action_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.think_tank_threads(id) on delete cascade,
  source_message_id uuid references public.think_tank_messages(id) on delete set null,
  trace_key text not null unique,
  description text not null,
  status text not null default 'proposed' check (
    status in ('proposed','open','in_progress','completed','cancelled')
  ),
  proposed_by uuid not null references auth.users(id),
  owner_user_id uuid references auth.users(id),
  due_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists think_tank_actions_thread_idx
  on public.think_tank_action_items(thread_id,status,created_at desc);
create index if not exists think_tank_actions_owner_idx
  on public.think_tank_action_items(owner_user_id,status,due_at)
  where owner_user_id is not null;
create index if not exists think_tank_actions_proposed_by_idx
  on public.think_tank_action_items(proposed_by,created_at desc);
create index if not exists think_tank_actions_reviewed_by_idx
  on public.think_tank_action_items(reviewed_by)
  where reviewed_by is not null;
create index if not exists think_tank_actions_source_message_idx
  on public.think_tank_action_items(source_message_id)
  where source_message_id is not null;

create table if not exists public.think_tank_learning_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.think_tank_threads(id) on delete cascade,
  trace_key text not null unique,
  normalized_knowledge text not null,
  category text not null,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  confidence numeric not null default 0.75 check (confidence between 0 and 1),
  content_hash text not null,
  source_message_ids uuid[] not null default '{}'::uuid[],
  source_trace_ids text[] not null default '{}'::text[],
  proposed_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  promoted_memory_id uuid references public.certified_memory(id),
  contribution_id uuid references public.contribution_ledger(id),
  policy_version text not null default 'think-tank-memory-v1',
  created_at timestamptz not null default now()
);

create unique index if not exists think_tank_learning_open_hash_uidx
  on public.think_tank_learning_candidates(project_id,content_hash)
  where status in ('proposed','approved');
create index if not exists think_tank_learning_thread_idx
  on public.think_tank_learning_candidates(thread_id,status,created_at desc);
create index if not exists think_tank_learning_proposed_by_idx
  on public.think_tank_learning_candidates(proposed_by,created_at desc);
create index if not exists think_tank_learning_reviewed_by_idx
  on public.think_tank_learning_candidates(reviewed_by)
  where reviewed_by is not null;
create index if not exists think_tank_learning_memory_idx
  on public.think_tank_learning_candidates(promoted_memory_id)
  where promoted_memory_id is not null;
create index if not exists think_tank_learning_contribution_idx
  on public.think_tank_learning_candidates(contribution_id)
  where contribution_id is not null;

insert into public.think_tank_channels(
  project_id,channel_key,name,description,scope,status,created_by
)
select
  p.id,
  'project-commons',
  'Project Commons',
  'Project-wide Think Tank for discussion, decisions, actions and reviewed institutional learning.',
  'project',
  'active',
  (
    select pm.user_id
    from public.project_members pm
    where pm.project_id=p.id and pm.status='active' and pm.role='owner'
    order by pm.created_at
    limit 1
  )
from public.projects p
on conflict(project_id,channel_key) do nothing;

create or replace function private.get_think_tank_thread_context(
  target_thread uuid
) returns table(
  thread_id uuid,
  project_id uuid,
  channel_id uuid,
  channel_scope text,
  job_id uuid,
  thread_status text
)
language sql
stable
security definer
set search_path=public,private
as $$
  select
    t.id,
    t.project_id,
    t.channel_id,
    c.scope,
    c.job_id,
    t.status
  from public.think_tank_threads t
  join public.think_tank_channels c on c.id=t.channel_id
  where t.id=target_thread
    and t.project_id=c.project_id;
$$;

create or replace function public.create_think_tank_channel_v1(
  target_project uuid,
  target_name text,
  target_description text default null,
  target_scope text default 'project',
  target_job uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
  key_text text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin or operator access is required.';
  end if;
  if nullif(btrim(target_name),'') is null then
    raise exception 'Channel name is required.';
  end if;
  if target_scope not in ('project','job') then
    raise exception 'Channel scope must be project or job.';
  end if;
  if target_scope='project' and target_job is not null then
    raise exception 'Project channels cannot be linked to a Job.';
  end if;
  if target_scope='job' then
    if target_job is null then
      raise exception 'Job scope requires a Job.';
    end if;
    if not exists(
      select 1 from public.jobs j
      where j.id=target_job and j.project_id=target_project
    ) then
      raise exception 'Job does not belong to this project.';
    end if;
  end if;

  key_text := trim(both '-' from lower(regexp_replace(btrim(target_name),'[^a-zA-Z0-9]+','-','g')))
    || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  insert into public.think_tank_channels(
    project_id,channel_key,name,description,scope,job_id,created_by
  )
  values(
    target_project,key_text,btrim(target_name),nullif(btrim(coalesce(target_description,'')),''),
    target_scope,target_job,caller
  )
  returning id into new_id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,target_job,'THINK_TANK_CHANNEL_CREATED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('channel_id',new_id,'scope',target_scope,'name',btrim(target_name))
  );

  return new_id;
end;
$$;

create or replace function public.create_think_tank_thread_v1(
  target_channel uuid,
  target_title text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  channel_row public.think_tank_channels%rowtype;
  new_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into channel_row
  from public.think_tank_channels
  where id=target_channel and status='active';

  if not found then raise exception 'Active Think Tank channel not found.'; end if;
  if not private.has_project_access(channel_row.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;
  if nullif(btrim(target_title),'') is null then
    raise exception 'Thread title is required.';
  end if;

  insert into public.think_tank_threads(project_id,channel_id,title,created_by)
  values(channel_row.project_id,channel_row.id,btrim(target_title),caller)
  returning id into new_id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    channel_row.project_id,channel_row.job_id,'THINK_TANK_THREAD_CREATED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('thread_id',new_id,'channel_id',channel_row.id,'title',btrim(target_title))
  );

  return new_id;
end;
$$;

create or replace function public.post_think_tank_message_v1(
  target_thread uuid,
  target_body text,
  target_message_type text default 'discussion',
  target_command_name text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  ctx record;
  new_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into ctx from private.get_think_tank_thread_context(target_thread);
  if not found then raise exception 'Think Tank thread not found.'; end if;
  if not private.has_project_access(ctx.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;
  if ctx.thread_status<>'open' then
    raise exception 'Only open Think Tank threads accept messages.';
  end if;
  if nullif(btrim(target_body),'') is null then
    raise exception 'Message body is required.';
  end if;
  if target_message_type not in ('discussion','ai_command') then
    raise exception 'Human Think Tank messages must be discussion or ai_command.';
  end if;
  if target_message_type='ai_command'
     and target_command_name not in ('answer','summarize','record_decision','extract_actions','propose_learning') then
    raise exception 'Unsupported DataNest command.';
  end if;
  if target_message_type='discussion' and target_command_name is not null then
    raise exception 'Discussion messages cannot have a DataNest command.';
  end if;

  insert into public.think_tank_messages(
    project_id,thread_id,author_user_id,actor_kind,message_type,command_name,body
  )
  values(
    ctx.project_id,target_thread,caller,'human',target_message_type,target_command_name,btrim(target_body)
  )
  returning id into new_id;

  update public.think_tank_threads
  set updated_at=now()
  where id=target_thread;

  return new_id;
end;
$$;

create or replace function public.record_think_tank_ai_message_v1(
  target_thread uuid,
  target_body text,
  target_trace_id text,
  target_request uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  ctx record;
  usage public.ai_usage_requests%rowtype;
  existing_message public.think_tank_messages%rowtype;
  new_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into ctx from private.get_think_tank_thread_context(target_thread);
  if not found then raise exception 'Think Tank thread not found.'; end if;
  if not private.has_project_access(ctx.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;
  if ctx.channel_scope<>'job' or ctx.job_id is null then
    raise exception 'DataNest AI collaboration requires a Job-linked Think Tank channel.';
  end if;
  if nullif(btrim(target_body),'') is null
     or nullif(btrim(target_trace_id),'') is null then
    raise exception 'AI response body and trace id are required.';
  end if;
  if target_trace_id not like 'DN-AI-%' then
    raise exception 'DataNest AI trace id is invalid.';
  end if;

  select * into usage
  from public.ai_usage_requests
  where id=target_request
    and project_id=ctx.project_id
    and job_id=ctx.job_id
    and user_id=caller
    and status in ('succeeded','embedded','unknown');

  if not found then
    raise insufficient_privilege using message='The AI response is not linked to an authorized DataNest AI request.';
  end if;

  select * into existing_message
  from public.think_tank_messages
  where source_request_id=target_request
    and actor_kind='datanest_ai'
  limit 1;

  if found then
    if existing_message.thread_id<>target_thread then
      raise exception 'This DataNest AI request is already attached to a different Think Tank thread.';
    end if;
    update public.think_tank_messages
    set body=btrim(target_body),source_trace_id=btrim(target_trace_id)
    where id=existing_message.id;
    new_id := existing_message.id;
  else
    insert into public.think_tank_messages(
      project_id,thread_id,initiated_by,actor_kind,message_type,body,
      source_request_id,source_trace_id
    )
    values(
      ctx.project_id,target_thread,caller,'datanest_ai','ai_response',btrim(target_body),
      target_request,btrim(target_trace_id)
    )
    returning id into new_id;
  end if;

  update public.think_tank_threads
  set updated_at=now()
  where id=target_thread;

  return new_id;
end;
$$;

create or replace function public.upsert_think_tank_ai_session_v1(
  target_thread uuid,
  target_session uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  ctx record;
  row_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_session is null then raise exception 'AI session id is required.'; end if;

  select * into ctx from private.get_think_tank_thread_context(target_thread);
  if not found then raise exception 'Think Tank thread not found.'; end if;
  if not private.has_project_access(ctx.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;
  if ctx.channel_scope<>'job' or ctx.job_id is null then
    raise exception 'AI sessions can only be attached to Job-linked Think Tank channels.';
  end if;

  insert into public.think_tank_ai_sessions(project_id,thread_id,user_id,session_id)
  values(ctx.project_id,target_thread,caller,target_session)
  on conflict(thread_id,user_id) do update
  set session_id=excluded.session_id,updated_at=now()
  returning id into row_id;

  return row_id;
end;
$$;

create or replace function public.create_think_tank_decision_v1(
  target_thread uuid,
  target_title text,
  target_decision text,
  target_supersedes uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  ctx record;
  new_id uuid;
  trace text := 'DN-THINK-DEC-' || replace(gen_random_uuid()::text,'-','');
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  select * into ctx from private.get_think_tank_thread_context(target_thread);
  if not found then raise exception 'Think Tank thread not found.'; end if;
  if not private.has_project_access(ctx.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;
  if nullif(btrim(target_title),'') is null or nullif(btrim(target_decision),'') is null then
    raise exception 'Decision title and decision text are required.';
  end if;
  if target_supersedes is not null and not exists(
    select 1 from public.think_tank_decisions d
    where d.id=target_supersedes and d.project_id=ctx.project_id and d.status='confirmed'
  ) then
    raise exception 'Superseded decision must be confirmed in this project.';
  end if;

  insert into public.think_tank_decisions(
    project_id,thread_id,trace_key,title,decision_text,proposed_by,supersedes_decision_id
  )
  values(
    ctx.project_id,target_thread,trace,btrim(target_title),btrim(target_decision),caller,target_supersedes
  )
  returning id into new_id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    ctx.project_id,ctx.job_id,'THINK_TANK_DECISION_PROPOSED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('decision_id',new_id,'trace_key',trace,'thread_id',target_thread)
  );

  return new_id;
end;
$$;

create or replace function public.review_think_tank_decision_v1(
  target_decision uuid,
  target_status text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  decision_row public.think_tank_decisions%rowtype;
  ctx record;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_status not in ('confirmed','rejected') then
    raise exception 'Decision review status must be confirmed or rejected.';
  end if;

  select * into decision_row
  from public.think_tank_decisions
  where id=target_decision and status='proposed';

  if not found then raise exception 'Pending decision proposal not found.'; end if;
  if not private.has_project_role(decision_row.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if decision_row.proposed_by=caller then
    raise insufficient_privilege using message='A stakeholder cannot confirm their own decision proposal.';
  end if;

  select * into ctx from private.get_think_tank_thread_context(decision_row.thread_id);

  update public.think_tank_decisions
  set status=target_status,reviewed_by=caller,reviewed_at=now()
  where id=decision_row.id;

  if target_status='confirmed' and decision_row.supersedes_decision_id is not null then
    update public.think_tank_decisions
    set status='superseded'
    where id=decision_row.supersedes_decision_id
      and project_id=decision_row.project_id
      and status='confirmed';
  end if;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    decision_row.project_id,ctx.job_id,'THINK_TANK_DECISION_REVIEWED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'decision_id',decision_row.id,
      'trace_key',decision_row.trace_key,
      'review_status',target_status
    )
  );

  return decision_row.id;
end;
$$;

create or replace function public.create_think_tank_action_v1(
  target_thread uuid,
  target_description text,
  target_source_message uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  ctx record;
  new_id uuid;
  trace text := 'DN-THINK-ACT-' || replace(gen_random_uuid()::text,'-','');
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  select * into ctx from private.get_think_tank_thread_context(target_thread);
  if not found then raise exception 'Think Tank thread not found.'; end if;
  if not private.has_project_access(ctx.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;
  if nullif(btrim(target_description),'') is null then
    raise exception 'Action description is required.';
  end if;
  if target_source_message is not null and not exists(
    select 1 from public.think_tank_messages m
    where m.id=target_source_message and m.thread_id=target_thread and m.project_id=ctx.project_id
  ) then
    raise exception 'Source message does not belong to this Think Tank thread.';
  end if;

  insert into public.think_tank_action_items(
    project_id,thread_id,source_message_id,trace_key,description,proposed_by
  )
  values(
    ctx.project_id,target_thread,target_source_message,trace,btrim(target_description),caller
  )
  returning id into new_id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    ctx.project_id,ctx.job_id,'THINK_TANK_ACTION_PROPOSED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('action_id',new_id,'trace_key',trace,'thread_id',target_thread)
  );

  return new_id;
end;
$$;

create or replace function public.review_think_tank_action_v1(
  target_action uuid,
  target_status text,
  target_owner uuid default null,
  target_due_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  action_row public.think_tank_action_items%rowtype;
  ctx record;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_status not in ('open','cancelled') then
    raise exception 'Action review status must be open or cancelled.';
  end if;

  select * into action_row
  from public.think_tank_action_items
  where id=target_action and status='proposed';

  if not found then raise exception 'Pending action proposal not found.'; end if;
  if not private.has_project_role(action_row.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin or operator access is required.';
  end if;
  if target_owner is not null and not exists(
    select 1 from public.project_members pm
    where pm.project_id=action_row.project_id
      and pm.user_id=target_owner
      and pm.status='active'
  ) then
    raise exception 'Action owner must be an active project member.';
  end if;

  select * into ctx from private.get_think_tank_thread_context(action_row.thread_id);

  update public.think_tank_action_items
  set status=target_status,
      owner_user_id=case when target_status='open' then target_owner else owner_user_id end,
      due_at=case when target_status='open' then target_due_at else due_at end,
      reviewed_by=caller,
      reviewed_at=now(),
      updated_at=now()
  where id=action_row.id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    action_row.project_id,ctx.job_id,'THINK_TANK_ACTION_REVIEWED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'action_id',action_row.id,
      'trace_key',action_row.trace_key,
      'review_status',target_status,
      'owner_user_id',target_owner,
      'due_at',target_due_at
    )
  );

  return action_row.id;
end;
$$;

create or replace function public.update_think_tank_action_status_v1(
  target_action uuid,
  target_status text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  action_row public.think_tank_action_items%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_status not in ('open','in_progress','completed','cancelled') then
    raise exception 'Unsupported action status.';
  end if;

  select * into action_row
  from public.think_tank_action_items
  where id=target_action and status<>'proposed';

  if not found then raise exception 'Reviewed action item not found.'; end if;
  if action_row.owner_user_id<>caller
     and not private.has_project_role(action_row.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Only the assigned owner or project operators may update this action.';
  end if;

  update public.think_tank_action_items
  set status=target_status,
      completed_at=case when target_status='completed' then now() else null end,
      updated_at=now()
  where id=action_row.id;

  return action_row.id;
end;
$$;

create or replace function public.propose_think_tank_learning_v1(
  target_thread uuid,
  target_knowledge text,
  target_category text,
  target_source_messages uuid[] default '{}'::uuid[],
  target_confidence numeric default 0.75
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth,extensions
as $$
declare
  caller uuid := auth.uid();
  ctx record;
  new_id uuid;
  normalized text;
  hash_text text;
  traces text[];
  trace text := 'DN-THINK-LEARN-' || replace(gen_random_uuid()::text,'-','');
  requested_count integer;
  matched_count integer;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  select * into ctx from private.get_think_tank_thread_context(target_thread);
  if not found then raise exception 'Think Tank thread not found.'; end if;
  if not private.has_project_access(ctx.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  normalized := btrim(coalesce(target_knowledge,''));
  if normalized='' then raise exception 'Learning candidate text is required.'; end if;
  if nullif(btrim(coalesce(target_category,'')),'') is null then
    raise exception 'Learning category is required.';
  end if;
  if target_confidence<0 or target_confidence>1 then
    raise exception 'Learning confidence must be between 0 and 1.';
  end if;

  requested_count := coalesce(array_length(target_source_messages,1),0);

  select count(*),coalesce(array_agg(m.source_trace_id) filter (where m.source_trace_id is not null),'{}'::text[])
  into matched_count,traces
  from public.think_tank_messages m
  where m.thread_id=target_thread
    and m.project_id=ctx.project_id
    and m.id=any(coalesce(target_source_messages,'{}'::uuid[]));

  if matched_count<>requested_count then
    raise exception 'Every source message must belong to this Think Tank thread.';
  end if;

  hash_text := encode(digest(normalized,'sha256'),'hex');

  insert into public.think_tank_learning_candidates(
    project_id,thread_id,trace_key,normalized_knowledge,category,confidence,
    content_hash,source_message_ids,source_trace_ids,proposed_by
  )
  values(
    ctx.project_id,target_thread,trace,normalized,btrim(target_category),target_confidence,
    hash_text,coalesce(target_source_messages,'{}'::uuid[]),coalesce(traces,'{}'::text[]),caller
  )
  returning id into new_id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    ctx.project_id,ctx.job_id,'THINK_TANK_LEARNING_PROPOSED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('candidate_id',new_id,'trace_key',trace,'category',btrim(target_category))
  );

  return new_id;
end;
$$;

create or replace function public.review_think_tank_learning_v1(target_candidate uuid,target_status text,target_notes text default null)returns jsonb language plpgsql security definer set search_path=public,private,auth as $$ declare caller uuid:=auth.uid();candidate public.think_tank_learning_candidates%rowtype;ctx record;existing_memory uuid;memory_id uuid;next_version bigint;new_contribution_id uuid;begin if caller is null then raise insufficient_privilege using message='Authentication is required.';end if;if target_status not in('approved','rejected')then raise exception'Learning review status must be approved or rejected.';end if;select*into candidate from public.think_tank_learning_candidates where id=target_candidate and status='proposed';if not found then raise exception'Pending learning candidate not found.';end if;if not private.has_project_role(candidate.project_id,array['owner','admin'])then raise insufficient_privilege using message='Owner or admin access is required.';end if;if candidate.proposed_by=caller then raise insufficient_privilege using message='A stakeholder cannot approve their own learning candidate.';end if;select*into ctx from private.get_think_tank_thread_context(candidate.thread_id);if target_status='approved' then select cm.id into existing_memory from public.certified_memory cm where cm.project_id=candidate.project_id and cm.content_hash=candidate.content_hash and cm.active=true order by cm.effective_version desc limit 1;if existing_memory is not null then memory_id:=existing_memory;else select coalesce(max(cm.effective_version),0)+1 into next_version from public.certified_memory cm where cm.project_id=candidate.project_id;insert into public.certified_memory(project_id,normalized_knowledge,category,effective_version,certification_id,source_job_ids,source_trace_ids,certification_class,confidence,policy_version,content_hash)values(candidate.project_id,candidate.normalized_knowledge,candidate.category,next_version,candidate.id,case when ctx.job_id is null then'{}'::uuid[] else array[ctx.job_id] end,candidate.source_trace_ids,'think_tank_human_reviewed',candidate.confidence,candidate.policy_version,candidate.content_hash)returning id into memory_id;end if;if candidate.contribution_id is null then insert into public.contribution_ledger(project_id,job_id,user_id,contribution_type,quantity,unit,points,verified,verification_source,source_ref,metadata,occurred_at,proposed_points,evidence_state,contribution_state,scoring_state,trace_key,lifecycle_state,certification_state,minting_state)values(candidate.project_id,ctx.job_id,candidate.proposed_by,'reusable_knowledge',1,'candidate',0,false,'think_tank_human_reviewed',candidate.id::text,jsonb_build_object('think_tank_candidate_id',candidate.id,'certified_memory_id',memory_id,'learning_trace_key',candidate.trace_key,'reviewed_by',caller,'recognition_state','submitted_for_independent_contribution_review'),candidate.created_at,0,'reported','reported','unscored','DN-CNTR-KNOW-'||replace(gen_random_uuid()::text,'-',''),'submitted','uncertified','not_eligible')returning id into new_contribution_id;else new_contribution_id:=candidate.contribution_id;end if;end if;update public.think_tank_learning_candidates set status=target_status,reviewed_by=caller,reviewed_at=now(),review_notes=nullif(btrim(coalesce(target_notes,'')),''),promoted_memory_id=case when target_status='approved' then memory_id else promoted_memory_id end,contribution_id=case when target_status='approved' then new_contribution_id else candidate.contribution_id end where id=candidate.id;insert into public.events(project_id,job_id,event_type,actor,payload)values(candidate.project_id,ctx.job_id,'THINK_TANK_LEARNING_REVIEWED',coalesce(auth.jwt()->>'email',caller::text),jsonb_build_object('candidate_id',candidate.id,'trace_key',candidate.trace_key,'review_status',target_status,'certified_memory_id',memory_id,'contribution_id',new_contribution_id,'automatic_model_training',false,'contribution_auto_accepted',false));return jsonb_build_object('candidate_id',candidate.id,'status',target_status,'certified_memory_id',memory_id,'contribution_id',new_contribution_id,'automatic_model_training',false,'contribution_auto_accepted',false);end;$$;alter table public.think_tank_channels enable row level security;alter table public.think_tank_threads enable row level security;alter table public.think_tank_ai_sessions enable row level security;alter table public.think_tank_messages enable row level security;alter table public.think_tank_decisions enable row level security;alter table public.think_tank_action_items enable row level security;alter table public.think_tank_learning_candidates enable row level security;drop policy if exists think_tank_channels_select on public.think_tank_channels;create policy think_tank_channels_select on public.think_tank_channels for select to authenticated using(private.has_project_access(project_id));drop policy if exists think_tank_threads_select on public.think_tank_threads;create policy think_tank_threads_select on public.think_tank_threads for select to authenticated using(private.has_project_access(project_id));drop policy if exists think_tank_ai_sessions_select on public.think_tank_ai_sessions;create policy think_tank_ai_sessions_select on public.think_tank_ai_sessions for select to authenticated using(user_id=(select auth.uid())and private.has_project_access(project_id));drop policy if exists think_tank_messages_select on public.think_tank_messages;create policy think_tank_messages_select on public.think_tank_messages for select to authenticated using(private.has_project_access(project_id));drop policy if exists think_tank_decisions_select on public.think_tank_decisions;create policy think_tank_decisions_select on public.think_tank_decisions for select to authenticated using(private.has_project_access(project_id));drop policy if exists think_tank_actions_select on public.think_tank_action_items;create policy think_tank_actions_select on public.think_tank_action_items for select to authenticated using(private.has_project_access(project_id));drop policy if exists think_tank_learning_select on public.think_tank_learning_candidates;create policy think_tank_learning_select on public.think_tank_learning_candidates for select to authenticated using(private.has_project_access(project_id));revoke all on public.think_tank_channels from anon,authenticated;revoke all on public.think_tank_threads from anon,authenticated;revoke all on public.think_tank_ai_sessions from anon,authenticated;revoke all on public.think_tank_messages from anon,authenticated;revoke all on public.think_tank_decisions from anon,authenticated;revoke all on public.think_tank_action_items from anon,authenticated;revoke all on public.think_tank_learning_candidates from anon,authenticated;grant select on public.think_tank_channels to authenticated;grant select on public.think_tank_threads to authenticated;grant select on public.think_tank_ai_sessions to authenticated;grant select on public.think_tank_messages to authenticated;grant select on public.think_tank_decisions to authenticated;grant select on public.think_tank_action_items to authenticated;grant select on public.think_tank_learning_candidates to authenticated;revoke all on function public.create_think_tank_channel_v1(uuid,text,text,text,uuid)from public,anon;revoke all on function public.create_think_tank_thread_v1(uuid,text)from public,anon;revoke all on function public.post_think_tank_message_v1(uuid,text,text,text)from public,anon;revoke all on function public.record_think_tank_ai_message_v1(uuid,text,text,uuid)from public,anon;revoke all on function public.upsert_think_tank_ai_session_v1(uuid,uuid)from public,anon;revoke all on function public.create_think_tank_decision_v1(uuid,text,text,uuid)from public,anon;revoke all on function public.review_think_tank_decision_v1(uuid,text)from public,anon;revoke all on function public.create_think_tank_action_v1(uuid,text,uuid)from public,anon;revoke all on function public.review_think_tank_action_v1(uuid,text,uuid,timestamptz)from public,anon;revoke all on function public.update_think_tank_action_status_v1(uuid,text)from public,anon;revoke all on function public.propose_think_tank_learning_v1(uuid,text,text,uuid[],numeric)from public,anon;revoke all on function public.review_think_tank_learning_v1(uuid,text,text)from public,anon;grant execute on function public.create_think_tank_channel_v1(uuid,text,text,text,uuid)to authenticated;grant execute on function public.create_think_tank_thread_v1(uuid,text)to authenticated;grant execute on function public.post_think_tank_message_v1(uuid,text,text,text)to authenticated;grant execute on function public.record_think_tank_ai_message_v1(uuid,text,text,uuid)to authenticated;grant execute on function public.upsert_think_tank_ai_session_v1(uuid,uuid)to authenticated;grant execute on function public.create_think_tank_decision_v1(uuid,text,text,uuid)to authenticated;grant execute on function public.review_think_tank_decision_v1(uuid,text)to authenticated;grant execute on function public.create_think_tank_action_v1(uuid,text,uuid)to authenticated;grant execute on function public.review_think_tank_action_v1(uuid,text,uuid,timestamptz)to authenticated;grant execute on function public.update_think_tank_action_status_v1(uuid,text)to authenticated;grant execute on function public.propose_think_tank_learning_v1(uuid,text,text,uuid[],numeric)to authenticated;grant execute on function public.review_think_tank_learning_v1(uuid,text,text)to authenticated;commit;