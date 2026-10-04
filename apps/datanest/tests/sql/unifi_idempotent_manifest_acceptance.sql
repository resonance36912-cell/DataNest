\set ON_ERROR_STOP on

do $$
declare
  column_type text;
  index_def text;
  function_def text;
  compact_function_def text;
begin
  select data_type into column_type
  from information_schema.columns
  where table_schema='public'
    and table_name='jobs'
    and column_name='client_request_id';

  if column_type is distinct from 'uuid' then
    raise exception 'jobs.client_request_id uuid reconciliation key is missing.';
  end if;

  select indexdef into index_def
  from pg_indexes
  where schemaname='public'
    and tablename='jobs'
    and indexname='jobs_project_client_request_id_uidx';

  if index_def is null
     or index_def not ilike '%unique%'
     or index_def not ilike '%project_id%'
     or index_def not ilike '%client_request_id%'
     or index_def not ilike '%where (client_request_id is not null)%' then
    raise exception 'UNIFI client request id uniqueness contract is incomplete.';
  end if;

  select pg_get_functiondef(
    'public.create_job_manifest_v2(uuid,uuid,text,text,integer,text,boolean,boolean)'::regprocedure
  ) into function_def;
  compact_function_def := regexp_replace(function_def,'\\s+','','g');

  if compact_function_def not ilike '%client_request_id=target_request_key%'
     or function_def not ilike '%Client request key already exists for a different UNIFI Job Manifest payload%'
     or compact_function_def not ilike '%project_id,client_request_id,title%'
     or compact_function_def not ilike '%''client_request_id'',target_request_key%' then
    raise exception 'UNIFI idempotent manifest function does not preserve reconciliation invariants.';
  end if;
end $$;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.create_job_manifest_v2(uuid,uuid,text,text,integer,text,boolean,boolean)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users cannot execute create_job_manifest_v2.';
  end if;

  if has_function_privilege(
    'anon',
    'public.create_job_manifest_v2(uuid,uuid,text,text,integer,text,boolean,boolean)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous users must not execute create_job_manifest_v2.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1
    from supabase_migrations.schema_migrations
    where version='20260927180402'
      and name='add_unifi_idempotent_manifest_v2'
  ) then
    raise exception 'Authoritative UNIFI idempotency migration history is missing.';
  end if;
end $$;
