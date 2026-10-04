\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(required_name)
  into missing
  from unnest(array[
    'ai_sessions',
    'ai_intake_events',
    'ai_reasoning_envelopes',
    'ai_trend_clusters',
    'ai_trend_evidence',
    'ai_learning_candidates',
    'ai_candidate_evidence',
    'ai_validation_runs',
    'ai_language_reviewer_qualifications',
    'ai_evidence_derivations',
    'ai_evidence_derivation_reviews',
    'ai_certification_decisions',
    'ai_memory_supersessions'
  ]) required_name
  where to_regclass('public.' || required_name) is null;

  if missing is not null then
    raise exception 'missing DataNest AI staging tables: %', missing;
  end if;
end $$;

do $$
declare
  unprotected text[];
begin
  select array_agg(c.relname)
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname like 'ai_%'
    and c.relname in (
      'ai_sessions','ai_intake_events','ai_reasoning_envelopes',
      'ai_trend_clusters','ai_trend_evidence','ai_learning_candidates',
      'ai_candidate_evidence','ai_validation_runs','ai_language_reviewer_qualifications',
      'ai_evidence_derivations','ai_evidence_derivation_reviews',
      'ai_certification_decisions','ai_memory_supersessions'
    )
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS disabled on staging tables: %', unprotected;
  end if;
end $$;

do $datanest$
begin
  if has_table_privilege('authenticated','public.ai_intake_events','INSERT')
     or has_table_privilege('anon','public.ai_intake_events','SELECT') then
    raise exception 'browser roles must not have direct staging-table privileges';
  end if;
end $datanest$;


do $datanest$
begin
  if has_table_privilege('authenticated','public.ai_language_reviewer_qualifications','SELECT')
     or has_table_privilege('anon','public.ai_language_reviewer_qualifications','SELECT') then
    raise exception 'browser roles must not read language reviewer qualifications directly';
  end if;

  if not has_table_privilege('service_role','public.ai_language_reviewer_qualifications','SELECT')
     or not has_table_privilege('service_role','public.ai_language_reviewer_qualifications','INSERT')
     or not has_table_privilege('service_role','public.ai_language_reviewer_qualifications','UPDATE') then
    raise exception 'service_role must manage language reviewer qualifications';
  end if;
end $datanest$;


do $datanest$
begin
  if has_table_privilege('authenticated','public.ai_evidence_derivations','SELECT')
     or has_table_privilege('anon','public.ai_evidence_derivation_reviews','SELECT') then
    raise exception 'browser roles must not read derivation lineage or review evidence directly';
  end if;

  if not has_table_privilege('service_role','public.ai_evidence_derivations','SELECT')
     or not has_table_privilege('service_role','public.ai_evidence_derivations','INSERT')
     or has_table_privilege('service_role','public.ai_evidence_derivations','UPDATE')
     or has_table_privilege('service_role','public.ai_evidence_derivations','DELETE') then
    raise exception 'derivation lineage must be service-only and immutable after insert';
  end if;

  if not has_table_privilege('service_role','public.ai_evidence_derivation_reviews','SELECT')
     or not has_table_privilege('service_role','public.ai_evidence_derivation_reviews','INSERT')
     or has_table_privilege('service_role','public.ai_evidence_derivation_reviews','UPDATE')
     or has_table_privilege('service_role','public.ai_evidence_derivation_reviews','DELETE') then
    raise exception 'derivation reviews must be append-only service evidence';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='ai_certification_decisions'
      and column_name='evidence_context'
      and data_type='jsonb'
  ) then
    raise exception 'certification decisions must preserve evidence_context';
  end if;
end $datanest$;


do $datanest$
begin
  if not has_table_privilege('service_role','public.ai_intake_events','INSERT') then
    raise exception 'service_role must retain append-only INSERT access to ai_intake_events';
  end if;

  if has_table_privilege('service_role','public.ai_intake_events','UPDATE')
     or has_table_privilege('service_role','public.ai_intake_events','DELETE')
     or has_table_privilege('service_role','public.ai_intake_events','TRUNCATE') then
    raise exception 'service_role must not mutate or truncate ai_intake_events';
  end if;
end $datanest$;


begin;

create temporary table pg_temp.datanest_intake_append_only_fixture (
  project_id uuid not null,
  job_id uuid not null,
  user_id uuid not null,
  session_id uuid not null
) on commit drop;

create temporary table pg_temp.datanest_intake_append_only_inserted (
  id uuid not null
) on commit drop;

insert into pg_temp.datanest_intake_append_only_fixture(
  project_id,job_id,user_id,session_id
)
values(
  gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
);

insert into public.ai_sessions(
  id,project_id,job_id,user_id,client_session_id
)
select
  session_id,project_id,job_id,user_id,gen_random_uuid()
from pg_temp.datanest_intake_append_only_fixture;

create function pg_temp.assert_datanest_intake_mutations_denied(target_event uuid)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $datanest$
begin
  begin
    update public.ai_intake_events
       set metadata=metadata
     where id=target_event;
    raise exception 'service_role UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.ai_intake_events
     where id=target_event;
    raise exception 'service_role DELETE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    execute 'truncate table public.ai_intake_events';
    raise exception 'service_role TRUNCATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$datanest$;

grant select on pg_temp.datanest_intake_append_only_fixture to service_role;
grant insert,select on pg_temp.datanest_intake_append_only_inserted to service_role;
grant execute on function pg_temp.assert_datanest_intake_mutations_denied(uuid) to service_role;

set local role service_role;

with inserted_event as (
  insert into public.ai_intake_events(
    trace_id,
    project_id,
    job_id,
    session_id,
    source_type,
    source_user_id,
    content,
    content_hash,
    metadata
  )
  select
    'DN-APPEND-ONLY-'||gen_random_uuid()::text,
    project_id,
    job_id,
    session_id,
    'human',
    user_id,
    'append-only acceptance fixture',
    repeat('a',64),
    '{"test_fixture":true}'::jsonb
  from pg_temp.datanest_intake_append_only_fixture
  returning id
)
insert into pg_temp.datanest_intake_append_only_inserted(id)
select id from inserted_event;

select pg_temp.assert_datanest_intake_mutations_denied(id)
from pg_temp.datanest_intake_append_only_inserted;

reset role;

rollback;


do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Supabase migration history is missing';
  end if;

  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where name='register_datanest_ai_staging_baseline'
  ) then
    raise exception 'governed staging baseline migration is not registered';
  end if;
end $$;


do $$
declare
  secured_count integer;
begin
  select count(*) into secured_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.oid in (
      'public.accept_pending_job_invites()'::regprocedure,
      'public.get_project_dashboard_summary(uuid)'::regprocedure,
      'public.start_external_ai_sidebar_session(uuid,text,text)'::regprocedure
    );

  if secured_count <> 3 then
    raise exception 'authenticated public/private gateway hardening is incomplete: %/3 secured', secured_count;
  end if;

  if has_schema_privilege('authenticated','private','USAGE') then
    raise exception 'authenticated must not receive broad USAGE on the private schema';
  end if;
end $$;
