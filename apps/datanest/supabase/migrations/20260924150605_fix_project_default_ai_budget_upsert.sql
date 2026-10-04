
create or replace function private.set_ai_budget_policy(
  target_project uuid,
  target_user uuid,
  target_daily_request_limit integer,
  target_monthly_token_limit bigint,
  target_monthly_cost_limit_minor bigint,
  target_max_output_tokens integer,
  target_concurrency_limit integer,
  target_allowed_providers text[],
  target_allowed_models text[],
  target_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  policy_id uuid;
begin
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if target_user is not null and not exists (
    select 1 from public.stakeholder_profiles sp
    where sp.project_id=target_project and sp.user_id=target_user
  ) then
    raise exception 'Stakeholder not found.';
  end if;

  if target_user is null then
    update public.ai_budget_policies
    set enabled=true,
        daily_request_limit=greatest(target_daily_request_limit,0),
        monthly_token_limit=greatest(target_monthly_token_limit,0),
        monthly_cost_limit_minor=target_monthly_cost_limit_minor,
        max_output_tokens=greatest(target_max_output_tokens,1),
        concurrency_limit=greatest(target_concurrency_limit,1),
        allowed_providers=coalesce(target_allowed_providers,array['openai','openai_compatible']),
        allowed_models=coalesce(target_allowed_models,array['*']),
        currency=coalesce(nullif(btrim(target_currency),''),'ZAR'),
        updated_by=auth.uid(),
        updated_at=now()
    where project_id=target_project and user_id is null
    returning id into policy_id;

    if policy_id is null then
      insert into public.ai_budget_policies(
        project_id,user_id,enabled,daily_request_limit,monthly_token_limit,
        monthly_cost_limit_minor,max_output_tokens,concurrency_limit,
        allowed_providers,allowed_models,currency,updated_by
      )
      values(
        target_project,null,true,
        greatest(target_daily_request_limit,0),
        greatest(target_monthly_token_limit,0),
        target_monthly_cost_limit_minor,
        greatest(target_max_output_tokens,1),
        greatest(target_concurrency_limit,1),
        coalesce(target_allowed_providers,array['openai','openai_compatible']),
        coalesce(target_allowed_models,array['*']),
        coalesce(nullif(btrim(target_currency),''),'ZAR'),
        auth.uid()
      )
      returning id into policy_id;
    end if;
  else
    insert into public.ai_budget_policies(
      project_id,user_id,enabled,daily_request_limit,monthly_token_limit,
      monthly_cost_limit_minor,max_output_tokens,concurrency_limit,
      allowed_providers,allowed_models,currency,updated_by
    )
    values(
      target_project,target_user,true,
      greatest(target_daily_request_limit,0),
      greatest(target_monthly_token_limit,0),
      target_monthly_cost_limit_minor,
      greatest(target_max_output_tokens,1),
      greatest(target_concurrency_limit,1),
      coalesce(target_allowed_providers,array['openai','openai_compatible']),
      coalesce(target_allowed_models,array['*']),
      coalesce(nullif(btrim(target_currency),''),'ZAR'),
      auth.uid()
    )
    on conflict (project_id,user_id)
    where user_id is not null
    do update set
      enabled=true,
      daily_request_limit=excluded.daily_request_limit,
      monthly_token_limit=excluded.monthly_token_limit,
      monthly_cost_limit_minor=excluded.monthly_cost_limit_minor,
      max_output_tokens=excluded.max_output_tokens,
      concurrency_limit=excluded.concurrency_limit,
      allowed_providers=excluded.allowed_providers,
      allowed_models=excluded.allowed_models,
      currency=excluded.currency,
      updated_by=excluded.updated_by,
      updated_at=now()
    returning id into policy_id;
  end if;

  return policy_id;
end;
$$;
