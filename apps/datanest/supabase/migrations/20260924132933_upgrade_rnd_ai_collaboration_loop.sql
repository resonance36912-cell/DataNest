
create or replace function private.post_job_ai_message(target_job uuid, message_content text)
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
    jsonb_build_object('source','R&D AI Collaboration','phase','user_turn')
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

  update public.job_collaborators
  set last_input_at=now(), updated_at=now()
  where job_id=j.id and user_id=caller and status='accepted';

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    j.project_id,j.id,'AI_COLLABORATION_USER_TURN',actor,
    jsonb_build_object('user_message_id',user_message.id)
  );

  return jsonb_build_object(
    'user_message_id',user_message.id,
    'job_id',j.id,
    'job_number',j.job_number
  );
end;
$$;

create or replace function private.get_job_ai_context(target_job uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  j public.jobs%rowtype;
  latest_update jsonb;
  recent_inputs jsonb;
  recent_messages jsonb;
  active_suggestions jsonb;
  steps jsonb;
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

  select to_jsonb(x) into latest_update
  from (
    select stage,status,progress,summary,created_at
    from public.ai_development_updates
    where job_id=j.id
    order by created_at desc
    limit 1
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into recent_inputs
  from (
    select actor_label,input_type,content,status,created_at
    from public.job_inputs
    where job_id=j.id
    order by created_at desc
    limit 12
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at asc),'[]'::jsonb)
  into recent_messages
  from (
    select author_type,author_label,content,status,metadata,created_at
    from public.ai_messages
    where job_id=j.id
    order by created_at desc
    limit 16
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority desc,x.created_at asc),'[]'::jsonb)
  into active_suggestions
  from (
    select id,prompt,suggestion_type,priority,status,created_at
    from public.ai_prompt_queue
    where job_id=j.id and status in ('queued','selected')
    order by priority desc,created_at asc
    limit 10
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.position),'[]'::jsonb)
  into steps
  from (
    select step_key,title,step_type,capability,status,position
    from public.job_steps
    where job_id=j.id
    order by position
    limit 20
  ) x;

  return jsonb_build_object(
    'job',jsonb_build_object(
      'id',j.id,
      'job_number',j.job_number,
      'title',j.title,
      'description',j.description,
      'priority',j.priority,
      'status',j.status,
      'required_capabilities',j.required_capabilities,
      'requirements',j.requirements,
      'acceptance',j.acceptance,
      'deadline',j.deadline
    ),
    'latest_development',coalesce(latest_update,'null'::jsonb),
    'recent_inputs',recent_inputs,
    'recent_messages',recent_messages,
    'active_suggestions',active_suggestions,
    'steps',steps
  );
end;
$$;

create or replace function public.get_job_ai_context(target_job uuid)
returns jsonb
language sql
set search_path = public, private
as $$
  select private.get_job_ai_context(target_job);
$$;

create or replace function private.record_ai_assistant_response(
  target_job uuid,
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
  j public.jobs%rowtype;
  ai_message public.ai_messages%rowtype;
  item jsonb;
  prompt_text text;
  prompt_type text;
  prompt_priority integer;
  suggestion_count integer := 0;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if provider_mode not in ('embedded','external') then
    raise exception 'Invalid AI provider mode.';
  end if;

  if nullif(btrim(assistant_content),'') is null then
    raise exception 'Assistant response is required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(j.project_id)
    or private.is_job_collaborator(j.id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  insert into public.ai_messages(
    project_id,job_id,user_id,author_type,author_label,content,status,metadata
  )
  values(
    j.project_id,j.id,null,'ai','UNIFI Copilot',btrim(assistant_content),'posted',
    jsonb_build_object(
      'mode','server-side',
      'provider_mode',provider_mode,
      'source','rnd-ai-chat'
    )
  )
  returning * into ai_message;

  if jsonb_typeof(generated_suggestions)='array' then
    for item in select value from jsonb_array_elements(generated_suggestions)
    loop
      prompt_text := nullif(btrim(coalesce(item->>'prompt','')),'');
      if prompt_text is null then continue; end if;
      prompt_type := coalesce(nullif(btrim(item->>'type'),''),'ai_next_action');
      prompt_priority := least(100,greatest(0,coalesce((item->>'priority')::integer,70)));

      insert into public.ai_prompt_queue(
        project_id,job_id,prompt,suggestion_type,priority,status,created_by_type,created_by_user,result
      )
      values(
        j.project_id,j.id,prompt_text,prompt_type,prompt_priority,'queued','ai',null,
        jsonb_build_object('assistant_message_id',ai_message.id,'provider_mode',provider_mode)
      )
      on conflict (job_id,prompt) do update
      set priority=greatest(public.ai_prompt_queue.priority,excluded.priority),
          result=public.ai_prompt_queue.result || excluded.result,
          updated_at=now();

      suggestion_count := suggestion_count + 1;
    end loop;
  end if;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    j.project_id,j.id,'AI_COLLABORATION_ASSISTANT_TURN','UNIFI Copilot',
    jsonb_build_object(
      'ai_message_id',ai_message.id,
      'provider_mode',provider_mode,
      'suggestions_added',suggestion_count
    )
  );

  return jsonb_build_object(
    'ai_message_id',ai_message.id,
    'assistant_message',ai_message.content,
    'provider_mode',provider_mode,
    'suggestions_added',suggestion_count
  );
end;
$$;

create or replace function public.record_ai_assistant_response(
  target_job uuid,
  assistant_content text,
  provider_mode text,
  generated_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language sql
set search_path = public, private
as $$
  select private.record_ai_assistant_response(
    target_job,assistant_content,provider_mode,generated_suggestions
  );
$$;

create or replace function private.update_job_input_status(target_input uuid,target_status text)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  input_row public.job_inputs%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_status not in ('open','acknowledged','incorporated','rejected') then
    raise exception 'Invalid input tracking status.';
  end if;

  select * into input_row from public.job_inputs where id=target_input;
  if not found then raise exception 'Input not found.'; end if;

  if not private.has_project_role(input_row.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required to update input tracking.';
  end if;

  update public.job_inputs
  set status=target_status,
      updated_at=now(),
      metadata=metadata || jsonb_build_object(
        'status_updated_by',caller,
        'status_updated_at',now()
      )
  where id=target_input;

  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    input_row.project_id,input_row.job_id,'RND_INPUT_STATUS_CHANGED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object('input_id',target_input,'status',target_status)
  );

  return target_input;
end;
$$;

create or replace function public.update_job_input_status(target_input uuid,target_status text)
returns uuid
language sql
set search_path = public, private
as $$
  select private.update_job_input_status(target_input,target_status);
$$;

grant execute on function public.get_job_ai_context(uuid) to authenticated;
grant execute on function public.record_ai_assistant_response(uuid,text,text,jsonb) to authenticated;
grant execute on function public.update_job_input_status(uuid,text) to authenticated;

create index if not exists ai_messages_job_created_idx
  on public.ai_messages(job_id,created_at);
create index if not exists ai_prompt_queue_job_status_priority_idx
  on public.ai_prompt_queue(job_id,status,priority desc,created_at);
create index if not exists job_inputs_job_created_idx
  on public.job_inputs(job_id,created_at desc);
create index if not exists ai_development_updates_job_created_idx
  on public.ai_development_updates(job_id,created_at desc);
