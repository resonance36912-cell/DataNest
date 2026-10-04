begin;

create or replace function private.resource_active_member_role(
  target_project uuid,
  target_user uuid
) returns text
language sql
stable
security definer
set search_path=public,private,auth
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=target_user
    and pm.status='active'
  limit 1;
$$;

create or replace function private.resource_validate_visibility_classes(
  target_classes text[]
) returns void
language plpgsql
immutable
set search_path=public,private
as $$
begin
  if not coalesce(target_classes,'{}'::text[]) <@ array[
    'public','nest_private','project_restricted','organization_restricted','high_sensitivity','local_only'
  ]::text[] then
    raise exception 'Unsupported Resource Fabric visibility class.';
  end if;
end;
$$;

create or replace function private.resource_validate_operations(
  target_operations text[]
) returns void
language plpgsql
immutable
set search_path=public,private
as $$
begin
  if not coalesce(target_operations,'{}'::text[]) <@ array[
    'observe','prepare','write','execute','promote','destruct'
  ]::text[] then
    raise exception 'Unsupported Resource Fabric execution operation.';
  end if;
end;
$$;

create or replace function private.resource_validate_binding(
  target_project uuid,
  target_resource uuid,
  require_active boolean default true
) returns void
language plpgsql
stable
security definer
set search_path=public,private
as $$
begin
  if not exists(
    select 1
    from public.resource_project_bindings b
    where b.project_id=target_project
      and b.resource_id=target_resource
      and (not require_active or b.status='active')
  ) then
    raise exception 'Resource/project binding is missing or inactive.';
  end if;
end;
$$;

create or replace function private.resource_reject_credential_payload(
  target_payload jsonb
) returns void
language plpgsql
immutable
set search_path=public,private
as $$
declare
  rendered text:=lower(coalesce(target_payload,'{}'::jsonb)::text);
begin
  if rendered ~ '"(password|api_key|apikey|secret|secret_value|access_token|refresh_token|cookie|pat|private_key)"\s*:' then
    raise exception 'Resource Fabric records cannot store reusable credentials or secrets.';
  end if;
end;
$$;

create or replace function private.resource_record_event(
  target_project uuid,
  target_event_type text,
  target_actor text,
  target_payload jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path=public,private
as $$
begin
  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(target_project,null,target_event_type,target_actor,coalesce(target_payload,'{}'::jsonb));
end;
$$;

create or replace function public.get_resource_fabric_workspace_v1(
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

  caller_role:=private.resource_active_member_role(target_project,caller);

  return jsonb_build_object(
    'resources',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'binding',jsonb_build_object(
            'id',b.id,
            'status',b.status,
            'resource_alias',b.resource_alias,
            'allowed_capabilities',b.allowed_capabilities,
            'approved_at',b.approved_at,
            'updated_at',b.updated_at
          ),
          'resource',jsonb_build_object(
            'id',r.id,
            'resource_key',r.resource_key,
            'resource_kind',r.resource_kind,
            'display_name',r.display_name,
            'owner_kind',r.owner_kind,
            'owner_user_id',r.owner_user_id,
            'owner_label',r.owner_label,
            'trust_level',r.trust_level,
            'location_class',r.location_class,
            'region_hint',r.region_hint,
            'supported_visibility_classes',r.supported_visibility_classes,
            'cost_profile',r.cost_profile,
            'limits',r.limits,
            'health_status',r.health_status,
            'health_summary',r.health_summary,
            'enabled',r.enabled,
            'last_seen_at',r.last_seen_at,
            'metadata',r.metadata,
            'created_at',r.created_at,
            'updated_at',r.updated_at
          ),
          'capabilities',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id',c.id,
                'account_key',c.account_key,
                'connector_kind',c.connector_kind,
                'capability',c.capability,
                'state',c.state,
                'observed_at',c.observed_at,
                'next_check_at',c.next_check_at,
                'confidence',c.confidence,
                'concurrency_limit',c.concurrency_limit,
                'running',c.running,
                'enabled',c.enabled,
                'metadata',c.metadata
              )
              order by c.capability,c.account_key
            )
            from public.capabilities c
            where c.project_id=target_project
              and c.resource_id=r.id
          ),'[]'::jsonb),
          'latest_health',(
            select jsonb_build_object(
              'id',h.id,
              'health_status',h.health_status,
              'observed_availability',h.observed_availability,
              'source_kind',h.source_kind,
              'source_key',h.source_key,
              'metrics',h.metrics,
              'evidence_reference',h.evidence_reference,
              'trace_id',h.trace_id,
              'observed_at',h.observed_at
            )
            from public.resource_health_observations h
            where h.project_id=target_project
              and h.resource_id=r.id
            order by h.observed_at desc,h.created_at desc
            limit 1
          ),
          'recent_health',coalesce((
            select jsonb_agg(to_jsonb(recent) order by recent.observed_at desc)
            from (
              select
                h.id,h.health_status,h.observed_availability,h.source_kind,h.source_key,
                h.metrics,h.evidence_reference,h.trace_id,h.observed_at
              from public.resource_health_observations h
              where h.project_id=target_project
                and h.resource_id=r.id
              order by h.observed_at desc,h.created_at desc
              limit 5
            ) recent
          ),'[]'::jsonb),
          'sovereign_node_policy',(
            select jsonb_build_object(
              'id',p.id,
              'version',p.version,
              'status',p.status,
              'allowed_capabilities',p.allowed_capabilities,
              'resource_ceiling',p.resource_ceiling,
              'schedule_policy',p.schedule_policy,
              'allowed_visibility_classes',p.allowed_visibility_classes,
              'data_scope',p.data_scope,
              'prohibited_operations',p.prohibited_operations,
              'network_policy',p.network_policy,
              'interactive_remote_control',p.interactive_remote_control,
              'approved_at',p.approved_at,
              'created_at',p.created_at
            )
            from public.sovereign_node_policies p
            where p.project_id=target_project
              and p.resource_id=r.id
            order by
              case p.status when 'active' then 0 when 'draft' then 1 when 'suspended' then 2 else 3 end,
              p.version desc
            limit 1
          )
        )
        order by
          case b.status when 'active' then 0 when 'proposed' then 1 when 'suspended' then 2 else 3 end,
          r.resource_kind,r.display_name
      )
      from public.resource_project_bindings b
      join public.resource_registry r on r.id=b.resource_id
      where b.project_id=target_project
    ),'[]'::jsonb),
    'unbound_capabilities',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',c.id,
          'account_key',c.account_key,
          'connector_kind',c.connector_kind,
          'capability',c.capability,
          'state',c.state,
          'enabled',c.enabled,
          'running',c.running,
          'concurrency_limit',c.concurrency_limit,
          'observed_at',c.observed_at
        )
        order by c.capability,c.account_key
      )
      from public.capabilities c
      where c.project_id=target_project
        and c.resource_id is null
    ),'[]'::jsonb),
    'caller_role',caller_role,
    'can_manage',caller_role in ('owner','admin'),
    'boundaries',jsonb_build_object(
      'registration_is_remote_control',false,
      'resource_match_is_reservation',false,
      'resource_match_is_capability_lease',false,
      'local_node_is_required',false,
      'health_is_client_mutable',false,
      'phase_c_trust_remains_independent',true,
      'phase_d_authority_remains_independent',true
    )
  );
end;
$$;

create or replace function public.register_project_resource_v1(
  target_project uuid,
  target_resource_key text,
  target_display_name text,
  target_resource_kind text,
  target_owner_kind text default 'project',
  target_owner_label text default null,
  target_trust_level text default 'unknown',
  target_location_class text default 'unknown',
  target_region_hint text default null,
  target_supported_visibility_classes text[] default '{}'::text[],
  target_cost_profile jsonb default '{}'::jsonb,
  target_limits jsonb default '{}'::jsonb,
  target_metadata jsonb default '{}'::jsonb,
  target_allowed_capabilities text[] default '{}'::text[],
  target_owner_user uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  resource_id uuid;
  normalized_capabilities text[];
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to register Resource Fabric supply.';
  end if;

  if nullif(btrim(coalesce(target_resource_key,'')),'') is null then raise exception 'Resource key is required.'; end if;
  if nullif(btrim(coalesce(target_display_name,'')),'') is null then raise exception 'Display name is required.'; end if;
  if target_resource_kind not in (
    'local_node','cloud_worker','gpu_runtime','browser_runtime','model_endpoint',
    'storage_endpoint','api_endpoint','external_service','agent_runtime',
    'product_capability','human_specialist'
  ) then raise exception 'Unsupported Resource Fabric resource kind.'; end if;
  if target_owner_kind not in ('project','user','organization','external','system') then raise exception 'Unsupported Resource owner kind.'; end if;
  if target_owner_kind='user' and target_owner_user is null then raise exception 'User-owned Resource requires an owner user.'; end if;
  if target_trust_level not in ('unknown','declared','verified','governed') then raise exception 'Unsupported Resource trust level.'; end if;
  if target_location_class not in (
    'unknown','local_device','local_network','private_cloud','managed_cloud','public_cloud','external','human'
  ) then raise exception 'Unsupported Resource location class.'; end if;

  perform private.resource_validate_visibility_classes(coalesce(target_supported_visibility_classes,'{}'::text[]));

  select coalesce(array_agg(distinct btrim(value)) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
  into normalized_capabilities
  from unnest(coalesce(target_allowed_capabilities,'{}'::text[])) value;

  perform private.resource_reject_credential_payload(coalesce(target_cost_profile,'{}'::jsonb));
  perform private.resource_reject_credential_payload(coalesce(target_limits,'{}'::jsonb));
  perform private.resource_reject_credential_payload(coalesce(target_metadata,'{}'::jsonb));

  insert into public.resource_registry(
    resource_key,resource_kind,display_name,owner_kind,owner_user_id,owner_label,
    trust_level,location_class,region_hint,supported_visibility_classes,
    cost_profile,limits,health_status,health_summary,enabled,metadata,created_by
  ) values(
    btrim(target_resource_key),target_resource_kind,btrim(target_display_name),target_owner_kind,
    case when target_owner_kind='user' then target_owner_user else null end,
    nullif(btrim(coalesce(target_owner_label,'')),''),
    target_trust_level,target_location_class,nullif(btrim(coalesce(target_region_hint,'')),''),
    coalesce(target_supported_visibility_classes,'{}'::text[]),
    coalesce(target_cost_profile,'{}'::jsonb),coalesce(target_limits,'{}'::jsonb),
    'unknown','{}'::jsonb,true,coalesce(target_metadata,'{}'::jsonb),caller
  )
  returning id into resource_id;

  insert into public.resource_project_bindings(
    project_id,resource_id,status,allowed_capabilities,created_by,approved_by,approved_at
  ) values(
    target_project,resource_id,'active',normalized_capabilities,caller,caller,now()
  );

  perform private.resource_record_event(
    target_project,'RESOURCE_REGISTERED',caller::text,
    jsonb_build_object(
      'resource_id',resource_id,
      'resource_key',btrim(target_resource_key),
      'resource_kind',target_resource_kind,
      'trust_level',target_trust_level,
      'location_class',target_location_class,
      'allowed_capabilities',normalized_capabilities
    )
  );

  return resource_id;
end;
$$;

create or replace function public.set_resource_project_binding_state_v1(
  target_binding uuid,
  target_state text,
  target_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  binding public.resource_project_bindings%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into binding
  from public.resource_project_bindings b
  where b.id=target_binding
  for update;

  if not found then raise exception 'Resource Project Binding not found.'; end if;
  if not private.has_project_role(binding.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to manage Resource Fabric supply.';
  end if;
  if target_state not in ('active','suspended','retired') then
    raise exception 'Unsupported Resource Project Binding state.';
  end if;
  if binding.status='retired' and target_state<>'retired' then
    raise exception 'Retired Resource bindings cannot be reactivated.';
  end if;

  update public.resource_project_bindings
  set status=target_state,
      approved_by=case when target_state='active' then caller else approved_by end,
      approved_at=case when target_state='active' then now() else approved_at end,
      updated_at=now()
  where id=binding.id;

  perform private.resource_record_event(
    binding.project_id,'RESOURCE_BINDING_STATE_CHANGED',caller::text,
    jsonb_build_object(
      'resource_id',binding.resource_id,
      'binding_id',binding.id,
      'previous_state',binding.status,
      'state',target_state,
      'reason',nullif(btrim(coalesce(target_reason,'')),'')
    )
  );
  return binding.id;
end;
$$;

create or replace function public.upsert_sovereign_node_policy_v1(
  target_project uuid,
  target_resource uuid,
  target_status text,
  target_allowed_capabilities text[],
  target_resource_ceiling jsonb default '{}'::jsonb,
  target_schedule_policy jsonb default '{}'::jsonb,
  target_allowed_visibility_classes text[] default '{}'::text[],
  target_data_scope jsonb default '{}'::jsonb,
  target_prohibited_operations text[] default '{}'::text[],
  target_network_policy jsonb default '{}'::jsonb,
  target_interactive_remote_control boolean default false
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  resource public.resource_registry%rowtype;
  binding public.resource_project_bindings%rowtype;
  prior public.sovereign_node_policies%rowtype;
  next_version integer;
  new_id uuid;
  normalized_capabilities text[];
  schedule_mode text;
  start_hour integer;
  end_hour integer;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to govern sovereign node policy.';
  end if;

  perform private.resource_validate_binding(target_project,target_resource,true);

  select * into resource from public.resource_registry where id=target_resource;
  if not found then raise exception 'Resource not found.'; end if;
  if resource.resource_kind<>'local_node' then
    raise exception 'Sovereign Node Policy requires a local_node Resource.';
  end if;
  if target_interactive_remote_control then
    raise exception 'Interactive remote control is not permitted by Phase E sovereign node policy.';
  end if;
  if target_status not in ('draft','active','suspended','retired') then
    raise exception 'Unsupported sovereign node policy status.';
  end if;

  select * into binding
  from public.resource_project_bindings b
  where b.project_id=target_project and b.resource_id=target_resource
  for update;

  select coalesce(array_agg(distinct btrim(value)) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
  into normalized_capabilities
  from unnest(coalesce(target_allowed_capabilities,'{}'::text[])) value;

  if target_status='active' and cardinality(normalized_capabilities)=0 then
    raise exception 'Active Sovereign Node Policy requires at least one allowed capability.';
  end if;
  if cardinality(binding.allowed_capabilities)>0
     and not normalized_capabilities <@ binding.allowed_capabilities then
    raise exception 'Sovereign node policy capabilities must remain within the project binding.';
  end if;

  perform private.resource_validate_visibility_classes(coalesce(target_allowed_visibility_classes,'{}'::text[]));
  perform private.resource_validate_operations(coalesce(target_prohibited_operations,'{}'::text[]));
  perform private.resource_reject_credential_payload(coalesce(target_resource_ceiling,'{}'::jsonb));
  perform private.resource_reject_credential_payload(coalesce(target_schedule_policy,'{}'::jsonb));
  perform private.resource_reject_credential_payload(coalesce(target_data_scope,'{}'::jsonb));
  perform private.resource_reject_credential_payload(coalesce(target_network_policy,'{}'::jsonb));

  schedule_mode:=coalesce(target_schedule_policy->>'mode','always');
  if schedule_mode not in ('always','disabled','utc_window') then
    raise exception 'Unsupported sovereign node schedule mode.';
  end if;
  if schedule_mode='utc_window' then
    begin
      start_hour:=(target_schedule_policy->>'start_hour_utc')::integer;
      end_hour:=(target_schedule_policy->>'end_hour_utc')::integer;
    exception when others then
      raise exception 'utc_window schedule requires integer start_hour_utc and end_hour_utc.';
    end;
    if start_hour not between 0 and 23 or end_hour not between 0 and 23 then
      raise exception 'utc_window hours must be between 0 and 23.';
    end if;
  end if;

  select * into prior
  from public.sovereign_node_policies p
  where p.project_id=target_project and p.resource_id=target_resource
  order by p.version desc
  limit 1
  for update;

  next_version:=coalesce(prior.version,0)+1;

  if target_status<>'draft' then
    update public.sovereign_node_policies
    set status='superseded'
    where project_id=target_project and resource_id=target_resource and status='active';
  end if;

  insert into public.sovereign_node_policies(
    project_id,resource_id,version,status,allowed_capabilities,resource_ceiling,
    schedule_policy,allowed_visibility_classes,data_scope,prohibited_operations,
    network_policy,interactive_remote_control,created_by,approved_by,approved_at,
    supersedes_policy_id
  ) values(
    target_project,target_resource,next_version,target_status,normalized_capabilities,
    coalesce(target_resource_ceiling,'{}'::jsonb),
    coalesce(target_schedule_policy,'{}'::jsonb),
    coalesce(target_allowed_visibility_classes,'{}'::text[]),
    coalesce(target_data_scope,'{}'::jsonb),
    coalesce(target_prohibited_operations,'{}'::text[]),
    coalesce(target_network_policy,'{}'::jsonb),
    false,
    caller,
    case when target_status='draft' then null else caller end,
    case when target_status='draft' then null else now() end,
    case when prior.id is not null and target_status<>'draft' then prior.id else null end
  )
  returning id into new_id;

  perform private.resource_record_event(
    target_project,'SOVEREIGN_NODE_POLICY_VERSIONED',caller::text,
    jsonb_build_object(
      'policy_id',new_id,
      'resource_id',target_resource,
      'version',next_version,
      'status',target_status,
      'interactive_remote_control',false,
      'supersedes_policy_id',case when prior.id is not null and target_status<>'draft' then prior.id else null end
    )
  );

  return new_id;
end;
$$;

create or replace function public.service_record_resource_health_v1(
  target_project uuid,
  target_resource uuid,
  target_health_status text,
  target_source_kind text,
  target_source_key text,
  target_trace_id text,
  target_observed_at timestamptz default now(),
  target_capability uuid default null,
  target_observed_availability text default null,
  target_metrics jsonb default '{}'::jsonb,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  observation_id uuid;
  capability public.capabilities%rowtype;
begin
  if target_health_status not in ('unknown','healthy','degraded','unhealthy') then
    raise exception 'Unsupported Resource health status.';
  end if;
  if target_source_kind not in ('manual','service_probe','runtime_report','provider_status','scheduler') then
    raise exception 'Unsupported Resource health source.';
  end if;
  if target_observed_availability is not null and target_observed_availability not in (
    'AVAILABLE','BUSY','COOLDOWN','EXHAUSTED','UNKNOWN','OFFLINE','DISABLED'
  ) then raise exception 'Unsupported capability availability state.'; end if;
  if nullif(btrim(coalesce(target_source_key,'')),'') is null then raise exception 'Health source key is required.'; end if;
  if nullif(btrim(coalesce(target_trace_id,'')),'') is null then raise exception 'Health trace id is required.'; end if;

  perform private.resource_validate_binding(target_project,target_resource,true);

  if target_capability is not null then
    select * into capability
    from public.capabilities c
    where c.id=target_capability
      and c.project_id=target_project
      and c.resource_id=target_resource;
    if not found then raise exception 'Capability/resource identity mismatch.'; end if;
  end if;

  insert into public.resource_health_observations(
    project_id,resource_id,capability_id,health_status,observed_availability,
    source_kind,source_key,metrics,evidence_reference,trace_id,observed_at
  ) values(
    target_project,target_resource,target_capability,target_health_status,target_observed_availability,
    target_source_kind,btrim(target_source_key),coalesce(target_metrics,'{}'::jsonb),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),
    btrim(target_trace_id),target_observed_at
  )
  on conflict(project_id,resource_id,trace_id) do nothing
  returning id into observation_id;

  if observation_id is null then
    select h.id into observation_id
    from public.resource_health_observations h
    where h.project_id=target_project
      and h.resource_id=target_resource
      and h.trace_id=btrim(target_trace_id);
    return observation_id;
  end if;

  update public.resource_registry
  set health_status=target_health_status,
      health_summary=jsonb_build_object(
        'source_kind',target_source_kind,
        'source_key',btrim(target_source_key),
        'trace_id',btrim(target_trace_id),
        'observed_at',target_observed_at,
        'metrics',coalesce(target_metrics,'{}'::jsonb)
      ),
      last_seen_at=target_observed_at,
      updated_at=now()
  where id=target_resource;

  if target_capability is not null then
    update public.capabilities
    set state=coalesce(target_observed_availability,state),
        observed_at=target_observed_at
    where id=target_capability;
  end if;

  perform private.resource_record_event(
    target_project,'RESOURCE_HEALTH_OBSERVED',target_source_key,
    jsonb_build_object(
      'observation_id',observation_id,'resource_id',target_resource,'capability_id',target_capability,
      'health_status',target_health_status,'availability',target_observed_availability,'trace_id',target_trace_id
    )
  );

  return observation_id;
end;
$$;

create or replace function public.service_resolve_resource_candidates_v1(
  target_project uuid,
  target_capability text,
  target_requested_operation text,
  target_visibility_class text,
  target_trace_id text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  row_record record;
  decisions jsonb:='[]'::jsonb;
  eligible jsonb:='[]'::jsonb;
  outcome text;
  reason_code text;
  active_policy public.sovereign_node_policies%rowtype;
  schedule_mode text;
  start_hour integer;
  end_hour integer;
  current_hour integer;
begin
  if nullif(btrim(coalesce(target_capability,'')),'') is null then raise exception 'Requested capability is required.'; end if;
  perform private.resource_validate_operations(array[target_requested_operation]);
  perform private.resource_validate_visibility_classes(array[target_visibility_class]);

  for row_record in
    select
      c.id capability_id,c.capability,c.state capability_state,c.enabled capability_enabled,
      c.running,c.concurrency_limit,c.account_key,c.connector_kind,
      r.id resource_id,r.resource_key,r.resource_kind,r.display_name,r.enabled resource_enabled,
      r.health_status,r.supported_visibility_classes,r.location_class,r.trust_level,
      b.status binding_status,b.allowed_capabilities
    from public.capabilities c
    join public.resource_registry r on r.id=c.resource_id
    left join public.resource_project_bindings b
      on b.project_id=target_project and b.resource_id=r.id
    where c.project_id=target_project
      and c.capability=target_capability
    order by r.display_name,c.account_key
  loop
    outcome:='eligible';
    reason_code:='eligible';

    if row_record.binding_status is distinct from 'active' then
      outcome:='ineligible';reason_code:='binding_inactive';
    elsif not row_record.resource_enabled then
      outcome:='ineligible';reason_code:='resource_disabled';
    elsif row_record.health_status='unknown' then
      outcome:='review_required';reason_code:='resource_health_unknown';
    elsif row_record.health_status='unhealthy' then
      outcome:='ineligible';reason_code:='resource_unhealthy';
    elsif not (target_visibility_class=any(row_record.supported_visibility_classes)) then
      outcome:='ineligible';reason_code:='visibility_not_supported';
    elsif not row_record.capability_enabled then
      outcome:='ineligible';reason_code:='capability_disabled';
    elsif row_record.capability_state not in ('AVAILABLE','BUSY') then
      outcome:='ineligible';reason_code:='capability_state_ineligible';
    elsif not (row_record.running<row_record.concurrency_limit) then
      outcome:='ineligible';reason_code:='capability_concurrency_exhausted';
    elsif cardinality(row_record.allowed_capabilities)>0
      and not (target_capability=any(row_record.allowed_capabilities)) then
      outcome:='ineligible';reason_code:='binding_capability_not_allowed';
    end if;

    if outcome='eligible' and row_record.resource_kind='local_node' then
      select * into active_policy
      from public.sovereign_node_policies p
      where p.project_id=target_project
        and p.resource_id=row_record.resource_id
        and p.status='active'
      limit 1;

      if not found then
        outcome:='ineligible';reason_code:='sovereign_policy_missing';
      elsif not (target_capability=any(active_policy.allowed_capabilities)) then
        outcome:='ineligible';reason_code:='sovereign_capability_not_allowed';
      elsif target_requested_operation=any(active_policy.prohibited_operations) then
        outcome:='ineligible';reason_code:='sovereign_operation_prohibited';
      elsif not (target_visibility_class=any(active_policy.allowed_visibility_classes)) then
        outcome:='ineligible';reason_code:='visibility_not_supported';
      else
        schedule_mode:=coalesce(active_policy.schedule_policy->>'mode','always');
        if schedule_mode='disabled' then
          outcome:='ineligible';reason_code:='sovereign_schedule_closed';
        elsif schedule_mode='utc_window' then
          begin
            start_hour:=(active_policy.schedule_policy->>'start_hour_utc')::integer;
            end_hour:=(active_policy.schedule_policy->>'end_hour_utc')::integer;
            current_hour:=extract(hour from now() at time zone 'utc')::integer;
            if start_hour=end_hour then
              outcome:='ineligible';reason_code:='sovereign_schedule_closed';
            elsif start_hour<end_hour and not (current_hour>=start_hour and current_hour<end_hour) then
              outcome:='ineligible';reason_code:='sovereign_schedule_closed';
            elsif start_hour>end_hour and not (current_hour>=start_hour or current_hour<end_hour) then
              outcome:='ineligible';reason_code:='sovereign_schedule_closed';
            end if;
          exception when others then
            outcome:='ineligible';reason_code:='sovereign_schedule_closed';
          end;
        elsif schedule_mode<>'always' then
          outcome:='ineligible';reason_code:='sovereign_schedule_closed';
        end if;
      end if;
    end if;

    decisions:=decisions||jsonb_build_array(jsonb_build_object(
      'resource_id',row_record.resource_id,
      'resource_key',row_record.resource_key,
      'resource_kind',row_record.resource_kind,
      'display_name',row_record.display_name,
      'capability_id',row_record.capability_id,
      'capability',row_record.capability,
      'capability_state',row_record.capability_state,
      'health_status',row_record.health_status,
      'location_class',row_record.location_class,
      'trust_level',row_record.trust_level,
      'running',row_record.running,
      'concurrency_limit',row_record.concurrency_limit,
      'outcome',outcome,
      'reason_code',reason_code
    ));

    if outcome='eligible' then
      eligible:=eligible||jsonb_build_array(jsonb_build_object(
        'resource_id',row_record.resource_id,
        'capability_id',row_record.capability_id,
        'resource_key',row_record.resource_key,
        'resource_kind',row_record.resource_kind,
        'account_key',row_record.account_key,
        'connector_kind',row_record.connector_kind
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'project_id',target_project,
    'requested_capability',target_capability,
    'requested_operation',target_requested_operation,
    'visibility_class',target_visibility_class,
    'trace_id',target_trace_id,
    'eligible_candidates',eligible,
    'decisions',decisions,
    'boundaries',jsonb_build_object(
      'creates_reservation',false,
      'creates_capability_lease',false,
      'grants_execution_authority',false,
      'phase_c_policy_required_separately',true,
      'phase_d_authority_required_separately',true
    )
  );
end;
$$;

revoke all on function private.resource_active_member_role(uuid,uuid) from public,anon,authenticated;
revoke all on function private.resource_validate_visibility_classes(text[]) from public,anon,authenticated;
revoke all on function private.resource_validate_operations(text[]) from public,anon,authenticated;
revoke all on function private.resource_validate_binding(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function private.resource_reject_credential_payload(jsonb) from public,anon,authenticated;
revoke all on function private.resource_record_event(uuid,text,text,jsonb) from public,anon,authenticated;

revoke all on function public.get_resource_fabric_workspace_v1(uuid) from public,anon;
revoke all on function public.register_project_resource_v1(uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb,jsonb,text[],uuid) from public,anon;
revoke all on function public.set_resource_project_binding_state_v1(uuid,text,text) from public,anon;
revoke all on function public.upsert_sovereign_node_policy_v1(uuid,uuid,text,text[],jsonb,jsonb,text[],jsonb,text[],jsonb,boolean) from public,anon;
revoke all on function public.service_record_resource_health_v1(uuid,uuid,text,text,text,text,timestamptz,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.service_resolve_resource_candidates_v1(uuid,text,text,text,text) from public,anon,authenticated;

grant execute on function public.get_resource_fabric_workspace_v1(uuid) to authenticated,service_role;
grant execute on function public.register_project_resource_v1(uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb,jsonb,text[],uuid) to authenticated,service_role;
grant execute on function public.set_resource_project_binding_state_v1(uuid,text,text) to authenticated,service_role;
grant execute on function public.upsert_sovereign_node_policy_v1(uuid,uuid,text,text[],jsonb,jsonb,text[],jsonb,text[],jsonb,boolean) to authenticated,service_role;
grant execute on function public.service_record_resource_health_v1(uuid,uuid,text,text,text,text,timestamptz,uuid,text,jsonb,text) to service_role;
grant execute on function public.service_resolve_resource_candidates_v1(uuid,text,text,text,text) to service_role;

commit;
