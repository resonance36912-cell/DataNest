begin;

create or replace function private.intelligence_reject_sensitive_payload(
  target_payload jsonb
) returns void
language plpgsql
immutable
set search_path=public,private
as $$
declare
  rendered text:=lower(coalesce(target_payload,'{}'::jsonb)::text);
begin
  if rendered ~ '"(password|api_key|apikey|secret|secret_value|access_token|refresh_token|cookie|pat|private_key|decrypted_secret)"\s*:' then
    raise exception 'Intelligence Fabric cannot store credentials or secrets.';
  end if;
  if rendered ~ '"(raw_prompt|raw_content|raw_staging|chain_of_thought|reasoning_tokens)"\s*:' then
    raise exception 'Intelligence Fabric cannot store raw staging content, raw prompt content, or private chain-of-thought.';
  end if;
  if rendered ~ '(foundation model training|model training|fine-tun(e|ing)|train model weights)' then
    raise exception 'Phase F v1 does not implement foundation model training or fine-tuning.';
  end if;
end;
$$;

create or replace function private.intelligence_record_event(
  target_project uuid,
  target_event_type text,
  target_actor text,
  target_payload jsonb default '{}'::jsonb,
  target_job uuid default null
) returns void
language plpgsql
security definer
set search_path=public,private
as $$
begin
  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,target_job,target_event_type,
    coalesce(nullif(btrim(target_actor),''),'intelligence_fabric'),
    coalesce(target_payload,'{}'::jsonb)
  );
end;
$$;

create or replace function private.intelligence_validate_visibility(
  target_visibility text
) returns void
language plpgsql
immutable
set search_path=public,private
as $$
begin
  if target_visibility not in (
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  ) then
    raise exception 'Unsupported Intelligence Fabric visibility class.';
  end if;
end;
$$;

create or replace function private.intelligence_validate_operation(
  target_operation text
) returns void
language plpgsql
immutable
set search_path=public,private
as $$
begin
  if target_operation not in ('observe','prepare','write','execute','promote','destruct') then
    raise exception 'Unsupported Intelligence Fabric operation.';
  end if;
end;
$$;

create or replace function public.get_intelligence_fabric_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active'
  limit 1;

  return jsonb_build_object(
    'profiles',coalesce((
      select jsonb_agg(to_jsonb(p) order by
        case p.status when 'active' then 0 when 'draft' then 1 when 'suspended' then 2 else 3 end,
        p.profile_key,p.version desc)
      from public.ilm_profiles p
      where p.project_id=target_project
    ),'[]'::jsonb),
    'routes',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select *
        from public.intelligence_route_decisions
        where project_id=target_project
        order by created_at desc
        limit 100
      ) r
    ),'[]'::jsonb),
    'evaluations',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.evaluated_at desc)
      from (
        select *
        from public.intelligence_evaluation_runs
        where project_id=target_project
        order by evaluated_at desc
        limit 100
      ) e
    ),'[]'::jsonb),
    'capability_evidence',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.observed_at desc)
      from (
        select *
        from public.intelligence_capability_evidence
        where project_id=target_project
        order by observed_at desc
        limit 100
      ) c
    ),'[]'::jsonb),
    'certified_memory',jsonb_build_object(
      'active_count',(select count(*) from public.certified_memory m where m.project_id=target_project and m.active=true),
      'latest_ids',coalesce((
        select jsonb_agg(id order by promoted_at desc)
        from (
          select id,promoted_at
          from public.certified_memory
          where project_id=target_project and active=true
          order by promoted_at desc
          limit 20
        ) memory_rows
      ),'[]'::jsonb)
    ),
    'resource_fabric',jsonb_build_object(
      'active_resource_count',(
        select count(*)
        from public.resource_project_bindings b
        where b.project_id=target_project and b.status='active'
      ),
      'linked_capability_count',(
        select count(*)
        from public.capabilities c
        where c.project_id=target_project and c.resource_id is not null
      )
    ),
    'caller_role',caller_role,
    'can_manage',caller_role in ('owner','admin'),
    'boundaries',jsonb_build_object(
      'ilm_is_trained_foundation_model',false,
      'routing_is_authorization',false,
      'evaluation_mutable_in_browser',false,
      'certified_memory_promotion_separate',true,
      'phase_c_policy_separate',true,
      'phase_d_authority_separate',true,
      'phase_e_health_separate',true
    )
  );
end;
$$;

create or replace function public.upsert_ilm_profile_v1(
  target_project uuid,
  target_profile_key text,
  target_display_name text,
  target_status text,
  target_allowed_purposes text[],
  target_default_capability text,
  target_allowed_resource_kinds text[],
  target_memory_policy jsonb default '{}'::jsonb,
  target_routing_policy jsonb default '{}'::jsonb,
  target_evaluation_policy jsonb default '{}'::jsonb,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  prior public.ilm_profiles%rowtype;
  next_version integer;
  new_id uuid;
  normalized_purposes text[];
  normalized_resource_kinds text[];
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to govern ILM-1 profiles.';
  end if;
  if nullif(btrim(coalesce(target_profile_key,'')),'') is null
     or nullif(btrim(coalesce(target_display_name,'')),'') is null
     or nullif(btrim(coalesce(target_default_capability,'')),'') is null then
    raise exception 'Profile key, display name and default capability are required.';
  end if;
  if target_status not in ('draft','active','suspended','retired') then
    raise exception 'Unsupported ILM profile status.';
  end if;

  select coalesce(array_agg(distinct lower(btrim(value))) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
  into normalized_purposes
  from unnest(coalesce(target_allowed_purposes,'{}'::text[])) value;
  if cardinality(normalized_purposes)=0 then
    raise exception 'At least one ILM purpose is required.';
  end if;

  select coalesce(array_agg(distinct lower(btrim(value))) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
  into normalized_resource_kinds
  from unnest(coalesce(target_allowed_resource_kinds,'{}'::text[])) value;
  if not normalized_resource_kinds <@ array[
    'local_node','cloud_worker','gpu_runtime','browser_runtime','model_endpoint',
    'storage_endpoint','api_endpoint','external_service','agent_runtime',
    'product_capability','human_specialist'
  ]::text[] then
    raise exception 'Unsupported ILM Resource Fabric kind.';
  end if;

  perform private.intelligence_reject_sensitive_payload(coalesce(target_memory_policy,'{}'::jsonb));
  perform private.intelligence_reject_sensitive_payload(coalesce(target_routing_policy,'{}'::jsonb));
  perform private.intelligence_reject_sensitive_payload(coalesce(target_evaluation_policy,'{}'::jsonb));
  perform private.intelligence_reject_sensitive_payload(coalesce(target_metadata,'{}'::jsonb));

  select * into prior
  from public.ilm_profiles p
  where p.project_id=target_project
    and p.profile_key=btrim(target_profile_key)
  order by p.version desc
  limit 1
  for update;

  next_version:=coalesce(prior.version,0)+1;

  if target_status='active' then
    update public.ilm_profiles
    set status='superseded'
    where project_id=target_project
      and profile_key=btrim(target_profile_key)
      and status='active';
  end if;

  insert into public.ilm_profiles(
    project_id,version,status,profile_key,display_name,allowed_purposes,
    default_capability,allowed_resource_kinds,memory_policy,routing_policy,
    evaluation_policy,metadata,created_by,approved_by,approved_at,supersedes_profile_id
  ) values(
    target_project,next_version,target_status,btrim(target_profile_key),btrim(target_display_name),
    normalized_purposes,btrim(target_default_capability),normalized_resource_kinds,
    coalesce(target_memory_policy,'{}'::jsonb),coalesce(target_routing_policy,'{}'::jsonb),
    coalesce(target_evaluation_policy,'{}'::jsonb),coalesce(target_metadata,'{}'::jsonb),
    caller,
    case when target_status='active' then caller else null end,
    case when target_status='active' then now() else null end,
    prior.id
  )
  returning id into new_id;

  perform private.intelligence_record_event(
    target_project,'ILM_PROFILE_VERSIONED',caller::text,
    jsonb_build_object(
      'profile_id',new_id,'profile_key',btrim(target_profile_key),
      'version',next_version,'status',target_status,
      'default_capability',btrim(target_default_capability),
      'allowed_purposes',normalized_purposes,
      'allowed_resource_kinds',normalized_resource_kinds,
      'ilm_is_trained_foundation_model',false
    )
  );

  return new_id;
end;
$$;

create or replace function public.service_record_intelligence_route_v1(
  target_project uuid,
  target_trace_id text,
  target_profile uuid,
  target_purpose text,
  target_visibility_class text,
  target_requested_operation text,
  target_requested_capability text,
  target_route_kind text,
  target_decision text,
  target_reason_codes text[],
  target_certified_memory_ids uuid[],
  target_job uuid default null,
  target_ai_usage_request uuid default null,
  target_resource uuid default null,
  target_capability uuid default null,
  target_provider_connection uuid default null,
  target_provider_key text default null,
  target_model_label text default null,
  target_policy_evidence jsonb default '{}'::jsonb,
  target_resource_evidence jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  profile public.ilm_profiles%rowtype;
  existing_id uuid;
  new_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if nullif(btrim(coalesce(target_trace_id,'')),'') is null
     or nullif(btrim(coalesce(target_purpose,'')),'') is null
     or nullif(btrim(coalesce(target_requested_capability,'')),'') is null then
    raise exception 'Route trace, purpose and requested capability are required.';
  end if;

  select * into profile
  from public.ilm_profiles p
  where p.id=target_profile
    and p.project_id=target_project
    and p.status='active';
  if not found then raise exception 'Active ILM profile not found for project.'; end if;

  if not (lower(btrim(target_purpose))=any(profile.allowed_purposes)) then
    raise exception 'Purpose is not allowed by active ILM profile.';
  end if;

  perform private.intelligence_validate_visibility(target_visibility_class);
  perform private.intelligence_validate_operation(target_requested_operation);

  if target_route_kind not in ('provider_model','local_model','managed_model','tool_agent','memory_only') then
    raise exception 'Unsupported ILM route kind.';
  end if;
  if target_decision not in ('selected','rejected','review_required') then
    raise exception 'Unsupported ILM route decision.';
  end if;

  perform private.intelligence_reject_sensitive_payload(coalesce(target_policy_evidence,'{}'::jsonb));
  perform private.intelligence_reject_sensitive_payload(coalesce(target_resource_evidence,'{}'::jsonb));

  select r.id into existing_id
  from public.intelligence_route_decisions r
  where r.project_id=target_project and r.trace_id=btrim(target_trace_id);
  if found then return existing_id; end if;

  if target_job is not null and not exists(
    select 1 from public.jobs j where j.id=target_job and j.project_id=target_project
  ) then
    raise exception 'Job does not belong to project.';
  end if;

  if target_ai_usage_request is not null and not exists(
    select 1 from public.ai_usage_requests u
    where u.id=target_ai_usage_request
      and u.project_id=target_project
      and (target_job is null or u.job_id=target_job)
  ) then
    raise exception 'AI usage request does not belong to project/Job.';
  end if;

  if exists(
    select 1
    from unnest(coalesce(target_certified_memory_ids,'{}'::uuid[])) memory_id
    where not exists(
      select 1 from public.certified_memory m
      where m.id=memory_id and m.project_id=target_project and m.active=true
    )
  ) then
    raise exception 'Certified memory identity does not belong to active project memory.';
  end if;

  if target_resource is not null and not exists(
    select 1
    from public.resource_registry r
    join public.resource_project_bindings b
      on b.resource_id=r.id and b.project_id=target_project
    where r.id=target_resource and b.status='active'
  ) then
    raise exception 'Resource does not belong to an active project binding.';
  end if;

  if target_capability is not null and not exists(
    select 1 from public.capabilities c
    where c.id=target_capability
      and c.project_id=target_project
      and (target_resource is null or c.resource_id=target_resource)
  ) then
    raise exception 'Capability does not belong to project/resource.';
  end if;

  if target_provider_connection is not null and not exists(
    select 1 from public.ai_provider_connections p
    where p.id=target_provider_connection
      and p.project_id=target_project
      and p.status='active'
  ) then
    raise exception 'Provider connection does not belong to active project provider policy.';
  end if;

  if target_visibility_class='local_only'
     and (target_route_kind in ('provider_model','managed_model') or target_provider_connection is not null) then
    raise exception 'local_only data cannot route to managed or external provider execution.';
  end if;

  if target_decision='selected' and target_route_kind='provider_model' and target_provider_connection is null then
    raise exception 'Selected provider_model route requires an approved provider connection.';
  end if;

  if target_decision='selected' and target_route_kind in ('local_model','managed_model','tool_agent')
     and (target_resource is null or target_capability is null) then
    raise exception 'Selected resource-backed route requires resource and capability identity.';
  end if;

  insert into public.intelligence_route_decisions(
    project_id,job_id,ai_usage_request_id,trace_id,profile_id,profile_version,
    purpose,visibility_class,requested_operation,requested_capability,
    certified_memory_ids,resource_id,capability_id,provider_connection_id,
    provider_key,model_label,route_kind,decision,reason_codes,
    policy_evidence,resource_evidence
  ) values(
    target_project,target_job,target_ai_usage_request,btrim(target_trace_id),
    profile.id,profile.version,lower(btrim(target_purpose)),target_visibility_class,
    target_requested_operation,btrim(target_requested_capability),
    coalesce(target_certified_memory_ids,'{}'::uuid[]),target_resource,target_capability,
    target_provider_connection,nullif(btrim(coalesce(target_provider_key,'')),''),
    nullif(btrim(coalesce(target_model_label,'')),''),
    target_route_kind,target_decision,coalesce(target_reason_codes,'{}'::text[]),
    coalesce(target_policy_evidence,'{}'::jsonb),coalesce(target_resource_evidence,'{}'::jsonb)
  )
  returning id into new_id;

  perform private.intelligence_record_event(
    target_project,'INTELLIGENCE_ROUTE_RECORDED','service_ilm_1',
    jsonb_build_object(
      'route_decision_id',new_id,'trace_id',btrim(target_trace_id),
      'profile_id',profile.id,'profile_version',profile.version,
      'purpose',lower(btrim(target_purpose)),'route_kind',target_route_kind,
      'decision',target_decision,'resource_id',target_resource,
      'capability_id',target_capability,'provider_connection_id',target_provider_connection,
      'reason_codes',coalesce(target_reason_codes,'{}'::text[])
    ),
    target_job
  );

  return new_id;
end;
$$;

create or replace function public.service_record_intelligence_evaluation_v1(
  target_project uuid,
  target_route_decision uuid,
  target_evaluation_key text,
  target_evaluation_version text,
  target_evaluator_kind text,
  target_status text,
  target_dimensions jsonb,
  target_findings jsonb,
  target_trace_id text,
  target_evaluated_at timestamptz default now(),
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if nullif(btrim(coalesce(target_trace_id,'')),'') is null
     or nullif(btrim(coalesce(target_evaluation_key,'')),'') is null
     or nullif(btrim(coalesce(target_evaluation_version,'')),'') is null then
    raise exception 'Evaluation trace, key and version are required.';
  end if;
  if not exists(
    select 1 from public.intelligence_route_decisions r
    where r.id=target_route_decision and r.project_id=target_project
  ) then
    raise exception 'Route decision does not belong to project.';
  end if;
  if target_evaluator_kind not in ('deterministic','policy','human_review','certification_suite') then
    raise exception 'Unsupported Intelligence Fabric evaluator kind.';
  end if;
  if target_status not in ('passed','failed','review_required') then
    raise exception 'Unsupported Intelligence Fabric evaluation status.';
  end if;

  perform private.intelligence_reject_sensitive_payload(coalesce(target_dimensions,'{}'::jsonb));
  perform private.intelligence_reject_sensitive_payload(coalesce(target_findings,'{}'::jsonb));

  select e.id into existing_id
  from public.intelligence_evaluation_runs e
  where e.project_id=target_project and e.trace_id=btrim(target_trace_id);
  if found then return existing_id; end if;

  insert into public.intelligence_evaluation_runs(
    project_id,route_decision_id,evaluation_key,evaluation_version,evaluator_kind,
    status,dimensions,findings,evidence_reference,trace_id,evaluated_at
  ) values(
    target_project,target_route_decision,btrim(target_evaluation_key),
    btrim(target_evaluation_version),target_evaluator_kind,target_status,
    coalesce(target_dimensions,'{}'::jsonb),coalesce(target_findings,'{}'::jsonb),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),
    btrim(target_trace_id),target_evaluated_at
  )
  returning id into new_id;

  perform private.intelligence_record_event(
    target_project,'INTELLIGENCE_EVALUATION_RECORDED','service_ilm_1',
    jsonb_build_object(
      'evaluation_run_id',new_id,'route_decision_id',target_route_decision,
      'evaluation_key',btrim(target_evaluation_key),
      'evaluation_version',btrim(target_evaluation_version),
      'evaluator_kind',target_evaluator_kind,'status',target_status,
      'trace_id',btrim(target_trace_id)
    )
  );

  return new_id;
end;
$$;

create or replace function public.service_record_intelligence_capability_evidence_v1(
  target_project uuid,
  target_resource uuid,
  target_capability uuid,
  target_purpose text,
  target_evidence_kind text,
  target_status text,
  target_metrics jsonb,
  target_trace_id text,
  target_observed_at timestamptz default now(),
  target_route_decision uuid default null,
  target_evaluation_run uuid default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if nullif(btrim(coalesce(target_trace_id,'')),'') is null
     or nullif(btrim(coalesce(target_purpose,'')),'') is null then
    raise exception 'Capability evidence trace and purpose are required.';
  end if;
  if target_evidence_kind not in ('route_result','evaluation','certification','operator_review') then
    raise exception 'Unsupported Intelligence Fabric capability evidence kind.';
  end if;
  if target_status not in ('supported','degraded','unsupported','unknown') then
    raise exception 'Unsupported Intelligence Fabric capability evidence status.';
  end if;

  if not exists(
    select 1
    from public.capabilities c
    join public.resource_registry r on r.id=c.resource_id
    join public.resource_project_bindings b
      on b.resource_id=r.id and b.project_id=target_project
    where c.id=target_capability
      and c.project_id=target_project
      and c.resource_id=target_resource
      and b.status='active'
  ) then
    raise exception 'Resource/capability identity does not belong to active project Resource Fabric.';
  end if;

  if target_route_decision is not null and not exists(
    select 1 from public.intelligence_route_decisions r
    where r.id=target_route_decision
      and r.project_id=target_project
      and (r.resource_id is null or r.resource_id=target_resource)
      and (r.capability_id is null or r.capability_id=target_capability)
  ) then
    raise exception 'Route decision does not match project/resource/capability.';
  end if;

  if target_evaluation_run is not null and not exists(
    select 1 from public.intelligence_evaluation_runs e
    where e.id=target_evaluation_run and e.project_id=target_project
  ) then
    raise exception 'Evaluation run does not belong to project.';
  end if;

  perform private.intelligence_reject_sensitive_payload(coalesce(target_metrics,'{}'::jsonb));

  select c.id into existing_id
  from public.intelligence_capability_evidence c
  where c.project_id=target_project and c.trace_id=btrim(target_trace_id);
  if found then return existing_id; end if;

  insert into public.intelligence_capability_evidence(
    project_id,resource_id,capability_id,route_decision_id,evaluation_run_id,
    purpose,evidence_kind,status,metrics,evidence_reference,trace_id,observed_at
  ) values(
    target_project,target_resource,target_capability,target_route_decision,target_evaluation_run,
    lower(btrim(target_purpose)),target_evidence_kind,target_status,
    coalesce(target_metrics,'{}'::jsonb),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),
    btrim(target_trace_id),target_observed_at
  )
  returning id into new_id;

  perform private.intelligence_record_event(
    target_project,'INTELLIGENCE_CAPABILITY_EVIDENCE_RECORDED','service_ilm_1',
    jsonb_build_object(
      'capability_evidence_id',new_id,'resource_id',target_resource,
      'capability_id',target_capability,'route_decision_id',target_route_decision,
      'evaluation_run_id',target_evaluation_run,'purpose',lower(btrim(target_purpose)),
      'evidence_kind',target_evidence_kind,'status',target_status,
      'trace_id',btrim(target_trace_id)
    )
  );

  return new_id;
end;
$$;

revoke all on function private.intelligence_reject_sensitive_payload(jsonb) from public,anon,authenticated;
revoke all on function private.intelligence_record_event(uuid,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function private.intelligence_validate_visibility(text) from public,anon,authenticated;
revoke all on function private.intelligence_validate_operation(text) from public,anon,authenticated;

revoke all on function public.get_intelligence_fabric_workspace_v1(uuid) from public,anon;
revoke all on function public.upsert_ilm_profile_v1(uuid,text,text,text,text[],text,text[],jsonb,jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.service_record_intelligence_route_v1(uuid,text,uuid,text,text,text,text,text,text,text[],uuid[],uuid,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.service_record_intelligence_evaluation_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.service_record_intelligence_capability_evidence_v1(uuid,uuid,uuid,text,text,text,jsonb,text,timestamptz,uuid,uuid,text) from public,anon,authenticated;

grant execute on function public.get_intelligence_fabric_workspace_v1(uuid) to authenticated,service_role;
grant execute on function public.upsert_ilm_profile_v1(uuid,text,text,text,text[],text,text[],jsonb,jsonb,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.service_record_intelligence_route_v1(uuid,text,uuid,text,text,text,text,text,text,text[],uuid[],uuid,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.service_record_intelligence_evaluation_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,text,timestamptz,text) to service_role;
grant execute on function public.service_record_intelligence_capability_evidence_v1(uuid,uuid,uuid,text,text,text,jsonb,text,timestamptz,uuid,uuid,text) to service_role;

commit;
