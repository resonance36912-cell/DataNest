\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(required_name)
  into missing
  from unnest(array[
    'think_tank_channels',
    'think_tank_threads',
    'think_tank_ai_sessions',
    'think_tank_messages',
    'think_tank_decisions',
    'think_tank_action_items',
    'think_tank_learning_candidates'
  ]) required_name
  where to_regclass('public.' || required_name) is null;

  if missing is not null then
    raise exception 'missing Think Tank tables: %', missing;
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
    and c.relname in (
      'think_tank_channels','think_tank_threads','think_tank_ai_sessions',
      'think_tank_messages','think_tank_decisions','think_tank_action_items',
      'think_tank_learning_candidates'
    )
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS disabled on Think Tank tables: %', unprotected;
  end if;
end $$;

do $$
declare
  direct_write_count integer;
begin
  select count(*) into direct_write_count
  from (values
    ('think_tank_channels'),
    ('think_tank_threads'),
    ('think_tank_ai_sessions'),
    ('think_tank_messages'),
    ('think_tank_decisions'),
    ('think_tank_action_items'),
    ('think_tank_learning_candidates')
  ) t(name)
  where has_table_privilege('authenticated','public.'||t.name,'INSERT')
     or has_table_privilege('authenticated','public.'||t.name,'UPDATE')
     or has_table_privilege('authenticated','public.'||t.name,'DELETE');

  if direct_write_count<>0 then
    raise exception 'Authenticated Think Tank writes must go through governed RPCs.';
  end if;
end $$;

do $$
declare
  gateway_count integer;
begin
  select count(*) into gateway_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.oid in (
      'public.create_think_tank_channel_v1(uuid,text,text,text,uuid)'::regprocedure,
      'public.create_think_tank_thread_v1(uuid,text)'::regprocedure,
      'public.post_think_tank_message_v1(uuid,text,text,text)'::regprocedure,
      'public.record_think_tank_ai_message_v1(uuid,text,text,uuid)'::regprocedure,
      'public.upsert_think_tank_ai_session_v1(uuid,uuid)'::regprocedure,
      'public.create_think_tank_decision_v1(uuid,text,text,uuid)'::regprocedure,
      'public.review_think_tank_decision_v1(uuid,text)'::regprocedure,
      'public.create_think_tank_action_v1(uuid,text,uuid)'::regprocedure,
      'public.review_think_tank_action_v1(uuid,text,uuid,timestamptz)'::regprocedure,
      'public.update_think_tank_action_status_v1(uuid,text)'::regprocedure,
      'public.propose_think_tank_learning_v1(uuid,text,text,uuid[],numeric)'::regprocedure,
      'public.review_think_tank_learning_v1(uuid,text,text)'::regprocedure
    );

  if gateway_count<>12 then
    raise exception 'Think Tank governed RPC coverage incomplete: %/12', gateway_count;
  end if;
end $$;

do $$
declare
  ai_def text;
  decision_def text;
  learning_def text;
  contribution_constraint text;
begin
  select pg_get_functiondef(
    'public.record_think_tank_ai_message_v1(uuid,text,text,uuid)'::regprocedure
  ) into ai_def;

  if ai_def not ilike '%public.ai_usage_requests%'
     or ai_def not ilike '%user_id=caller%'
     or ai_def not ilike '%job_id=ctx.job_id%'
     or ai_def not ilike '%target_trace_id not like ''DN-AI-%%%' then
    raise exception 'Think Tank AI response recording must bind to caller, Job and DataNest trace.';
  end if;

  select pg_get_functiondef(
    'public.review_think_tank_decision_v1(uuid,text)'::regprocedure
  ) into decision_def;

  if decision_def not ilike '%cannot confirm their own decision proposal%' then
    raise exception 'Think Tank decision confirmation must prohibit self-confirmation.';
  end if;

  select pg_get_functiondef(
    'public.review_think_tank_learning_v1(uuid,text,text)'::regprocedure
  ) into learning_def;

  if learning_def not ilike '%cannot approve their own learning candidate%'
     or learning_def not ilike '%think_tank_human_reviewed%'
     or learning_def not ilike '%automatic_model_training'',false%'
     or learning_def not ilike '%contribution_auto_accepted'',false%'
     or learning_def not ilike '%''submitted''%'
     or learning_def not ilike '%''uncertified''%'
     or learning_def not ilike '%''not_eligible''%' then
    raise exception 'Think Tank learning review boundaries are incomplete.';
  end if;

  select pg_get_constraintdef(oid)
  into contribution_constraint
  from pg_constraint
  where conrelid='public.contribution_ledger'::regclass
    and conname='contribution_ledger_contribution_type_check';

  if contribution_constraint not ilike '%reusable_knowledge%' then
    raise exception 'Contribution ledger must recognize reusable_knowledge without auto-acceptance.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1
    from public.think_tank_channels c
    join public.projects p on p.id=c.project_id
    where p.slug='resonance-datanest'
      and c.channel_key='project-commons'
      and c.scope='project'
      and c.status='active'
  ) then
    raise exception 'Resonance DataNest Project Commons Think Tank channel is missing.';
  end if;

  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where name='datanest_think_tanks_v1'
  ) then
    raise exception 'Think Tank migration is not registered.';
  end if;

  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where name='harden_datanest_think_tanks_indexes'
  ) then
    raise exception 'Think Tank hardening migration is not registered.';
  end if;
end $$;
