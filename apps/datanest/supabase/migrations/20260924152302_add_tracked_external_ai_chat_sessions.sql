
alter table public.job_inputs
  drop constraint if exists job_inputs_input_type_check;

alter table public.job_inputs
  add constraint job_inputs_input_type_check
  check (input_type in ('comment','requirement','decision','feedback','answer','chat','external_ai'));

create table if not exists public.external_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('chatgpt','gemini','claude','grok','perplexity')),
  provider_url text not null,
  status text not null default 'launched' check (status in ('launched','imported','closed')),
  context_snapshot jsonb not null default '{}'::jsonb,
  imported_input_id uuid references public.job_inputs(id) on delete set null,
  launched_at timestamptz not null default now(),
  imported_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_ai_sessions_job_user_idx
  on public.external_ai_sessions(job_id,user_id,launched_at desc);
create index if not exists external_ai_sessions_project_idx
  on public.external_ai_sessions(project_id,launched_at desc);
create index if not exists external_ai_sessions_imported_input_idx
  on public.external_ai_sessions(imported_input_id);

alter table public.external_ai_sessions enable row level security;

drop policy if exists external_ai_sessions_select on public.external_ai_sessions;
create policy external_ai_sessions_select on public.external_ai_sessions
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin','operator'])
);

grant select on public.external_ai_sessions to authenticated;

create or replace function private.external_ai_provider_url(target_provider text)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case lower(target_provider)
    when 'chatgpt' then 'https://chatgpt.com/'
    when 'gemini' then 'https://gemini.google.com/app'
    when 'claude' then 'https://claude.ai/new'
    when 'grok' then 'https://grok.com/'
    when 'perplexity' then 'https://www.perplexity.ai/'
    else null
  end;
$$;

create or replace function private.start_external_ai_session(
  target_job uuid,
  target_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  j public.jobs%rowtype;
  provider_key text := lower(btrim(target_provider));
  provider_url text;
  latest_update jsonb;
  prompt_items jsonb;
  context_payload jsonb;
  new_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(j.project_id)
    or private.is_job_collaborator(j.id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  provider_url := private.external_ai_provider_url(provider_key);
  if provider_url is null then raise exception 'Unsupported external AI provider.'; end if;

  select jsonb_build_object(
    'stage',d.stage,
    'status',d.status,
    'progress',d.progress,
    'summary',d.summary,
    'created_at',d.created_at
  )
  into latest_update
  from public.ai_development_updates d
  where d.job_id=j.id
  order by d.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'prompt',x.prompt,
    'type',x.suggestion_type,
    'priority',x.priority,
    'status',x.status
  ) order by x.priority desc),'[]'::jsonb)
  into prompt_items
  from (
    select prompt,suggestion_type,priority,status
    from public.ai_prompt_queue
    where job_id=j.id
      and status not in ('completed','dismissed')
    order by priority desc,created_at
    limit 5
  ) x;

  context_payload := jsonb_build_object(
    'job_id',j.id,
    'job_number',j.job_number,
    'title',j.title,
    'description',j.description,
    'priority',j.priority,
    'status',j.status,
    'required_capabilities',j.required_capabilities,
    'acceptance',j.acceptance,
    'latest_development',coalesce(latest_update,'null'::jsonb),
    'suggestion_prompts',coalesce(prompt_items,'[]'::jsonb),
    'source','Resonance DataNest External AI Handoff',
    'generated_at',now()
  );

  insert into public.external_ai_sessions(
    project_id,job_id,user_id,provider,provider_url,status,context_snapshot
  )
  values(
    j.project_id,j.id,caller,provider_key,provider_url,'launched',context_payload
  )
  returning id into new_id;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    j.project_id,j.id,'EXTERNAL_AI_CHAT_LAUNCHED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'external_ai_session_id',new_id,
      'provider',provider_key,
      'provider_url',provider_url,
      'contribution_awarded',false
    )
  );

  return jsonb_build_object(
    'session_id',new_id,
    'provider',provider_key,
    'provider_url',provider_url,
    'context',context_payload
  );
end;
$$;

create or replace function public.start_external_ai_session(
  target_job uuid,
  target_provider text
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.start_external_ai_session(target_job,target_provider);
$$;

revoke all on function public.start_external_ai_session(uuid,text) from public,anon;
grant execute on function public.start_external_ai_session(uuid,text) to authenticated;

create or replace function private.import_external_ai_response(
  target_session uuid,
  response_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  s public.external_ai_sessions%rowtype;
  inserted public.job_inputs%rowtype;
  actor text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if nullif(btrim(response_content),'') is null then
    raise exception 'External AI response is required.';
  end if;

  select * into s
  from public.external_ai_sessions
  where id=target_session
  for update;

  if not found then raise exception 'External AI session not found.'; end if;
  if s.user_id <> caller then
    raise insufficient_privilege using message='External AI session ownership is required.';
  end if;
  if s.status='closed' then raise exception 'External AI session is closed.'; end if;
  if s.imported_input_id is not null then
    return jsonb_build_object(
      'session_id',s.id,
      'input_id',s.imported_input_id,
      'idempotent',true
    );
  end if;

  if not (
    private.is_project_member(s.project_id)
    or private.is_job_collaborator(s.job_id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  actor := coalesce(auth.jwt()->>'email',caller::text);

  insert into public.job_inputs(
    project_id,job_id,user_id,actor_label,input_type,content,status,metadata
  )
  values(
    s.project_id,s.job_id,caller,actor,'external_ai',btrim(response_content),'open',
    jsonb_build_object(
      'source','External AI Chat',
      'external_ai_session_id',s.id,
      'provider',s.provider,
      'provider_url',s.provider_url,
      'imported_at',now(),
      'contribution_state','reported'
    )
  )
  returning * into inserted;

  update public.external_ai_sessions
  set status='imported',
      imported_input_id=inserted.id,
      imported_at=now(),
      updated_at=now()
  where id=s.id;

  update public.job_collaborators
  set last_input_at=now(),updated_at=now()
  where job_id=s.job_id and user_id=caller and status='accepted';

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    s.project_id,s.job_id,'EXTERNAL_AI_RESPONSE_IMPORTED',actor,
    jsonb_build_object(
      'external_ai_session_id',s.id,
      'provider',s.provider,
      'input_id',inserted.id,
      'contribution_state','reported'
    )
  );

  return jsonb_build_object(
    'session_id',s.id,
    'input_id',inserted.id,
    'provider',s.provider,
    'idempotent',false
  );
end;
$$;

create or replace function public.import_external_ai_response(
  target_session uuid,
  response_content text
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.import_external_ai_response(target_session,response_content);
$$;

revoke all on function public.import_external_ai_response(uuid,text) from public,anon;
grant execute on function public.import_external_ai_response(uuid,text) to authenticated;
