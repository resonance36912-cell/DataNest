do $$
begin
  if to_regclass('public.ai_intake_events') is not null then
    execute $sql$
      create index if not exists ai_intake_events_external_companion_idx
        on public.ai_intake_events(external_ai_session_id)
        where source_type='ai_companion' and external_ai_session_id is not null
    $sql$;
    execute 'analyze public.ai_intake_events';
  end if;
end
$$;
