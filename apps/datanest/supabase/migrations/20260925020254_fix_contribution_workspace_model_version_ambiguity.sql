begin;

create or replace function public.get_contribution_workspace(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  profile jsonb;
  stakeholder_summary jsonb;
  stakeholder jsonb;
  balances jsonb;
  counts jsonb;
  active_scoring_model_version text;
  preference text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select to_jsonb(sp) into profile
  from public.stakeholder_profiles sp
  where sp.project_id=target_project and sp.user_id=caller;

  stakeholder_summary := private.get_stakeholder_summary(target_project);

  select elem into stakeholder
  from jsonb_array_elements(coalesce(stakeholder_summary->'stakeholders','[]'::jsonb)) elem
  where elem->>'user_id'=caller::text
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_type',b.account_type,
    'project_id',b.project_id,
    'balance',b.balance
  ) order by b.account_type),'[]'::jsonb)
  into balances
  from public.spark_account_balances b
  where b.user_id=caller
    and (b.project_id=target_project or b.project_id is null);

  select jsonb_build_object(
    'submitted',count(*) filter (where lifecycle_state in ('submitted','staged','under_review','changes_requested')),
    'verified',count(*) filter (where lifecycle_state='verified'),
    'accepted',count(*) filter (where contribution_state='accepted'),
    'scored',count(*) filter (where scoring_state='scored'),
    'certified',count(*) filter (where certification_state='certified'),
    'minted',count(*) filter (where minting_state='minted')
  )
  into counts
  from public.contribution_ledger
  where project_id=target_project and user_id=caller;

  select csm.model_version into active_scoring_model_version
  from public.contribution_scoring_models csm
  where csm.project_id=target_project and csm.status='active'
  order by csm.effective_from desc nulls last,csm.created_at desc
  limit 1;

  select dup.ui_complexity into preference
  from public.datanest_user_preferences dup
  where dup.user_id=caller;

  return jsonb_build_object(
    'profile',coalesce(profile,'{}'::jsonb),
    'stakeholder',coalesce(stakeholder,'{}'::jsonb),
    'counts',coalesce(counts,'{}'::jsonb),
    'spark_balances',coalesce(balances,'[]'::jsonb),
    'scoring_model_version',active_scoring_model_version,
    'ui_complexity',coalesce(preference,'simple'),
    'economic_boundary',jsonb_build_object(
      'contribution_share_is_legal_ownership',false,
      'sparks_are_royalty_entitlement',false,
      'royalties_are_separate',true
    )
  );
end;
$$;

commit;
