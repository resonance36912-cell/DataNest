
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
  raw_prompt_type text;
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
    jsonb_build_object('mode','server-side','provider_mode',provider_mode,'source','rnd-ai-chat')
  )
  returning * into ai_message;

  if jsonb_typeof(generated_suggestions)='array' then
    for item in select value from jsonb_array_elements(generated_suggestions)
    loop
      prompt_text := nullif(btrim(coalesce(item->>'prompt','')),'');
      if prompt_text is null then continue; end if;

      raw_prompt_type := lower(coalesce(nullif(btrim(item->>'type'),''),'next_action'));
      prompt_type := case
        when raw_prompt_type in ('analysis','implementation','test','risk','review','next_action','collaboration')
          then raw_prompt_type
        when raw_prompt_type in ('validation','verification','checkpoint')
          then 'test'
        when raw_prompt_type in ('implementation_plan','decomposition')
          then 'implementation'
        when raw_prompt_type in ('blocker_resolution','human_input')
          then 'risk'
        when raw_prompt_type in ('execution_review')
          then 'review'
        else 'next_action'
      end;
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
