\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.certified_memory') is null then
    raise exception 'certified_memory table missing';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='certified_memory' and c.relrowsecurity
  ) then
    raise exception 'certified_memory RLS must be enabled';
  end if;
end $$;

do $$
declare
  active_triggers integer;
begin
  select count(*) into active_triggers
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal
    and t.tgname in (
      'track_development_contribution',
      'track_dispatched_prompt_contribution',
      'track_job_input_contribution',
      'track_product_test_contribution'
    );
  if active_triggers <> 0 then
    raise exception 'legacy contribution triggers remain active';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.begin_datanest_ai_request(uuid,uuid,text)') is null then
    raise exception 'begin_datanest_ai_request missing';
  end if;
  if to_regprocedure('public.get_certified_memory_context(uuid,uuid,integer)') is null then
    raise exception 'get_certified_memory_context missing';
  end if;
  if to_regprocedure('public.mark_external_ai_session_staged(uuid,uuid,text)') is null then
    raise exception 'mark_external_ai_session_staged missing';
  end if;
  if to_regprocedure('public.service_promote_certified_memory(uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid)') is null then
    raise exception 'service_promote_certified_memory missing';
  end if;
end $$;

do $$
declare
  finish_def text;
  reconcile_def text;
begin
  select pg_get_functiondef('public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text)'::regprocedure)
    into finish_def;
  select pg_get_functiondef('private.reconcile_unknown_ai_request(uuid,text,bigint,bigint,bigint,text)'::regprocedure)
    into reconcile_def;
  if finish_def ilike '%insert_contribution%' or reconcile_def ilike '%insert_contribution%' then
    raise exception 'AI usage paths still create contribution rows';
  end if;
end $$;

do $$
declare
  wrapper_count integer;
begin
  select count(*) into wrapper_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.oid in (
      'public.begin_datanest_ai_request(uuid,uuid,text)'::regprocedure,
      'public.get_certified_memory_context(uuid,uuid,integer)'::regprocedure,
      'public.mark_external_ai_session_staged(uuid,uuid,text)'::regprocedure,
      'public.service_promote_certified_memory(uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid)'::regprocedure
    );

  if wrapper_count <> 4 then
    raise exception 'DataNest AI public RPC wrappers must be SECURITY DEFINER gateways';
  end if;

  if has_function_privilege('authenticated','private.begin_datanest_ai_request(uuid,uuid,text)','execute')
     or has_function_privilege('authenticated','private.get_certified_memory_context(uuid,uuid,integer)','execute')
     or has_function_privilege('authenticated','private.mark_external_ai_session_staged(uuid,uuid,text)','execute')
     or has_function_privilege('authenticated','private.promote_certified_memory(uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,uuid)','execute') then
    raise exception 'authenticated must not execute private DataNest AI privileged functions directly';
  end if;
end $$;


do $$
begin
  if to_regprocedure('public.authorize_datanest_ai_file_access(uuid)') is null then
    raise exception 'authorize_datanest_ai_file_access missing';
  end if;
  if has_function_privilege('anon','public.authorize_datanest_ai_file_access(uuid)','execute') then
    raise exception 'anon must not execute file authorization gateway';
  end if;
  if not has_function_privilege('authenticated','public.authorize_datanest_ai_file_access(uuid)','execute') then
    raise exception 'authenticated must execute file authorization gateway';
  end if;
  if has_function_privilege('authenticated','private.authorize_datanest_ai_file_access(uuid)','execute') then
    raise exception 'authenticated must not execute private file authorization helper';
  end if;
end $$;
