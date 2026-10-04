\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(required_name)
  into missing
  from unnest(array[
    'contribution_reputation_models',
    'contribution_anomaly_signals',
    'stakeholder_progression_recommendations',
    'n0nymous_squad_memberships'
  ]) required_name
  where to_regclass('public.' || required_name) is null;

  if missing is not null then
    raise exception 'missing Contribution Intelligence tables: %', missing;
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
      'contribution_reputation_models',
      'contribution_anomaly_signals',
      'stakeholder_progression_recommendations',
      'n0nymous_squad_memberships'
    )
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS disabled on Contribution Intelligence tables: %', unprotected;
  end if;
end $$;

do $$
declare
  model record;
begin
  select
    m.impact_weight,
    m.quality_weight,
    m.collaboration_weight,
    m.governance_weight,
    m.knowledge_weight,
    m.config
  into model
  from public.contribution_reputation_models m
  join public.projects p on p.id=m.project_id
  where p.slug='resonance-datanest'
    and m.status='active'
    and m.model_version='contribution-intelligence-v1'
  limit 1;

  if not found then
    raise exception 'active contribution-intelligence-v1 model missing';
  end if;

  if model.impact_weight<>0.50
     or model.quality_weight<>0.20
     or model.collaboration_weight<>0.15
     or model.governance_weight<>0.10
     or model.knowledge_weight<>0.05 then
    raise exception 'Contribution Intelligence reputation weights do not match governed policy';
  end if;

  if coalesce((model.config->>'rank_investment')::boolean,true)
     or coalesce((model.config->>'rank_sparks_balance')::boolean,true)
     or coalesce((model.config->>'open_anomaly_is_penalty')::boolean,true)
     or not coalesce((model.config->>'progression_requires_human_approval')::boolean,false)
     or coalesce((model.config->>'squad_grants_admin')::boolean,true) then
    raise exception 'Contribution Intelligence governance boundaries are not enforced';
  end if;
end $$;

do $$
declare
  wrapper_count integer;
  progression_def text;
begin
  select count(*) into wrapper_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.oid in (
      'public.refresh_contribution_intelligence_v1(uuid)'::regprocedure,
      'public.review_contribution_anomaly_v1(uuid,text,text)'::regprocedure,
      'public.review_stakeholder_progression_v1(uuid,text,text)'::regprocedure,
      'public.get_contribution_intelligence_workspace(uuid)'::regprocedure
    );

  if wrapper_count<>4 then
    raise exception 'Contribution Intelligence public RPCs must be SECURITY DEFINER gateways: %/4', wrapper_count;
  end if;

  select pg_get_functiondef(
    'public.review_stakeholder_progression_v1(uuid,text,text)'::regprocedure
  ) into progression_def;

  if progression_def ilike '%update public.project_members%'
     or progression_def ilike '%insert into public.project_members%' then
    raise exception 'progression review must not grant project roles';
  end if;
end $$;

do $$
begin
  if has_table_privilege('authenticated','public.n0nymous_squad_memberships','SELECT') then
    raise exception 'raw N0nymous Squad membership table must not be directly readable by authenticated users';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_contribution_intelligence_workspace(uuid)',
    'execute'
  ) then
    raise exception 'authenticated users must receive anonymized Contribution Intelligence through the workspace RPC';
  end if;
end $$;

do $$
declare
  preference_columns integer;
  snapshot_columns integer;
begin
  select count(*) into preference_columns
  from information_schema.columns
  where table_schema='public'
    and table_name='datanest_user_preferences'
    and column_name in ('ranking_opt_in','squad_opt_in');

  if preference_columns<>2 then
    raise exception 'Contribution Intelligence user preference columns are incomplete';
  end if;

  select count(*) into snapshot_columns
  from information_schema.columns
  where table_schema='public'
    and table_name='reputation_snapshots'
    and column_name in (
      'batch_id','trust_score','anomaly_score','eligible_for_ranking',
      'exclusion_reasons','certified_contributions','approved_reviews'
    );

  if snapshot_columns<>7 then
    raise exception 'reputation snapshot intelligence columns are incomplete';
  end if;
end $$;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Supabase migration history is missing';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='datanest_contribution_intelligence_v1'
  ) then
    raise exception 'Contribution Intelligence migration is not registered';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='fix_contribution_intelligence_refresh'
  ) then
    raise exception 'Contribution Intelligence refresh fix migration is not registered';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='harden_contribution_intelligence_indexes'
  ) then
    raise exception 'Contribution Intelligence hardening migration is not registered';
  end if;
end $$;


do $$
declare
  workspace_def text;
begin
  select pg_get_functiondef(
    'public.get_contribution_workspace(uuid)'::regprocedure
  ) into workspace_def;

  if workspace_def ilike '%select model_version into model_version%' then
    raise exception 'Stakeholder workspace retains ambiguous model_version reference';
  end if;

  if workspace_def not ilike '%csm.model_version%active_scoring_model_version%' then
    raise exception 'Stakeholder workspace must use a qualified scoring-model column and distinct local variable';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where name='fix_contribution_workspace_model_version_ambiguity'
  ) then
    raise exception 'Stakeholder workspace ambiguity hotfix migration is not registered';
  end if;
end $$;
