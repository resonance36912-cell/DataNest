\set ON_ERROR_STOP on

do $$
declare
  rel_rls boolean;
  index_def text;
begin
  select c.relrowsecurity
  into rel_rls
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='recovery'
    and c.relname='mutation_recovery_ledger';

  if rel_rls is distinct from true then
    raise exception 'Durable recovery ledger must exist in the recovery schema with RLS enabled.';
  end if;

  select indexdef
  into index_def
  from pg_indexes
  where schemaname='recovery'
    and tablename='mutation_recovery_ledger'
    and indexname='mutation_recovery_one_active_scope_uidx';

  if index_def is null
     or index_def not ilike '%unique%'
     or index_def not ilike '%project_id%'
     or index_def not ilike '%user_id%'
     or index_def not ilike '%scope%'
     or index_def not ilike '%where (resolved_at is null)%' then
    raise exception 'Durable recovery active-scope uniqueness contract is incomplete.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1 from pg_policies
    where schemaname='recovery'
      and tablename='mutation_recovery_ledger'
      and policyname='mutation_recovery_select_own'
      and cmd='SELECT'
      and roles @> array['authenticated']::name[]
  ) then raise exception 'Durable recovery SELECT RLS policy is missing.'; end if;

  if not exists(
    select 1 from pg_policies
    where schemaname='recovery'
      and tablename='mutation_recovery_ledger'
      and policyname='mutation_recovery_insert_own'
      and cmd='INSERT'
  ) then raise exception 'Durable recovery INSERT RLS policy is missing.'; end if;

  if not exists(
    select 1 from pg_policies
    where schemaname='recovery'
      and tablename='mutation_recovery_ledger'
      and policyname='mutation_recovery_update_own'
      and cmd='UPDATE'
  ) then raise exception 'Durable recovery UPDATE RLS policy is missing.'; end if;
end $$;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid,n.nspname,p.proname,p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'register_mutation_recovery_v1',
        'mark_mutation_recovery_verification_v1',
        'resolve_mutation_recovery_v1',
        'list_mutation_recoveries_v1',
        'get_mutation_recovery_diagnostics_v1'
      )
  loop
    if fn.prosecdef then
      raise exception 'Recovery RPC % must be SECURITY INVOKER.',fn.proname;
    end if;
    if not has_function_privilege('authenticated',fn.oid,'EXECUTE') then
      raise exception 'Authenticated role cannot execute recovery RPC %.',fn.proname;
    end if;
    if has_function_privilege('anon',fn.oid,'EXECUTE') then
      raise exception 'Anonymous role must not execute recovery RPC %.',fn.proname;
    end if;
  end loop;
end $$;

do $$
begin
  if has_table_privilege('authenticated','recovery.mutation_recovery_ledger','DELETE') then
    raise exception 'Authenticated clients must not directly delete durable recovery history.';
  end if;

  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260927202758'
      and name='add_durable_mutation_recovery_ledger'
  ) then
    raise exception 'Durable recovery ledger migration history is missing.';
  end if;

  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260927203127'
      and name='harden_durable_mutation_recovery_idempotency'
  ) then
    raise exception 'Durable recovery idempotency migration history is missing.';
  end if;

  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260927213827'
      and name='add_mutation_recovery_observability'
  ) then
    raise exception 'Durable recovery observability migration history is missing.';
  end if;

  if pg_get_functiondef('public.get_mutation_recovery_diagnostics_v1(uuid)'::regprocedure) ilike '%''payload''%' then
    raise exception 'Recovery diagnostics must not expose mutation payloads.';
  end if;
end $;
