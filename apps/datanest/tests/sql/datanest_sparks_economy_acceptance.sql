\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(required_name)
  into missing
  from unnest(array[
    'spark_economy_policies',
    'spark_service_catalog',
    'spark_redemptions'
  ]) required_name
  where to_regclass('public.'||required_name) is null;

  if missing is not null then
    raise exception 'missing Sparks economy tables: %',missing;
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
    and c.relname in ('spark_economy_policies','spark_service_catalog','spark_redemptions')
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS disabled on Sparks economy tables: %',unprotected;
  end if;
end $$;

do $$
declare
  direct_write_count integer;
begin
  select count(*) into direct_write_count
  from (values
    ('spark_economy_policies'),
    ('spark_service_catalog'),
    ('spark_redemptions'),
    ('spark_accounts'),
    ('spark_ledger_entries')
  ) t(name)
  where has_table_privilege('authenticated','public.'||t.name,'INSERT')
     or has_table_privilege('authenticated','public.'||t.name,'UPDATE')
     or has_table_privilege('authenticated','public.'||t.name,'DELETE');

  if direct_write_count<>0 then
    raise exception 'Authenticated Sparks writes must use governed RPCs.';
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
      'public.publish_spark_service_v1(uuid,text,text,numeric,text,text)'::regprocedure,
      'public.set_spark_service_status_v1(uuid,text)'::regprocedure,
      'public.request_spark_redemption_v1(uuid,integer,uuid,text)'::regprocedure,
      'public.cancel_spark_redemption_v1(uuid,text)'::regprocedure,
      'public.fulfill_spark_redemption_v1(uuid,text)'::regprocedure,
      'public.get_sparks_workspace_v1(uuid)'::regprocedure
    );

  if gateway_count<>6 then
    raise exception 'Sparks governed RPC coverage incomplete: %/6',gateway_count;
  end if;
end $$;

do $$
declare
  policy_constraints text;
  request_def text;
  cancel_def text;
  fulfill_def text;
  workspace_def text;
  transfer_count integer;
begin
  select string_agg(pg_get_constraintdef(oid),' ')
  into policy_constraints
  from pg_constraint
  where conrelid='public.spark_economy_policies'::regclass;

  if policy_constraints not ilike '%cash_purchase_enabled = false%'
     or policy_constraints not ilike '%cash_redemption_enabled = false%'
     or policy_constraints not ilike '%p2p_transfer_enabled = false%'
     or policy_constraints not ilike '%external_transfer_enabled = false%'
     or policy_constraints not ilike '%secondary_market_enabled = false%'
     or policy_constraints not ilike '%contribution_history_changes_on_spend = false%'
     or policy_constraints not ilike '%platform_spend_enabled = false%' then
    raise exception 'Sparks internal-utility constraints are incomplete.';
  end if;

  select pg_get_functiondef(
    'public.request_spark_redemption_v1(uuid,integer,uuid,text)'::regprocedure
  ) into request_def;

  if request_def not ilike '%for update%'
     or request_def not ilike '%Insufficient spendable Project Sparks%'
     or request_def not ilike '%''hold'',-total%'
     or request_def not ilike '%''hold'',total%'
     or request_def ilike '%update public.contribution_ledger%' then
    raise exception 'Spark reservation invariants are incomplete.';
  end if;

  select pg_get_functiondef(
    'public.cancel_spark_redemption_v1(uuid,text)'::regprocedure
  ) into cancel_def;

  if cancel_def not ilike '%''release'',-redemption.total_sparks%'
     or cancel_def not ilike '%''release'',redemption.total_sparks%'
     or cancel_def ilike '%update public.contribution_ledger%' then
    raise exception 'Spark cancellation/release invariants are incomplete.';
  end if;

  select pg_get_functiondef(
    'public.fulfill_spark_redemption_v1(uuid,text)'::regprocedure
  ) into fulfill_def;

  if fulfill_def not ilike '%''service_spend'',-redemption.total_sparks%'
     or fulfill_def not ilike '%Owner, admin or operator access is required%'
     or fulfill_def ilike '%update public.contribution_ledger%' then
    raise exception 'Spark fulfillment invariants are incomplete.';
  end if;

  select pg_get_functiondef(
    'public.get_sparks_workspace_v1(uuid)'::regprocedure
  ) into workspace_def;

  if workspace_def not ilike '%''cash_purchase_enabled'',false%'
     or workspace_def not ilike '%''cash_redemption_enabled'',false%'
     or workspace_def not ilike '%''p2p_transfer_enabled'',false%'
     or workspace_def not ilike '%''spending_changes_contribution_history'',false%'
     or workspace_def not ilike '%''spending_changes_royalty_or_ownership'',false%' then
    raise exception 'Sparks workspace must expose closed economic boundaries.';
  end if;

  select count(*) into transfer_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname ilike '%spark%'
    and (
      p.proname ilike '%peer%'
      or p.proname ilike '%transfer%'
      or p.proname ilike '%cash%'
      or p.proname ilike '%withdraw%'
      or p.proname ilike '%purchase%'
    );

  if transfer_count<>0 then
    raise exception 'Cash, purchase or transfer-style public Spark RPCs are not allowed in v1.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1
    from public.spark_economy_policies p
    join public.projects project on project.id=p.project_id
    where project.slug='resonance-datanest'
      and p.policy_version='internal-utility-v1'
      and p.status='active'
      and p.internal_utility_only=true
      and p.project_spend_enabled=true
      and p.platform_spend_enabled=false
      and p.cash_purchase_enabled=false
      and p.cash_redemption_enabled=false
      and p.p2p_transfer_enabled=false
      and p.external_transfer_enabled=false
      and p.secondary_market_enabled=false
      and p.contribution_history_changes_on_spend=false
  ) then
    raise exception 'Resonance DataNest internal-utility-v1 Spark policy is missing or unsafe.';
  end if;

  if not exists(
    select 1
    from pg_trigger
    where tgrelid='public.spark_ledger_entries'::regclass
      and not tgisinternal
  ) then
    raise exception 'Spark ledger append-only trigger is missing.';
  end if;

  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where name='datanest_sparks_economy_v1'
  ) then
    raise exception 'Sparks economy migration is not registered.';
  end if;
end $$;
