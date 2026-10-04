begin;

-- Expand the existing optimizer from Owner-only execution to governed Owner/Admin
-- administration while preserving Owner-only approval into formal governance.

alter table public.optimizer_runs
  drop constraint if exists optimizer_runs_trigger_kind_check;

alter table public.optimizer_runs
  add constraint optimizer_runs_trigger_kind_check
  check (trigger_kind in ('cron','owner','admin'));

drop policy if exists optimizer_settings_owner_select on public.optimizer_settings;
create policy optimizer_settings_owner_select on public.optimizer_settings
for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

drop policy if exists optimizer_runs_owner_select on public.optimizer_runs;
create policy optimizer_runs_owner_select on public.optimizer_runs
for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

drop policy if exists optimizer_suggestions_owner_select on public.optimizer_suggestions;
create policy optimizer_suggestions_owner_select on public.optimizer_suggestions
for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

create or replace function public.service_create_optimizer_run_v1(
  target_project uuid,
  target_trigger_kind text,
  target_actor_user uuid,
  target_request_key uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  setting public.optimizer_settings%rowtype;
  existing public.optimizer_runs%rowtype;
  run_id uuid:=gen_random_uuid();
  actor_role text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_trigger_kind not in ('cron','owner','admin') then
    raise exception 'Unsupported optimizer trigger.';
  end if;
  if target_request_key is null then raise exception 'Optimizer request key is required.'; end if;

  select pm.role into actor_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=target_actor_user
    and pm.status='active'
  limit 1;

  if actor_role is null then
    raise insufficient_privilege using message='An active project Owner or Admin is required for optimizer execution.';
  end if;
  if target_trigger_kind in ('cron','owner') and actor_role<>'owner' then
    raise insufficient_privilege using message='Owner execution context is required for this optimizer trigger.';
  end if;
  if target_trigger_kind='admin' and actor_role not in ('owner','admin') then
    raise insufficient_privilege using message='Admin or Owner execution context is required for optimizer execution.';
  end if;

  select * into setting
  from public.optimizer_settings
  where project_id=target_project
  for update;

  if not found then
    insert into public.optimizer_settings(project_id,enabled,cadence_hours,max_suggestions,next_run_after)
    values(target_project,false,6,5,now())
    returning * into setting;
  end if;

  select * into existing
  from public.optimizer_runs
  where project_id=target_project and request_key=target_request_key;
  if found then
    return jsonb_build_object('run_id',existing.id,'created',false,'status',existing.status,'skip',false);
  end if;

  if target_trigger_kind='cron' and not setting.enabled then
    return jsonb_build_object('run_id',null,'created',false,'status','disabled','skip',true);
  end if;

  if target_trigger_kind='cron'
     and setting.next_run_after is not null
     and setting.next_run_after>now() then
    return jsonb_build_object(
      'run_id',null,'created',false,'status','not_due','skip',true,
      'next_run_after',setting.next_run_after
    );
  end if;

  if exists(
    select 1 from public.optimizer_runs r
    where r.project_id=target_project and r.status='running'
      and r.started_at>=now()-interval '45 minutes'
  ) then
    return jsonb_build_object('run_id',null,'created',false,'status','run_in_progress','skip',true);
  end if;

  insert into public.optimizer_runs(
    id,project_id,request_key,trigger_kind,actor_user_id,status
  ) values(
    run_id,target_project,target_request_key,target_trigger_kind,target_actor_user,'running'
  );

  update public.optimizer_settings
  set last_run_at=now(),
      next_run_after=now()+make_interval(hours=>cadence_hours),
      updated_at=now()
  where project_id=target_project;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'DATANEST_OPTIMIZER_RUN_STARTED','DataNest AI System Optimizer',
    jsonb_build_object(
      'run_id',run_id,
      'trigger_kind',target_trigger_kind,
      'actor_user_id',target_actor_user,
      'actor_role',actor_role,
      'collaboration',jsonb_build_array('Audit Optimizer','Workflow Reviewer','Code Cleaner'),
      'governance_effect',false,
      'deployment_authority',false,
      'code_change_authority',false
    )
  );

  return jsonb_build_object('run_id',run_id,'created',true,'status','running','skip',false);
end;
$$;

create or replace function private.get_owner_optimizer_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  setting jsonb;
  runs jsonb;
  suggestions jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active'
    and pm.role in ('owner','admin')
  limit 1;

  if caller_role is null then
    raise insufficient_privilege using message='Owner or Admin access is required.';
  end if;

  select to_jsonb(s) into setting
  from (
    select project_id,enabled,cadence_hours,max_suggestions,last_run_at,last_success_at,
           next_run_after,updated_at
    from public.optimizer_settings
    where project_id=target_project
  ) s;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
  into runs
  from (
    select id,request_key,trigger_kind,status,provider_request_id,summary,limitations,
           suggestion_count,error_category,error_message,started_at,completed_at,created_at
    from public.optimizer_runs
    where project_id=target_project
    order by created_at desc
    limit 30
  ) r;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb)
  into suggestions
  from (
    select id,run_id,trace_key,title,problem_statement,hypothesis,desired_outcome,
           proposed_change,guardrails,evidence_refs,standard_refs,risk_class,confidence,
           status,reviewed_at,review_rationale,linked_observation_id,
           linked_improvement_candidate_id,governance_effect,deployment_authority,created_at
    from public.optimizer_suggestions
    where project_id=target_project
    order by
      case status when 'proposed' then 0 when 'approved' then 1 else 2 end,
      created_at desc
    limit 100
  ) s;

  return jsonb_build_object(
    'role',caller_role,
    'can_manage',true,
    'can_approve',(caller_role='owner'),
    'settings',coalesce(setting,'{}'::jsonb),
    'runs',runs,
    'suggestions',suggestions,
    'pending_count',(select count(*) from public.optimizer_suggestions where project_id=target_project and status='proposed'),
    'collaboration',jsonb_build_object(
      'controller','DataNest AI',
      'reviewers',jsonb_build_array('Audit Optimizer','Workflow Reviewer','Code Cleaner')
    ),
    'boundaries',jsonb_build_object(
      'ai_can_suggest',true,
      'admin_can_configure',true,
      'admin_can_run',true,
      'admin_can_approve',false,
      'owner_can_approve',true,
      'ai_can_approve',false,
      'ai_can_edit_code',false,
      'ai_can_deploy',false,
      'owner_approval_creates_governance_candidate',true,
      'formal_governance_still_required',true
    )
  );
end;
$$;

create or replace function private.set_optimizer_settings_v1(
  target_project uuid,
  target_enabled boolean,
  target_cadence_hours integer,
  target_max_suggestions integer
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active'
    and pm.role in ('owner','admin')
  limit 1;

  if caller_role is null then
    raise insufficient_privilege using message='Owner or Admin access is required.';
  end if;
  if target_cadence_hours<1 or target_cadence_hours>168 then
    raise exception 'Optimizer cadence must be between 1 and 168 hours.';
  end if;
  if target_max_suggestions<1 or target_max_suggestions>10 then
    raise exception 'Optimizer max suggestions must be between 1 and 10.';
  end if;

  insert into public.optimizer_settings(
    project_id,enabled,cadence_hours,max_suggestions,next_run_after,updated_by,updated_at
  )
  values(
    target_project,target_enabled,target_cadence_hours,target_max_suggestions,
    case when target_enabled then now() else null end,caller,now()
  )
  on conflict(project_id) do update set
    enabled=excluded.enabled,
    cadence_hours=excluded.cadence_hours,
    max_suggestions=excluded.max_suggestions,
    next_run_after=case
      when excluded.enabled and not public.optimizer_settings.enabled then now()
      when excluded.enabled then coalesce(public.optimizer_settings.next_run_after,now())
      else null
    end,
    updated_by=caller,
    updated_at=now();

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'DATANEST_OPTIMIZER_SETTINGS_UPDATED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'enabled',target_enabled,
      'cadence_hours',target_cadence_hours,
      'max_suggestions',target_max_suggestions,
      'actor_role',caller_role,
      'admin_or_owner',true,
      'owner_approval_still_required',true
    )
  );

  return target_project;
end;
$$;

comment on function public.service_create_optimizer_run_v1(uuid,text,uuid,uuid)
  is 'Creates a governed DataNest AI System Optimizer run. Cron/owner triggers require an Owner; admin triggers allow active Admin or Owner.';

comment on function public.get_owner_optimizer_workspace_v1(uuid)
  is 'Legacy-named compatibility RPC for the DataNest AI System Optimizer admin workspace. Owner and Admin may inspect; only Owner can approve suggestions.';

comment on function public.set_optimizer_settings_v1(uuid,boolean,integer,integer)
  is 'Configures the DataNest AI System Optimizer for active project Owners or Admins.';

commit;
