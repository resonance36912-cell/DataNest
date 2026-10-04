\set ON_ERROR_STOP on

do $$
declare
  qcount integer;
begin
  if to_regclass('public.ai_file_submissions') is null
     or to_regclass('public.ai_file_submission_items') is null then
    raise exception 'file ingestion tables missing';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='ai_file_submissions' and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='ai_file_submission_items' and c.relrowsecurity
  ) then
    raise exception 'file ingestion RLS must be enabled';
  end if;

  if has_table_privilege('authenticated','public.ai_file_submissions','SELECT')
     or has_table_privilege('authenticated','public.ai_file_submission_items','INSERT')
     or has_table_privilege('anon','public.ai_file_submissions','SELECT') then
    raise exception 'browser roles must not have direct file-table privileges';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id='datanest-ai-staging-files'
      and public=false
      and file_size_limit=26214400
      and allowed_mime_types @> array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain','text/csv','application/csv','application/json','text/json'
      ]::text[]
  ) then
    raise exception 'private governed file bucket configuration mismatch';
  end if;

  select count(*) into qcount
  from pgmq.list_queues()
  where queue_name in ('datanest_file_ingestion','datanest_file_analysis');
  if qcount <> 2 then
    raise exception 'expected two durable DataNest file queues, got %',qcount;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='ai_file_submissions'
      and column_name='certified_memory_snapshot'
      and data_type='jsonb'
  ) then
    raise exception 'frozen certified memory snapshot column missing';
  end if;


  if (
    select count(*)
    from information_schema.columns
    where table_schema='public'
      and table_name='ai_file_submissions'
      and column_name in (
        'learning_policy_outcome',
        'learning_policy_reason_code',
        'learning_reuse_state',
        'learning_policy_version',
        'learning_decision_record_id'
      )
  ) <> 5 then
    raise exception 'frozen file-learning policy snapshot columns missing';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class rel on rel.oid=c.conrelid
    join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname='public' and rel.relname='ai_intake_events'
      and c.conname='ai_intake_events_source_type_check'
      and pg_get_constraintdef(c.oid) ilike '%file_upload%'
      and pg_get_constraintdef(c.oid) ilike '%document_evidence%'
  ) then
    raise exception 'file evidence source types are missing';
  end if;
end $$;
