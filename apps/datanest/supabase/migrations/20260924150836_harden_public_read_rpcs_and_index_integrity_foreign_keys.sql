
create or replace function private.get_ai_budget_status_private(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  bp public.ai_budget_policies%rowtype;
begin
  if caller is null or not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select * into bp from private.resolve_ai_budget(target_project,caller);

  return jsonb_build_object(
    'policy_id',bp.id,
    'daily_request_limit',bp.daily_request_limit,
    'monthly_token_limit',bp.monthly_token_limit,
    'monthly_cost_limit_minor',bp.monthly_cost_limit_minor,
    'max_output_tokens',bp.max_output_tokens,
    'concurrency_limit',bp.concurrency_limit,
    'allowed_providers',bp.allowed_providers,
    'allowed_models',bp.allowed_models,
    'currency',bp.currency,
    'daily_requests_used',(
      select count(*) from public.ai_usage_requests r
      where r.project_id=target_project and r.user_id=caller
        and r.provider_called=true and r.created_at >= date_trunc('day',now())
    ),
    'monthly_tokens_used',(
      select coalesce(sum(total_tokens),0) from public.ai_usage_requests r
      where r.project_id=target_project and r.user_id=caller
        and r.created_at >= date_trunc('month',now())
        and r.status in ('succeeded','unknown')
    ),
    'monthly_cost_used_minor',(
      select coalesce(sum(coalesce(reconciled_cost_minor,provider_reported_cost_minor,estimated_cost_minor,0)),0)
      from public.ai_usage_requests r
      where r.project_id=target_project and r.user_id=caller
        and r.created_at >= date_trunc('month',now())
        and r.status in ('succeeded','unknown')
    )
  );
end;
$$;

create or replace function public.get_ai_budget_status(target_project uuid)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.get_ai_budget_status_private(target_project);
$$;

revoke all on function private.get_ai_budget_status_private(uuid) from public,anon;
grant execute on function private.get_ai_budget_status_private(uuid) to authenticated,service_role;
revoke all on function public.get_ai_budget_status(uuid) from public,anon;
grant execute on function public.get_ai_budget_status(uuid) to authenticated;

create or replace function private.get_stake_history_private(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
begin
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,
      'policy_version_id',s.policy_version_id,
      'trigger_type',s.trigger_type,
      'trigger_ref',s.trigger_ref,
      'snapshot',s.snapshot,
      'created_at',s.created_at
    ) order by s.created_at desc),'[]'::jsonb)
    from (
      select * from public.stake_calculation_snapshots
      where project_id=target_project
      order by created_at desc
      limit 50
    ) s
  );
end;
$$;

create or replace function public.get_stake_history(target_project uuid)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.get_stake_history_private(target_project);
$$;

revoke all on function private.get_stake_history_private(uuid) from public,anon;
grant execute on function private.get_stake_history_private(uuid) to authenticated,service_role;
revoke all on function public.get_stake_history(uuid) from public,anon;
grant execute on function public.get_stake_history(uuid) to authenticated;

create index if not exists ai_budget_policies_updated_by_idx
  on public.ai_budget_policies(updated_by);
create index if not exists ai_budget_policies_user_id_idx
  on public.ai_budget_policies(user_id);
create index if not exists ai_provider_domain_allowlist_added_by_idx
  on public.ai_provider_domain_allowlist(added_by);
create index if not exists ai_usage_requests_assistant_message_id_idx
  on public.ai_usage_requests(assistant_message_id);
create index if not exists ai_usage_requests_job_id_idx
  on public.ai_usage_requests(job_id);
create index if not exists ai_usage_requests_user_message_id_idx
  on public.ai_usage_requests(user_message_id);
create index if not exists contribution_adjustments_created_by_idx
  on public.contribution_adjustments(created_by);
create index if not exists contribution_adjustments_user_id_idx
  on public.contribution_adjustments(user_id);
create index if not exists contribution_ledger_accepted_by_idx
  on public.contribution_ledger(accepted_by);
create index if not exists stake_calculation_snapshots_created_by_idx
  on public.stake_calculation_snapshots(created_by);
create index if not exists stake_calculation_snapshots_policy_version_id_idx
  on public.stake_calculation_snapshots(policy_version_id);
create index if not exists stake_policy_versions_created_by_idx
  on public.stake_policy_versions(created_by);
