\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(required_name)
  into missing
  from unnest(array[
    'governance_protocol_versions',
    'governance_proposals',
    'governance_vote_events',
    'governance_decisions',
    'governance_disputes',
    'governance_dispute_resolutions'
  ]) required_name
  where to_regclass('public.'||required_name) is null;

  if missing is not null then
    raise exception 'missing governance tables: %',missing;
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
      'governance_protocol_versions','governance_proposals','governance_vote_events',
      'governance_decisions','governance_disputes','governance_dispute_resolutions'
    )
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS disabled on governance tables: %',unprotected;
  end if;
end $$;

do $$
declare
  direct_write_count integer;
begin
  select count(*) into direct_write_count
  from (values
    ('governance_protocol_versions'),
    ('governance_proposals'),
    ('governance_vote_events'),
    ('governance_decisions'),
    ('governance_disputes'),
    ('governance_dispute_resolutions')
  ) t(name)
  where has_table_privilege('authenticated','public.'||t.name,'INSERT')
     or has_table_privilege('authenticated','public.'||t.name,'UPDATE')
     or has_table_privilege('authenticated','public.'||t.name,'DELETE');

  if direct_write_count<>0 then
    raise exception 'Authenticated governance writes must use governed RPCs.';
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
      'public.create_governance_protocol_draft_v1(uuid,text,text,text,text,jsonb)'::regprocedure,
      'public.create_governance_proposal_v1(uuid,text,text,text,text,uuid,timestamptz)'::regprocedure,
      'public.cast_governance_vote_v1(uuid,text,text)'::regprocedure,
      'public.withdraw_governance_proposal_v1(uuid,text)'::regprocedure,
      'public.close_governance_proposal_v1(uuid,text)'::regprocedure,
      'public.ratify_governance_protocol_v1(uuid,uuid)'::regprocedure,
      'public.file_governance_dispute_v1(uuid,text,uuid,text,text,text)'::regprocedure,
      'public.resolve_governance_dispute_v1(uuid,text,text,uuid)'::regprocedure,
      'public.get_governance_workspace_v1(uuid)'::regprocedure
    );

  if gateway_count<>9 then
    raise exception 'Governance RPC coverage incomplete: %/9',gateway_count;
  end if;
end $$;

do $$
declare
  protocol_constraints text;
  proposal_constraints text;
  decision_constraints text;
  resolution_constraints text;
  vote_constraints text;
begin
  select string_agg(pg_get_constraintdef(oid),' ')
  into protocol_constraints
  from pg_constraint
  where conrelid='public.governance_protocol_versions'::regclass;

  select string_agg(pg_get_constraintdef(oid),' ')
  into proposal_constraints
  from pg_constraint
  where conrelid='public.governance_proposals'::regclass;

  select string_agg(pg_get_constraintdef(oid),' ')
  into decision_constraints
  from pg_constraint
  where conrelid='public.governance_decisions'::regclass;

  select string_agg(pg_get_constraintdef(oid),' ')
  into resolution_constraints
  from pg_constraint
  where conrelid='public.governance_dispute_resolutions'::regclass;

  select string_agg(pg_get_constraintdef(oid),' ')
  into vote_constraints
  from pg_constraint
  where conrelid='public.governance_vote_events'::regclass;

  if protocol_constraints not ilike '%contractual_effect = false%'
     or protocol_constraints not ilike '%ownership_effect = false%'
     or protocol_constraints not ilike '%financial_authority_effect = false%'
     or protocol_constraints not ilike '%role_authority_effect = false%' then
    raise exception 'Protocol legal/economic authority boundaries are incomplete.';
  end if;

  if proposal_constraints not ilike '%contractual_effect = false%'
     or proposal_constraints not ilike '%ownership_effect = false%'
     or proposal_constraints not ilike '%financial_authority_effect = false%'
     or proposal_constraints not ilike '%role_authority_effect = false%' then
    raise exception 'Proposal legal/economic authority boundaries are incomplete.';
  end if;

  if decision_constraints not ilike '%contractual_effect = false%'
     or decision_constraints not ilike '%ownership_effect = false%'
     or decision_constraints not ilike '%financial_authority_effect = false%'
     or decision_constraints not ilike '%role_authority_effect = false%' then
    raise exception 'Decision legal/economic authority boundaries are incomplete.';
  end if;

  if resolution_constraints not ilike '%source_record_mutated = false%' then
    raise exception 'Dispute resolutions must preserve source records.';
  end if;

  if vote_constraints not ilike '%vote_weight = (1)::numeric%' then
    raise exception 'Governance voting must remain one active project member, one vote.';
  end if;
end $$;

do $$
declare
  close_def text;
  ratify_def text;
  dispute_def text;
  resolve_def text;
  workspace_def text;
  combined_def text;
begin
  select pg_get_functiondef(
    'public.close_governance_proposal_v1(uuid,text)'::regprocedure
  ) into close_def;

  if close_def not ilike '%independent_support%'
     or close_def not ilike '%user_id<>proposal.proposed_by%'
     or close_def not ilike '%support_count>oppose_count%'
     or close_def not ilike '%quorum_met%' then
    raise exception 'Governance proposal closure lacks independent-support majority safeguards.';
  end if;

  select pg_get_functiondef(
    'public.ratify_governance_protocol_v1(uuid,uuid)'::regprocedure
  ) into ratify_def;

  if ratify_def not ilike '%outcome=''accepted''%'
     or ratify_def not ilike '%quorum_met=true%'
     or ratify_def not ilike '%independent_support=true%'
     or ratify_def not ilike '%Only draft governance protocol versions may be ratified%' then
    raise exception 'Protocol ratification must require an independently accepted proposal.';
  end if;

  select pg_get_functiondef(
    'public.file_governance_dispute_v1(uuid,text,uuid,text,text,text)'::regprocedure
  ) into dispute_def;

  select pg_get_functiondef(
    'public.resolve_governance_dispute_v1(uuid,text,text,uuid)'::regprocedure
  ) into resolve_def;

  if resolve_def not ilike '%cannot resolve their own governance dispute%'
     or resolve_def not ilike '%source_record_mutated%'
     or resolve_def ilike '%update public.governance_decisions%'
     or resolve_def ilike '%update public.governance_protocol_versions%'
     or resolve_def ilike '%update public.governance_proposals%status%' then
    raise exception 'Governance dispute resolution must be independent and append-only relative to source records.';
  end if;

  select pg_get_functiondef(
    'public.get_governance_workspace_v1(uuid)'::regprocedure
  ) into workspace_def;

  if workspace_def ilike '%current_role text%'
     or workspace_def not ilike '%member_role_value text%'
     or workspace_def not ilike '%''member_role'',member_role_value%' then
    raise exception 'Governance workspace member role must come from project membership, not PostgreSQL CURRENT_ROLE.';
  end if;

  if workspace_def not ilike '%''sparks_weight_votes'',false%'
     or workspace_def not ilike '%''reputation_weight_votes'',false%'
     or workspace_def not ilike '%''governance_changes_legal_ownership'',false%'
     or workspace_def not ilike '%''governance_amends_contracts'',false%'
     or workspace_def not ilike '%''governance_creates_royalty_entitlements'',false%'
     or workspace_def not ilike '%''governance_grants_project_roles'',false%'
     or workspace_def not ilike '%''dispute_resolution_mutates_source_records'',false%'
     or workspace_def not ilike '%''accepted_protocol_requires_independent_support'',true%' then
    raise exception 'Governance workspace boundary flags are incomplete.';
  end if;

  select string_agg(pg_get_functiondef(p.oid),E'\n')
  into combined_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'create_governance_protocol_draft_v1','create_governance_proposal_v1',
      'cast_governance_vote_v1','withdraw_governance_proposal_v1',
      'close_governance_proposal_v1','ratify_governance_protocol_v1',
      'file_governance_dispute_v1','resolve_governance_dispute_v1'
    );

  if combined_def ilike '%update public.project_members%'
     or combined_def ilike '%insert into public.project_members%'
     or combined_def ilike '%update public.contribution_ledger%'
     or combined_def ilike '%insert into public.spark_ledger_entries%'
     or combined_def ilike '%update public.spark_ledger_entries%' then
    raise exception 'Governance RPCs must not grant roles or mutate contribution/Sparks ledgers.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where name='datanest_sovereign_governance_v1'
  ) then
    raise exception 'Sovereign governance migration is not registered.';
  end if;
end $$;
