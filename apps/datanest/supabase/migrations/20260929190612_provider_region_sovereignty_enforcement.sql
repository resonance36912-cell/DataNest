begin;


create or replace function public.service_set_ai_provider_processing_region_v1(
  target_project uuid,
  target_user uuid,
  target_connection uuid,
  target_processing_region text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  normalized_region text:=nullif(lower(btrim(coalesce(target_processing_region,''))),'');
  connection_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if normalized_region is not null and normalized_region !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'Processing region must be a normalized provider region identifier.';
  end if;

  update public.ai_provider_connections c
  set metadata=case
        when normalized_region is null then c.metadata-'processing_region'-'processing_region_declared_at'
        else c.metadata || jsonb_build_object(
          'processing_region',normalized_region,
          'processing_region_declared_at',now()
        )
      end,
      updated_at=now()
  where c.id=target_connection
    and c.project_id=target_project
    and c.user_id=target_user
  returning c.id into connection_id;

  if connection_id is null then
    raise exception 'AI provider connection not found for this project and user.';
  end if;

  return jsonb_build_object(
    'id',connection_id,
    'processing_region',normalized_region
  );
end;
$$;

create or replace function public.service_set_shared_ai_provider_processing_region_v1(
  target_project uuid,
  target_actor uuid,
  target_processing_region text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  normalized_region text:=nullif(lower(btrim(coalesce(target_processing_region,''))),'');
  cfg public.ai_shared_provider_configs%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id=target_project
      and pm.user_id=target_actor
      and pm.status='active'
      and pm.role in ('owner','admin')
  ) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if normalized_region is not null and normalized_region !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'Processing region must be a normalized provider region identifier.';
  end if;

  select * into cfg
  from public.ai_shared_provider_configs
  where project_id=target_project
  for update;

  if not found then
    raise exception 'Project-shared provider is not configured.';
  end if;

  update public.ai_shared_provider_configs c
  set metadata=case
        when normalized_region is null then c.metadata-'processing_region'-'processing_region_declared_at'
        else c.metadata || jsonb_build_object(
          'processing_region',normalized_region,
          'processing_region_declared_at',now()
        )
      end,
      updated_by=target_actor,
      updated_at=now()
  where c.id=cfg.id;

  update public.ai_provider_connections c
  set metadata=case
        when normalized_region is null then c.metadata-'processing_region'-'processing_region_declared_at'
        else c.metadata || jsonb_build_object(
          'processing_region',normalized_region,
          'processing_region_declared_at',now()
        )
      end,
      updated_at=now()
  where c.project_id=target_project
    and c.metadata->>'scope'='project_shared_copy'
    and c.metadata->>'shared_config_id'=cfg.id::text;

  return jsonb_build_object(
    'id',cfg.id,
    'processing_region',normalized_region
  );
end;
$$;

revoke all on function public.service_set_ai_provider_processing_region_v1(uuid,uuid,uuid,text)
from public,anon,authenticated;
grant execute on function public.service_set_ai_provider_processing_region_v1(uuid,uuid,uuid,text)
to service_role;

revoke all on function public.service_set_shared_ai_provider_processing_region_v1(uuid,uuid,text)
from public,anon,authenticated;
grant execute on function public.service_set_shared_ai_provider_processing_region_v1(uuid,uuid,text)
to service_role;


CREATE OR REPLACE FUNCTION public.service_evaluate_data_policy_v1(target_project uuid, target_actor_user uuid, target_subject_type text, target_purpose text, target_requested_operation text, target_trace_id text, target_subject_id uuid DEFAULT NULL::uuid, target_subject_reference text DEFAULT NULL::text, target_provider_connection uuid DEFAULT NULL::uuid, target_provider_key text DEFAULT NULL::text, target_hard_learning_exclusion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
declare
  policy jsonb;
  profile public.provider_trust_profiles%rowtype;
  rollout_manifest public.trust_manifests%rowtype;
  outcome text:='allow';
  reason_code text:='policy_allow';
  decision_trace text:=coalesce(nullif(btrim(coalesce(target_trace_id,'')),''),'DN-POL-'||replace(gen_random_uuid()::text,'-',''));
  decision_record_id uuid;
  visibility text;
  reuse_state text;
  publication_allowed boolean;
  lineage jsonb;
  hold_count integer:=0;
  enforcement_mode text:='report_only';
  resolved_provider_key text;
  manifest_id uuid;
  binding_id uuid;
  retention_policy_id uuid;
  provider_processing_region text;
begin
  if target_purpose not in (
    'job_execution','user_requested_analysis','certification_review','project_learning','platform_learning',
    'product_operation','external_provider_processing','publication','audit','security_investigation','export','retention_management'
  ) then
    raise exception 'Unsupported data policy purpose.';
  end if;
  if target_requested_operation not in ('process','reuse','publish','export','audit','future_disposition') then
    raise exception 'Unsupported data policy operation.';
  end if;

  perform private.trust_validate_subject(target_project,target_subject_type,target_subject_id,target_subject_reference);
  policy:=private.trust_resolve_effective_policy(target_project,target_subject_type,target_subject_id,target_subject_reference);
  visibility:=policy->>'visibility_class';
  reuse_state:=policy->>'reuse_state';
  publication_allowed:=coalesce((policy->>'publication_authorized')::boolean,false);
  binding_id:=nullif(policy->>'binding_id','')::uuid;
  manifest_id:=nullif(policy->>'manifest_id','')::uuid;

  if manifest_id is not null then
    select * into rollout_manifest from public.trust_manifests where id=manifest_id;
  end if;
  if rollout_manifest.id is null then
    select * into rollout_manifest
    from public.trust_manifests
    where project_id=target_project and scope_type='project' and status='active'
    order by version desc
    limit 1;
  end if;
  if rollout_manifest.id is not null then
    enforcement_mode:=rollout_manifest.enforcement_mode;
    retention_policy_id:=rollout_manifest.retention_policy_id;
  end if;

  if not coalesce((policy->>'resolved')::boolean,false)
     and (
       target_provider_connection is not null
       or target_purpose in ('external_provider_processing','project_learning','platform_learning','publication','retention_management')
       or target_requested_operation in ('reuse','publish','future_disposition')
     ) then
    outcome:='review_required'; reason_code:='policy_unresolved';
  end if;

  if target_provider_connection is not null then
    resolved_provider_key:=private.trust_provider_key_for_connection(target_project,target_provider_connection);
    select nullif(lower(btrim(coalesce(c.metadata->>'processing_region',''))),'')
      into provider_processing_region
    from public.ai_provider_connections c
    where c.id=target_provider_connection
      and c.project_id=target_project;

    if nullif(btrim(coalesce(target_provider_key,'')),'') is not null
       and lower(btrim(target_provider_key))<>resolved_provider_key then
      outcome:='deny'; reason_code:='provider_key_mismatch';
    elsif outcome='allow' and visibility='local_only' then
      outcome:='deny'; reason_code:='local_only_external_denied';
    elsif outcome='allow'
       and rollout_manifest.id is not null
       and rollout_manifest.enforcement_mode='enforced'
       and not (resolved_provider_key=any(rollout_manifest.approved_provider_keys)) then
      outcome:='deny'; reason_code:='provider_not_manifest_approved';
    elsif outcome='allow' then
      select * into profile
      from public.provider_trust_profiles pp
      where pp.project_id=target_project
        and pp.provider_connection_id=target_provider_connection
        and pp.provider_key=resolved_provider_key
      order by pp.created_at desc
      limit 1;

      if not found then
        outcome:='deny'; reason_code:='provider_profile_missing';
      elsif profile.status not in ('active','restricted') or (profile.review_due_at is not null and profile.review_due_at<=now()) then
        outcome:='deny'; reason_code:='provider_profile_inactive';
      elsif not (visibility=any(profile.allowed_visibility_classes)) then
        outcome:='deny'; reason_code:='provider_visibility_denied';
      elsif target_purpose=any(profile.prohibited_purposes) or not (target_purpose=any(profile.allowed_purposes)) then
        outcome:='deny'; reason_code:='provider_purpose_denied';
      elsif cardinality(profile.allowed_regions)>0 and provider_processing_region is null then
        if enforcement_mode='enforced' then
          outcome:='deny';
        end if;
        if outcome='allow' then
          reason_code:='provider_region_unresolved';
        end if;
      elsif cardinality(profile.allowed_regions)>0 and not exists (
        select 1
        from unnest(profile.allowed_regions) region_name
        where lower(btrim(region_name))=provider_processing_region
      ) then
        if enforcement_mode='enforced' then
          outcome:='deny';
        end if;
        if outcome='allow' then
          reason_code:='provider_region_denied';
        end if;
      end if;
    end if;
  end if;

  if outcome='allow' and target_hard_learning_exclusion
     and (target_purpose in ('project_learning','platform_learning') or target_requested_operation='reuse') then
    outcome:='deny'; reason_code:='hard_learning_exclusion';
  end if;

  if outcome='allow' and target_purpose='project_learning' and reuse_state<>'project_learning_eligible' then
    outcome:='deny'; reason_code:='project_learning_not_authorized';
  end if;

  if outcome='allow' and target_purpose='platform_learning' and reuse_state<>'platform_learning_eligible' then
    outcome:='deny'; reason_code:='platform_learning_not_authorized';
  end if;

  if outcome='allow' and (target_purpose='publication' or target_requested_operation='publish')
     and (visibility<>'public' or not publication_allowed) then
    outcome:='deny'; reason_code:='publication_not_authorized';
  end if;

  if target_requested_operation='future_disposition' then
    select count(*)::integer into hold_count
    from public.retention_holds h
    where h.project_id=target_project and h.subject_type=target_subject_type and h.status='active'
      and coalesce(h.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(target_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(h.subject_reference,'')=coalesce(target_subject_reference,'');

    if hold_count>0 then
      outcome:='deny'; reason_code:='retention_hold_active';
    elsif outcome='allow' then
      lineage:=private.trust_lineage_state(target_project,target_subject_type,target_subject_id,target_subject_reference);
      if not coalesce((lineage->>'known')::boolean,false) then
        outcome:='review_required'; reason_code:='lineage_review_unresolved';
      end if;
    end if;
  end if;

  insert into public.data_policy_decisions(
    project_id,trace_id,actor_user_id,subject_type,subject_id,subject_reference,
    purpose,requested_operation,outcome,reason_code,effective_visibility_class,effective_reuse_state,
    publication_authorized,manifest_id,binding_id,provider_profile_id,retention_policy_id,
    enforcement_mode,policy_version
  ) values(
    target_project,decision_trace,target_actor_user,target_subject_type,target_subject_id,target_subject_reference,
    target_purpose,target_requested_operation,outcome,reason_code,visibility,reuse_state,
    publication_allowed,coalesce(manifest_id,rollout_manifest.id),binding_id,profile.id,retention_policy_id,
    enforcement_mode,coalesce(policy->>'policy_version','unresolved')
  )
  on conflict(project_id,trace_id,purpose,requested_operation) do nothing
  returning id into decision_record_id;

  if decision_record_id is null then
    select id into decision_record_id
    from public.data_policy_decisions
    where project_id=target_project
      and trace_id=decision_trace
      and purpose=target_purpose
      and requested_operation=target_requested_operation;
  end if;

  perform private.record_trust_policy_event(
    target_project,'DATA_POLICY_EVALUATED',target_actor_user,
    jsonb_build_object(
      'decision_trace',decision_trace,
      'decision_record_id',decision_record_id,
      'subject_type',target_subject_type,
      'subject_id',target_subject_id,
      'subject_reference',target_subject_reference,
      'purpose',target_purpose,
      'operation',target_requested_operation,
      'outcome',outcome,
      'reason_code',reason_code,
      'visibility_class',visibility,
      'reuse_state',reuse_state,
      'binding_id',binding_id,
      'manifest_id',coalesce(manifest_id,rollout_manifest.id),
      'provider_profile_id',profile.id,
      'provider_processing_region',provider_processing_region,
      'provider_allowed_regions',coalesce(to_jsonb(profile.allowed_regions),'[]'::jsonb),
      'retention_policy_id',retention_policy_id,
      'retention_hold_count',hold_count,
      'enforcement_mode',enforcement_mode,
      'policy_version',policy->>'policy_version'
    )
  );

  return jsonb_build_object(
    'outcome',outcome,
    'reason_code',reason_code,
    'visibility_class',visibility,
    'reuse_state',reuse_state,
    'publication_authorized',publication_allowed,
    'binding_id',binding_id,
    'manifest_id',coalesce(manifest_id,rollout_manifest.id),
    'manifest_version',coalesce((policy->>'manifest_version')::integer,rollout_manifest.version),
    'provider_profile_id',profile.id,
    'provider_processing_region',provider_processing_region,
    'provider_allowed_regions',coalesce(to_jsonb(profile.allowed_regions),'[]'::jsonb),
    'retention_policy_id',retention_policy_id,
    'retention_hold_count',hold_count,
    'policy_version',policy->>'policy_version',
    'enforcement_mode',enforcement_mode,
    'decision_trace',decision_trace,
    'decision_record_id',decision_record_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.service_sync_shared_ai_provider_connection_v1(target_project uuid, target_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'auth'
AS $function$
declare
  cfg public.ai_shared_provider_configs%rowtype;
  existing public.ai_provider_connections%rowtype;
  shared_secret text; sid uuid; cid uuid; cfg_stamp text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if not exists (
    select 1 from public.project_members pm
    where pm.project_id=target_project and pm.user_id=target_user and pm.status='active'
  ) and not exists (
    select 1 from public.stakeholder_profiles sp
    where sp.project_id=target_project and sp.user_id=target_user and sp.status='active'
  ) then return null; end if;
  select * into cfg from public.ai_shared_provider_configs
  where project_id=target_project and status='active' limit 1;
  if not found then return null; end if;
  if not exists (
    select 1 from public.ai_provider_domain_allowlist al
    where al.project_id=target_project and al.hostname=cfg.endpoint_host and al.active=true
  ) then return null; end if;
  select decrypted_secret into shared_secret from vault.decrypted_secrets where id=cfg.secret_id;
  if nullif(shared_secret,'') is null then return null; end if;
  cfg_stamp:=cfg.updated_at::text;
  select * into existing from public.ai_provider_connections
  where project_id=target_project and user_id=target_user and metadata->>'scope'='project_shared_copy'
  order by updated_at desc limit 1 for update;
  if found then
    if coalesce(existing.metadata->>'shared_config_updated_at','')<>cfg_stamp
       or existing.provider<>cfg.provider or existing.label<>cfg.label
       or existing.api_base_url<>cfg.api_base_url or existing.endpoint_host<>cfg.endpoint_host
       or existing.model<>cfg.model or existing.status<>'active'
       or coalesce(existing.metadata->>'processing_region','')<>coalesce(nullif(lower(btrim(coalesce(cfg.metadata->>'processing_region',''))),'') ,'') then
      perform vault.update_secret(existing.secret_id,shared_secret,'datanest-ai-'||existing.id::text,
        'Encrypted DataNest project-shared AI provider copy',null);
      update public.ai_provider_connections
      set provider=cfg.provider,label=cfg.label,api_base_url=cfg.api_base_url,
          endpoint_host=cfg.endpoint_host,model=cfg.model,status='active',last_error=null,
          last_rotated_at=cfg.last_rotated_at,
          metadata=metadata || jsonb_build_object(
            'scope','project_shared_copy','shared_config_id',cfg.id,
            'shared_config_updated_at',cfg_stamp,'managed_by','datanest',
            'processing_region',nullif(lower(btrim(coalesce(cfg.metadata->>'processing_region',''))),'')
          ),updated_at=now()
      where id=existing.id returning id into cid;
    else cid:=existing.id; end if;
  else
    sid:=vault.create_secret(shared_secret,'datanest-ai-'||gen_random_uuid()::text,
      'Encrypted DataNest project-shared AI provider copy',null);
    insert into public.ai_provider_connections(
      project_id,user_id,provider,label,api_base_url,endpoint_host,model,secret_id,
      status,is_default,last_rotated_at,metadata
    ) values(
      target_project,target_user,cfg.provider,cfg.label,cfg.api_base_url,cfg.endpoint_host,
      cfg.model,sid,'active',true,cfg.last_rotated_at,
      jsonb_build_object(
        'scope','project_shared_copy','shared_config_id',cfg.id,
        'shared_config_updated_at',cfg_stamp,'managed_by','datanest',
        'processing_region',nullif(lower(btrim(coalesce(cfg.metadata->>'processing_region',''))),'')
      )
    ) returning id into cid;
    update public.ai_provider_connections set is_default=(id=cid)
    where project_id=target_project and user_id=target_user;
  end if;
  return (
    select jsonb_build_object(
      'id',c.id,'provider',c.provider,'label',c.label,'api_base_url',c.api_base_url,
      'endpoint_host',c.endpoint_host,'model',c.model,'metadata',c.metadata,
      'secret',v.decrypted_secret
    )
    from public.ai_provider_connections c
    join vault.decrypted_secrets v on v.id=c.secret_id
    where c.id=cid
  );
end;
$function$
;


revoke all on function public.service_evaluate_data_policy_v1(uuid,uuid,text,text,text,text,uuid,text,uuid,text,boolean)
from public,anon,authenticated;
grant execute on function public.service_evaluate_data_policy_v1(uuid,uuid,text,text,text,text,uuid,text,uuid,text,boolean)
to service_role;

revoke all on function public.service_sync_shared_ai_provider_connection_v1(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.service_sync_shared_ai_provider_connection_v1(uuid,uuid)
to service_role;


commit;
