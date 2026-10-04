begin;

-- Avoid relying on PL/pgSQL FOUND across conditional manifest lookups.
-- If no manifest exists, keep enforcement_mode at its report_only default
-- instead of assigning NULL into data_policy_decisions.enforcement_mode.
create or replace function public.service_evaluate_data_policy_v1(
  target_project uuid,
  target_actor_user uuid,
  target_subject_type text,
  target_purpose text,
  target_requested_operation text,
  target_trace_id text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_provider_connection uuid default null,
  target_provider_key text default null,
  target_hard_learning_exclusion boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
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
    'retention_policy_id',retention_policy_id,
    'retention_hold_count',hold_count,
    'policy_version',policy->>'policy_version',
    'enforcement_mode',enforcement_mode,
    'decision_trace',decision_trace,
    'decision_record_id',decision_record_id
  );
end;
$$;

commit;
