begin;

-- Canonical Phase D V2 authority operations.
-- Legacy V1 functions remain compatibility/history paths and are not redefined here.

alter table public.authority_envelopes
  add column version integer not null default 1,
  add column proposed_by uuid references auth.users(id) on delete set null;

update public.authority_envelopes
set proposed_by=created_by
where proposed_by is null;

alter table public.capability_leases
  drop constraint if exists capability_leases_allowed_operations_check,
  alter column job_id drop not null,
  alter column capability_id drop not null,
  add column consumed_operation_count integer not null default 0;

update public.capability_leases
set consumed_operation_count=least(used_operations,max_operations)
where consumed_operation_count=0 and used_operations>0;

alter table public.capability_leases
  add constraint capability_leases_consumed_operation_count_check
    check (consumed_operation_count>=0 and consumed_operation_count<=max_operations);

alter table public.execution_authority_decisions
  drop constraint if exists execution_authority_decisions_requested_operation_check,
  drop constraint if exists execution_authority_decisions_outcome_check,
  add constraint execution_authority_decisions_requested_operation_check
    check (length(btrim(requested_operation))>0),
  add constraint execution_authority_decisions_outcome_check
    check (outcome in ('allow','deny','review_required','paused','exhausted'));

drop index if exists public.execution_authority_decisions_idempotency_uidx;

create unique index execution_authority_decisions_legacy_idempotency_uidx
  on public.execution_authority_decisions(project_id,trace_id,requested_operation)
  where route_key is null;

create unique index execution_authority_decisions_canonical_idempotency_uidx
  on public.execution_authority_decisions(project_id,trace_id,route_key,requested_operation)
  where route_key is not null;

create or replace function private.authority_autonomy_rank(
  target_autonomy text
) returns integer
language sql
immutable
set search_path=pg_catalog
as $$
  select case target_autonomy
    when 'A0' then 0
    when 'A1' then 1
    when 'A2' then 2
    when 'A3' then 3
    when 'A4' then 4
    else -1
  end;
$$;

create or replace function private.authority_minimum_autonomy(
  target_consequence text
) returns text
language sql
immutable
set search_path=pg_catalog
as $$
  select case target_consequence
    when 'read_only' then 'A0'
    when 'advisory' then 'A1'
    when 'preparatory' then 'A2'
    when 'reversible_write' then 'A3'
    when 'external_communication' then 'A3'
    when 'externally_visible_change' then 'A3'
    when 'resource_execution' then 'A3'
    when 'production_change' then 'A4'
    when 'destructive' then 'A4'
    when 'legal_commitment' then 'A4'
    when 'financial_commitment' then 'A4'
    when 'ownership_or_governance' then 'A4'
    when 'constitutional' then 'A4'
    else null
  end;
$$;

create or replace function private.authority_breaker_category(
  target_consequence text
) returns text
language sql
immutable
set search_path=pg_catalog
as $$
  select case target_consequence
    when 'reversible_write' then 'autonomous_writes'
    when 'externally_visible_change' then 'autonomous_writes'
    when 'external_communication' then 'external_communications'
    when 'production_change' then 'deployments'
    when 'resource_execution' then 'resource_execution'
    when 'destructive' then 'resource_execution'
    else null
  end;
$$;

create or replace function private.authority_route_mode(
  target_project uuid,
  target_route_key text
) returns text
language sql
stable
security definer
set search_path=public,private
as $$
  select coalesce((
    select case
      when sp.value->>'mode' in ('report_only','enforced') then sp.value->>'mode'
      else 'report_only'
    end
    from public.scheduler_policies sp
    where sp.project_id=target_project
      and sp.policy_key='authority_execution:'||target_route_key
    limit 1
  ),'report_only');
$$;

create or replace function private.authority_validate_consequence_scope(
  target_autonomy text,
  target_consequences text[]
) returns void
language plpgsql
immutable
set search_path=private,pg_catalog
as $$
declare
  consequence text;
  minimum_autonomy text;
begin
  if private.authority_autonomy_rank(target_autonomy)<0 then
    raise exception 'Unsupported autonomy level.';
  end if;

  if cardinality(coalesce(target_consequences,'{}'::text[]))=0 then
    raise exception 'At least one consequence class is required.';
  end if;

  foreach consequence in array target_consequences
  loop
    minimum_autonomy:=private.authority_minimum_autonomy(consequence);
    if minimum_autonomy is null then
      raise exception 'Unsupported consequence class: %',consequence;
    end if;
    if private.authority_autonomy_rank(target_autonomy)
       < private.authority_autonomy_rank(minimum_autonomy) then
      raise exception 'Requested autonomy is below the minimum autonomy for consequence class %.',consequence;
    end if;
  end loop;
end;
$$;

revoke all on function private.authority_autonomy_rank(text) from public,anon,authenticated;
revoke all on function private.authority_minimum_autonomy(text) from public,anon,authenticated;
revoke all on function private.authority_breaker_category(text) from public,anon,authenticated;
revoke all on function private.authority_route_mode(uuid,text) from public,anon,authenticated;
revoke all on function private.authority_validate_consequence_scope(text,text[]) from public,anon,authenticated;

create or replace function public.propose_authority_envelope_v2(
  target_project uuid,
  target_actor_type text,
  target_actor_reference text,
  target_accountable_human_user uuid,
  target_purpose text,
  target_requested_autonomy text,
  target_allowed_consequence_classes text[],
  target_allowed_operation_keys text[],
  target_rationale text,
  target_product uuid default null,
  target_job uuid default null,
  target_allowed_capability_keys text[] default '{}'::text[],
  target_allowed_tool_keys text[] default '{}'::text[],
  target_allowed_target_types text[] default '{}'::text[],
  target_allowed_target_references text[] default '{}'::text[],
  target_allowed_data_classes text[] default '{}'::text[],
  target_allowed_purposes text[] default '{}'::text[],
  target_allowed_provider_keys text[] default '{}'::text[],
  target_valid_from timestamptz default null,
  target_expires_at timestamptz default null,
  target_limits jsonb default '{}'::jsonb,
  target_reversibility text default 'reversible',
  target_require_capability_lease boolean default true,
  target_require_independent_approval boolean default false,
  target_exact_evidence_identity text default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  consequence_classes text[];
  operation_keys text[];
  capability_keys text[];
  tool_keys text[];
  target_types text[];
  target_references text[];
  data_classes text[];
  purpose_values text[];
  provider_keys text[];
  next_version integer;
  new_id uuid;
  effective_from_value timestamptz:=coalesce(target_valid_from,now());
  max_operation_count_value integer;
  max_concurrent_executions_value integer;
  max_external_calls_value integer;
  max_retry_count_value integer;
  max_runtime_seconds_value integer;
  max_target_count_value integer;
  max_file_change_count_value integer;
  max_external_recipients_value integer;
  resource_limits_value jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  caller_role:=private.execution_active_member_role(target_project,caller);
  if caller_role not in ('owner','admin','operator') then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  if target_requested_autonomy='A4' and caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='A4 proposal requires owner or admin authority.';
  end if;
  if target_actor_type not in ('human','agent','application','model','service','workflow') then
    raise exception 'Unsupported actor type.';
  end if;
  if nullif(btrim(coalesce(target_actor_reference,'')),'') is null then
    raise exception 'Actor reference is required.';
  end if;
  if nullif(btrim(coalesce(target_purpose,'')),'') is null then
    raise exception 'Purpose is required.';
  end if;
  if nullif(btrim(coalesce(target_rationale,'')),'') is null then
    raise exception 'Authority rationale is required.';
  end if;
  if target_reversibility not in ('read_only','reversible','compensatable','conditionally_reversible','irreversible') then
    raise exception 'Unsupported reversibility state.';
  end if;
  if target_expires_at is null or target_expires_at<=effective_from_value then
    raise exception 'Authority Envelope requires an expiry after its effective time.';
  end if;
  if private.execution_active_member_role(target_project,target_accountable_human_user) is null then
    raise exception 'Accountable human sponsor must be a current active project member.';
  end if;
  if target_product is not null and not exists(
    select 1 from public.products p where p.id=target_product and p.project_id=target_project
  ) then
    raise exception 'Product/project identity mismatch.';
  end if;
  if target_job is not null and not exists(
    select 1 from public.jobs j where j.id=target_job and j.project_id=target_project
  ) then
    raise exception 'Job/project identity mismatch.';
  end if;
  if target_limits ? 'max_cost_minor' then
    raise exception 'Phase D does not accept monetary limits without an authoritative pricing unit.';
  end if;

  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into consequence_classes from unnest(coalesce(target_allowed_consequence_classes,'{}'::text[])) v;
  select coalesce(array_agg(distinct btrim(v)) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into operation_keys from unnest(coalesce(target_allowed_operation_keys,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into capability_keys from unnest(coalesce(target_allowed_capability_keys,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into tool_keys from unnest(coalesce(target_allowed_tool_keys,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into target_types from unnest(coalesce(target_allowed_target_types,'{}'::text[])) v;
  select coalesce(array_agg(distinct btrim(v)) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into target_references from unnest(coalesce(target_allowed_target_references,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into data_classes from unnest(coalesce(target_allowed_data_classes,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into purpose_values from unnest(coalesce(target_allowed_purposes,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into provider_keys from unnest(coalesce(target_allowed_provider_keys,'{}'::text[])) v;

  if cardinality(operation_keys)=0 then raise exception 'At least one allowed operation key is required.'; end if;
  if cardinality(purpose_values)=0 then purpose_values:=array[lower(btrim(target_purpose))]; end if;

  perform private.authority_validate_consequence_scope(target_requested_autonomy,consequence_classes);

  max_operation_count_value:=nullif(target_limits->>'max_operation_count','')::integer;
  max_concurrent_executions_value:=nullif(target_limits->>'max_concurrent_executions','')::integer;
  max_external_calls_value:=nullif(target_limits->>'max_external_calls','')::integer;
  max_retry_count_value:=nullif(target_limits->>'max_retry_count','')::integer;
  max_runtime_seconds_value:=nullif(target_limits->>'max_runtime_seconds','')::integer;
  max_target_count_value:=nullif(target_limits->>'max_target_count','')::integer;
  max_file_change_count_value:=nullif(target_limits->>'max_file_change_count','')::integer;
  max_external_recipients_value:=nullif(target_limits->>'max_external_recipients','')::integer;
  resource_limits_value:=coalesce(target_limits->'resource_limits','{}'::jsonb);

  if jsonb_typeof(resource_limits_value)<>'object' then
    raise exception 'resource_limits must be a JSON object.';
  end if;
  if coalesce(max_operation_count_value,1)<=0
     or coalesce(max_concurrent_executions_value,1)<=0
     or coalesce(max_external_calls_value,1)<=0
     or coalesce(max_retry_count_value,1)<=0
     or coalesce(max_runtime_seconds_value,1)<=0
     or coalesce(max_target_count_value,1)<=0
     or coalesce(max_file_change_count_value,1)<=0
     or coalesce(max_external_recipients_value,1)<=0 then
    raise exception 'Authority limits must be positive when supplied.';
  end if;

  select coalesce(max(e.version),0)+1
    into next_version
  from public.authority_envelopes e
  where e.project_id=target_project
    and coalesce(e.product_id,'00000000-0000-0000-0000-000000000000'::uuid)
        =coalesce(target_product,'00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(e.job_id,'00000000-0000-0000-0000-000000000000'::uuid)
        =coalesce(target_job,'00000000-0000-0000-0000-000000000000'::uuid)
    and e.actor_type=target_actor_type
    and e.actor_key=btrim(target_actor_reference);

  insert into public.authority_envelopes(
    project_id,product_id,job_id,actor_type,actor_user_id,actor_key,sponsor_user_id,
    purpose,autonomy_level,permitted_capabilities,permitted_operations,data_scope,resource_ceiling,
    reversibility,evidence_requirements,approval_state,trace_key,effective_from,expires_at,
    created_by,version,proposed_by,status,requested_autonomy,granted_autonomy,
    allowed_consequence_classes,allowed_operation_keys,allowed_tool_keys,allowed_target_types,
    allowed_target_references,allowed_data_classes,allowed_purposes,allowed_provider_keys,
    max_operation_count,max_concurrent_executions,max_external_calls,max_retry_count,
    max_runtime_seconds,max_target_count,max_file_change_count,max_external_recipients,
    resource_limits,require_capability_lease,require_independent_approval,exact_evidence_identity,
    evidence_reference,status_reason
  ) values(
    target_project,target_product,target_job,target_actor_type,
    case when target_actor_type='human' then target_accountable_human_user else null end,
    btrim(target_actor_reference),target_accountable_human_user,btrim(target_purpose),
    target_requested_autonomy,capability_keys,'{}'::text[],
    jsonb_build_object('allowed_data_classes',data_classes),'{}'::jsonb,
    target_reversibility,
    jsonb_build_object('rationale',btrim(target_rationale),'evidence_reference',nullif(btrim(coalesce(target_evidence_reference,'')),'')),
    'draft','AUTH2-'||replace(gen_random_uuid()::text,'-',''),effective_from_value,target_expires_at,
    caller,next_version,caller,'proposed',target_requested_autonomy,null,
    consequence_classes,operation_keys,tool_keys,target_types,target_references,data_classes,purpose_values,provider_keys,
    max_operation_count_value,max_concurrent_executions_value,max_external_calls_value,max_retry_count_value,
    max_runtime_seconds_value,max_target_count_value,max_file_change_count_value,max_external_recipients_value,
    resource_limits_value,target_require_capability_lease,target_require_independent_approval,
    nullif(btrim(coalesce(target_exact_evidence_identity,'')),''),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),null
  ) returning id into new_id;

  perform private.execution_record_event(
    target_project,target_job,'AUTHORITY_ENVELOPE_PROPOSED',caller::text,
    jsonb_build_object('authority_envelope_id',new_id,'version',next_version,'requested_autonomy',target_requested_autonomy,'consequence_classes',consequence_classes)
  );

  return new_id;
end;
$$;

create or replace function public.approve_authority_envelope_v2(
  target_envelope uuid,
  target_granted_autonomy text,
  target_conditions jsonb default '{}'::jsonb,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  envelope public.authority_envelopes%rowtype;
  consequence text;
  minimum_autonomy text;
  independent_required boolean;
  approval_kind text;
  approval_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found then raise exception 'Authority Envelope not found.'; end if;
  if envelope.status<>'proposed' then raise exception 'Only proposed canonical Authority Envelopes may be approved.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin authority is required.';
  end if;
  if private.authority_autonomy_rank(target_granted_autonomy)<0 then
    raise exception 'Unsupported granted autonomy.';
  end if;
  if private.authority_autonomy_rank(target_granted_autonomy)>private.authority_autonomy_rank(envelope.requested_autonomy) then
    raise exception 'Granted autonomy cannot exceed requested autonomy.';
  end if;

  foreach consequence in array envelope.allowed_consequence_classes
  loop
    minimum_autonomy:=private.authority_minimum_autonomy(consequence);
    if private.authority_autonomy_rank(target_granted_autonomy)<private.authority_autonomy_rank(minimum_autonomy) then
      raise exception 'Granted autonomy is below the minimum autonomy for consequence class %.',consequence;
    end if;
  end loop;

  independent_required:=envelope.require_independent_approval
    or envelope.requested_autonomy='A4'
    or exists(
      select 1 from unnest(envelope.allowed_consequence_classes) consequence_value
      where private.authority_minimum_autonomy(consequence_value)='A4'
    );

  if independent_required and envelope.proposed_by=caller then
    raise exception 'The proposer cannot approve their own independent or A4 authority widening.';
  end if;

  if envelope.expires_at<=now() then raise exception 'Authority Envelope has expired.'; end if;
  approval_kind:=case when independent_required then 'independent' else 'ordinary' end;

  insert into public.authority_approvals(
    project_id,authority_envelope_id,approval_type,status,approver_user_id,job_id,
    conditions,evidence_reference,expires_at
  ) values(
    envelope.project_id,envelope.id,approval_kind,'approved',caller,envelope.job_id,
    coalesce(target_conditions,'{}'::jsonb),nullif(btrim(coalesce(target_evidence_reference,'')),''),
    envelope.expires_at
  ) returning id into approval_id;

  update public.authority_envelopes
  set status='approved',
      approval_state='approved',
      granted_autonomy=target_granted_autonomy,
      approved_by=caller,
      approved_at=now(),
      evidence_reference=coalesce(nullif(btrim(coalesce(target_evidence_reference,'')),''),evidence_reference),
      status_reason='Approved; separate activation is still required.'
  where id=envelope.id;

  perform private.execution_record_event(
    envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_APPROVED',caller::text,
    jsonb_build_object('authority_envelope_id',envelope.id,'approval_id',approval_id,'approval_type',approval_kind,'granted_autonomy',target_granted_autonomy)
  );
  return envelope.id;
end;
$$;

create or replace function public.activate_authority_envelope_v2(
  target_envelope uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  envelope public.authority_envelopes%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found then raise exception 'Authority Envelope not found.'; end if;
  if envelope.status<>'approved' then raise exception 'Only approved canonical Authority Envelopes may be activated.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin authority is required.';
  end if;
  if envelope.expires_at<=now() then raise exception 'Authority Envelope has expired.'; end if;
  if cardinality(envelope.allowed_consequence_classes)=0 then
    raise exception 'Legacy V1 authority has no canonical consequence scope and cannot be activated directly.';
  end if;
  if not exists(
    select 1 from public.authority_approvals a
    where a.authority_envelope_id=envelope.id
      and a.status='approved'
      and (a.expires_at is null or a.expires_at>now())
      and (
        not envelope.require_independent_approval
        or a.approval_type='independent'
      )
  ) then
    raise exception 'Active canonical authority requires a current governed approval.';
  end if;

  update public.authority_envelopes
  set status='active',
      effective_from=greatest(coalesce(effective_from,now()),now()),
      status_reason='Canonical authority active.'
  where id=envelope.id;

  perform private.execution_record_event(
    envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_ACTIVATED',caller::text,
    jsonb_build_object('authority_envelope_id',envelope.id,'version',envelope.version)
  );
  return envelope.id;
end;
$$;

create or replace function public.reject_authority_envelope_v2(
  target_envelope uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); envelope public.authority_envelopes%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found or envelope.status<>'proposed' then raise exception 'Proposed Authority Envelope not found.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  update public.authority_envelopes
  set status='rejected',approval_state='rejected',status_reason=btrim(coalesce(target_reason,'Rejected.'))
  where id=envelope.id;
  perform private.execution_record_event(envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_REJECTED',caller::text,jsonb_build_object('authority_envelope_id',envelope.id,'reason',target_reason));
  return envelope.id;
end;
$$;

create or replace function public.pause_authority_envelope_v2(
  target_envelope uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); envelope public.authority_envelopes%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found or envelope.status<>'active' then raise exception 'Active Authority Envelope not found.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  update public.authority_envelopes set status='paused',status_reason=btrim(coalesce(target_reason,'Paused.')) where id=envelope.id;
  perform private.execution_record_event(envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_PAUSED',caller::text,jsonb_build_object('authority_envelope_id',envelope.id,'reason',target_reason));
  return envelope.id;
end;
$$;

create or replace function public.revoke_authority_envelope_v2(
  target_envelope uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); envelope public.authority_envelopes%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found or envelope.status not in ('approved','active','paused') then raise exception 'Revocable Authority Envelope not found.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  update public.authority_envelopes
  set status='revoked',approval_state='revoked',revoked_by=caller,revoked_at=now(),revocation_reason=btrim(coalesce(target_reason,'Revoked.')),status_reason=btrim(coalesce(target_reason,'Revoked.'))
  where id=envelope.id;
  update public.capability_leases set status='revoked',release_reason='Parent Authority Envelope revoked.',released_at=now()
  where authority_envelope_id=envelope.id and status in ('active','paused');
  perform private.execution_record_event(envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_REVOKED',caller::text,jsonb_build_object('authority_envelope_id',envelope.id,'reason',target_reason));
  return envelope.id;
end;
$$;

create or replace function public.record_exact_action_approval_v1(
  target_envelope uuid,
  target_job uuid,
  target_operation text,
  target_target_type text,
  target_target_reference text,
  target_exact_evidence_identity text,
  target_expires_at timestamptz,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  envelope public.authority_envelopes%rowtype;
  approval_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope;
  if not found or envelope.status<>'active' then raise exception 'Active canonical Authority Envelope is required.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  if (envelope.requested_autonomy='A4' or envelope.require_independent_approval) and envelope.proposed_by=caller then
    raise exception 'The proposer cannot approve their own exact high-impact action.';
  end if;
  if target_job is null or not exists(select 1 from public.jobs j where j.id=target_job and j.project_id=envelope.project_id) then
    raise exception 'Exact-action approval requires a valid project Job.';
  end if;
  if envelope.job_id is not null and envelope.job_id<>target_job then raise exception 'Exact-action Job is outside the Authority Envelope.'; end if;
  if not (target_operation=any(envelope.allowed_operation_keys)) then raise exception 'Exact-action operation is outside the Authority Envelope.'; end if;
  if cardinality(envelope.allowed_target_types)>0 and not (lower(target_target_type)=any(envelope.allowed_target_types)) then raise exception 'Exact-action target type is outside the Authority Envelope.'; end if;
  if cardinality(envelope.allowed_target_references)>0 and not (target_target_reference=any(envelope.allowed_target_references)) then raise exception 'Exact-action target reference is outside the Authority Envelope.'; end if;
  if nullif(btrim(coalesce(target_exact_evidence_identity,'')),'') is null then raise exception 'Exact evidence identity is required.'; end if;
  if target_expires_at<=now() or target_expires_at>envelope.expires_at then raise exception 'Exact-action approval expiry must be current and inside the Authority Envelope.'; end if;

  insert into public.authority_approvals(
    project_id,authority_envelope_id,approval_type,status,approver_user_id,job_id,
    operation_key,target_type,target_reference,exact_evidence_identity,
    conditions,evidence_reference,expires_at
  ) values(
    envelope.project_id,envelope.id,'exact_action','approved',caller,target_job,
    target_operation,lower(target_target_type),target_target_reference,btrim(target_exact_evidence_identity),
    '{}'::jsonb,nullif(btrim(coalesce(target_evidence_reference,'')),''),target_expires_at
  ) returning id into approval_id;

  perform private.execution_record_event(
    envelope.project_id,target_job,'AUTHORITY_APPROVAL_RECORDED',caller::text,
    jsonb_build_object('authority_approval_id',approval_id,'authority_envelope_id',envelope.id,'approval_type','exact_action','operation',target_operation,'target_reference',target_target_reference,'exact_evidence_identity',target_exact_evidence_identity)
  );
  return approval_id;
end;
$$;

create or replace function public.revoke_authority_approval_v1(
  target_approval uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); approval public.authority_approvals%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into approval from public.authority_approvals where id=target_approval for update;
  if not found or approval.status<>'approved' then raise exception 'Active approval not found.'; end if;
  if not private.has_project_role(approval.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  update public.authority_approvals
  set status='revoked',revoked_by=caller,revoked_at=now(),revocation_reason=btrim(coalesce(target_reason,'Revoked.'))
  where id=approval.id;
  perform private.execution_record_event(approval.project_id,approval.job_id,'AUTHORITY_APPROVAL_REVOKED',caller::text,jsonb_build_object('authority_approval_id',approval.id,'reason',target_reason));
  return approval.id;
end;
$$;

create or replace function public.issue_capability_lease_v2(
  target_envelope uuid,
  target_capability_key text,
  target_allowed_operations text[],
  target_expires_at timestamptz,
  target_job uuid default null,
  target_capability uuid default null,
  target_allowed_target_types text[] default '{}'::text[],
  target_allowed_target_references text[] default '{}'::text[],
  target_allowed_consequence_classes text[] default '{}'::text[],
  target_max_operation_count integer default null,
  target_trace_identity text default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  envelope public.authority_envelopes%rowtype;
  normalized_operations text[];
  normalized_target_types text[];
  normalized_target_references text[];
  normalized_consequences text[];
  capability public.capabilities%rowtype;
  lease_id uuid;
  max_ops integer;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found then raise exception 'Authority Envelope not found.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required to issue Capability Leases.'; end if;
  if envelope.status<>'active' then raise exception 'Canonical Capability Lease requires an active Authority Envelope.'; end if;
  if envelope.expires_at<=now() then raise exception 'Authority Envelope has expired.'; end if;
  if envelope.granted_autonomy='A4' then raise exception 'A4 does not issue a generic Capability Lease.'; end if;
  if target_expires_at<=now() or target_expires_at>envelope.expires_at then raise exception 'Capability Lease expiry must be current and no later than the Authority Envelope.'; end if;
  if nullif(btrim(coalesce(target_capability_key,'')),'') is null then raise exception 'Capability key is required.'; end if;
  if cardinality(envelope.permitted_capabilities)>0 and not (lower(btrim(target_capability_key))=any(envelope.permitted_capabilities)) then raise exception 'Capability is outside the Authority Envelope.'; end if;

  if target_job is not null and not exists(select 1 from public.jobs j where j.id=target_job and j.project_id=envelope.project_id) then raise exception 'Capability Lease Job/project mismatch.'; end if;
  if envelope.job_id is not null and coalesce(target_job,envelope.job_id)<>envelope.job_id then raise exception 'Capability Lease Job is outside the Authority Envelope.'; end if;

  select coalesce(array_agg(distinct btrim(v)) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into normalized_operations from unnest(coalesce(target_allowed_operations,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into normalized_target_types from unnest(coalesce(target_allowed_target_types,'{}'::text[])) v;
  select coalesce(array_agg(distinct btrim(v)) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into normalized_target_references from unnest(coalesce(target_allowed_target_references,'{}'::text[])) v;
  select coalesce(array_agg(distinct lower(btrim(v))) filter(where nullif(btrim(v),'') is not null),'{}'::text[])
    into normalized_consequences from unnest(coalesce(target_allowed_consequence_classes,'{}'::text[])) v;

  if cardinality(normalized_operations)=0 or not normalized_operations <@ envelope.allowed_operation_keys then
    raise exception 'Capability Lease operations must be a non-empty subset of Authority Envelope allowed_operation_keys.';
  end if;
  if cardinality(normalized_consequences)=0 or not normalized_consequences <@ envelope.allowed_consequence_classes then
    raise exception 'Capability Lease consequence classes must be a non-empty subset of Authority Envelope allowed_consequence_classes.';
  end if;
  if cardinality(envelope.allowed_target_types)>0 and not normalized_target_types <@ envelope.allowed_target_types then
    raise exception 'Capability Lease target types must be a subset of Authority Envelope allowed_target_types.';
  end if;
  if cardinality(envelope.allowed_target_references)>0 and not normalized_target_references <@ envelope.allowed_target_references then
    raise exception 'Capability Lease target references must be a subset of Authority Envelope allowed_target_references.';
  end if;

  if target_capability is not null then
    select * into capability from public.capabilities where id=target_capability and project_id=envelope.project_id;
    if not found or lower(capability.capability)<>lower(btrim(target_capability_key)) then raise exception 'Capability identity mismatch.'; end if;
    if not capability.enabled or capability.state in ('UNKNOWN','OFFLINE','DISABLED','EXHAUSTED','COOLDOWN') then
      raise exception 'Capability is not currently eligible for lease issuance.';
    end if;
  end if;

  max_ops:=coalesce(target_max_operation_count,envelope.max_operation_count);
  if max_ops is null or max_ops<=0 then raise exception 'Capability Lease requires a positive maximum operation count.'; end if;
  if envelope.max_operation_count is not null and max_ops>envelope.max_operation_count then raise exception 'Capability Lease operation count exceeds Authority Envelope limit.'; end if;

  insert into public.capability_leases(
    project_id,authority_envelope_id,job_id,capability_id,actor_key,allowed_operations,
    data_scope,resource_ceiling,approval_level,trace_key,status,max_operations,used_operations,
    consumed_operation_count,expires_at,issued_by,issued_at,capability_key,
    allowed_target_types,allowed_target_references,allowed_consequence_classes,evidence_reference
  ) values(
    envelope.project_id,envelope.id,coalesce(target_job,envelope.job_id),target_capability,envelope.actor_key,
    normalized_operations,envelope.data_scope,envelope.resource_limits,envelope.granted_autonomy,
    coalesce(nullif(btrim(coalesce(target_trace_identity,'')),''),'LEASE2-'||replace(gen_random_uuid()::text,'-','')),
    'active',max_ops,0,0,target_expires_at,caller,now(),lower(btrim(target_capability_key)),
    normalized_target_types,normalized_target_references,normalized_consequences,
    nullif(btrim(coalesce(target_evidence_reference,'')),'')
  ) returning id into lease_id;

  perform private.execution_record_event(
    envelope.project_id,coalesce(target_job,envelope.job_id),'CAPABILITY_LEASE_ISSUED',caller::text,
    jsonb_build_object('capability_lease_id',lease_id,'authority_envelope_id',envelope.id,'capability_key',lower(btrim(target_capability_key)),'max_operation_count',max_ops)
  );
  return lease_id;
end;
$$;

create or replace function public.pause_capability_lease_v1(
  target_lease uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); lease public.capability_leases%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into lease from public.capability_leases where id=target_lease for update;
  if not found or lease.status<>'active' then raise exception 'Active Capability Lease not found.'; end if;
  if not private.has_project_role(lease.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  update public.capability_leases set status='paused',release_reason=btrim(coalesce(target_reason,'Paused.')) where id=lease.id;
  perform private.execution_record_event(lease.project_id,lease.job_id,'CAPABILITY_LEASE_PAUSED',caller::text,jsonb_build_object('capability_lease_id',lease.id,'reason',target_reason));
  return lease.id;
end;
$$;

create or replace function public.revoke_capability_lease_v1(
  target_lease uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); lease public.capability_leases%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into lease from public.capability_leases where id=target_lease for update;
  if not found or lease.status not in ('active','paused') then raise exception 'Revocable Capability Lease not found.'; end if;
  if not private.has_project_role(lease.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  update public.capability_leases set status='revoked',released_at=now(),release_reason=btrim(coalesce(target_reason,'Revoked.')) where id=lease.id;
  perform private.execution_record_event(lease.project_id,lease.job_id,'CAPABILITY_LEASE_REVOKED',caller::text,jsonb_build_object('capability_lease_id',lease.id,'reason',target_reason));
  return lease.id;
end;
$$;

create or replace function public.set_execution_circuit_breaker_v2(
  target_project uuid,
  target_category text,
  target_state text,
  target_reason text,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); breaker_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  if target_category not in ('autonomous_writes','external_communications','deployments','resource_execution') then raise exception 'Unsupported execution circuit-breaker category.'; end if;
  if target_state not in ('enabled','paused','blocked') then raise exception 'Unsupported execution circuit-breaker state.'; end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Circuit-breaker reason is required.'; end if;

  insert into public.execution_circuit_breakers(project_id,category,state,reason,updated_by,updated_actor,evidence_reference,updated_at)
  values(target_project,target_category,target_state,btrim(target_reason),caller,'user:'||caller::text,nullif(btrim(coalesce(target_evidence_reference,'')),''),now())
  on conflict(project_id,category) do update
  set state=excluded.state,reason=excluded.reason,updated_by=excluded.updated_by,updated_actor=excluded.updated_actor,evidence_reference=excluded.evidence_reference,updated_at=excluded.updated_at
  returning id into breaker_id;

  perform private.execution_record_event(target_project,null,'EXECUTION_CIRCUIT_BREAKER_CHANGED',caller::text,jsonb_build_object('circuit_breaker_id',breaker_id,'category',target_category,'state',target_state,'reason',target_reason));
  return breaker_id;
end;
$$;

create or replace function public.service_tighten_execution_circuit_breaker_v1(
  target_project uuid,
  target_category text,
  target_state text,
  target_reason text,
  target_trace_id text
) returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare breaker public.execution_circuit_breakers%rowtype;
begin
  if target_category not in ('autonomous_writes','external_communications','deployments','resource_execution') then raise exception 'Unsupported execution circuit-breaker category.'; end if;
  if target_state not in ('paused','blocked') then raise exception 'Safety automation may only tighten a breaker to paused or blocked.'; end if;
  select * into breaker from public.execution_circuit_breakers where project_id=target_project and category=target_category for update;
  if not found then raise exception 'breaker_missing: explicit circuit-breaker state is required.'; end if;

  update public.execution_circuit_breakers
  set state=case
      when state='blocked' then 'blocked'
      when target_state='blocked' then 'blocked'
      else 'paused'
    end,
    reason=btrim(coalesce(target_reason,'Safety automation tightened execution.')),
    updated_by=null,
    updated_actor='service:phase-d-safety',
    updated_at=now()
  where id=breaker.id;

  perform private.execution_record_event(target_project,null,'EXECUTION_CIRCUIT_BREAKER_CHANGED',coalesce(nullif(btrim(target_trace_id),''),'service:phase-d-safety'),jsonb_build_object('circuit_breaker_id',breaker.id,'category',target_category,'requested_state',target_state,'automated_tightening',true));
  return breaker.id;
end;
$$;

create or replace function public.set_authority_execution_route_mode_v1(
  target_project uuid,
  target_route_key text,
  target_mode text,
  target_reason text,
  target_evidence_reference text default null
) returns text
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid();
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin authority is required.'; end if;
  if target_route_key not in ('external_ai_provider','job_start') then raise exception 'Unsupported authority execution route key.'; end if;
  if target_mode not in ('report_only','enforced') then raise exception 'Unsupported authority execution route mode.'; end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Route-mode reason is required.'; end if;

  insert into public.scheduler_policies(project_id,policy_key,value,updated_at)
  values(
    target_project,
    'authority_execution:'||target_route_key,
    jsonb_build_object('mode',target_mode,'reason',btrim(target_reason),'evidence_reference',nullif(btrim(coalesce(target_evidence_reference,'')),''),'updated_by',caller,'updated_at',now()),
    now()
  )
  on conflict(project_id,policy_key) do update
  set value=excluded.value,updated_at=excluded.updated_at;

  perform private.execution_record_event(target_project,null,'AUTHORITY_ROUTE_MODE_CHANGED',caller::text,jsonb_build_object('route_key',target_route_key,'mode',target_mode,'reason',target_reason));
  return target_mode;
end;
$$;

create or replace function private.authority_evaluate_execution_v1(target_project uuid,req_user uuid,route_key text,actor_type text,actor_ref text,job_id uuid,op text,conseq text,req_auto text,trace_id text,cap_keys text[],tgt_type text,tgt_ref text,evidence_id text,phase_c_id uuid,provider_id uuid,need_res boolean,consume_op boolean)returns jsonb language plpgsql security definer set search_path=public,private,auth as $$ declare dec public.execution_authority_decisions%rowtype;job public.jobs%rowtype;envelope public.authority_envelopes%rowtype;candidate public.authority_envelopes%rowtype;lease public.capability_leases%rowtype;locked_lease public.capability_leases%rowtype;capability public.capabilities%rowtype;reservation public.reservations%rowtype;phase_c public.data_policy_decisions%rowtype;mode text;min_auto text;breaker_cat text;breaker_state text;purpose text;outcome text:='allow';reason text:='authority_allow';norm_caps text[];lease_ids uuid[]:='{}'::uuid[];first_lease uuid;first_cap uuid;first_res uuid;cap_key text;decision_id uuid;ceiling jsonb:='{}'::jsonb;begin if route_key not in('external_ai_provider','job_start')then raise exception'Unsupported authority execution route key.';end if;if private.authority_minimum_autonomy(conseq)is null then raise exception'Unsupported consequence class.';end if;if private.authority_autonomy_rank(req_auto)<0 then raise exception'Unsupported requested autonomy.';end if;if nullif(btrim(coalesce(op,'')),'')is null then raise exception'Requested operation is required.';end if;if nullif(btrim(coalesce(trace_id,'')),'')is null then raise exception'Execution trace id is required.';end if;if actor_type not in('human','agent','application','model','service','workflow')then raise exception'Unsupported actor type.';end if;if nullif(btrim(coalesce(actor_ref,'')),'')is null then raise exception'Actor reference is required.';end if;mode:=private.authority_route_mode(target_project,route_key);purpose:=case route_key when'external_ai_provider' then'external_provider_processing' else'job_execution' end;select*into dec from public.execution_authority_decisions d where d.project_id=target_project and d.trace_id=trace_id and d.route_key=route_key and d.requested_operation=op;if found then return jsonb_build_object('decision_id',dec.id,'outcome',dec.outcome,'reason_code',dec.reason_code,'trace_id',dec.trace_id,'route_key',dec.route_key,'enforcement_mode',dec.enforcement_mode,'authority_envelope_id',dec.authority_envelope_id,'capability_lease_ids',dec.capability_lease_ids,'idempotent_replay',true);end if;if private.execution_active_member_role(target_project,req_user)is null then outcome:='deny';reason:='upstream_authorization_denied';end if;if job_id is null then outcome:='deny';reason:='upstream_authorization_denied';else select*into job from public.jobs where id=job_id and project_id=target_project;if not found or job.status in('COMPLETED','FAILED','CANCELLED')then outcome:='deny';reason:='upstream_authorization_denied';end if;end if;if outcome='allow' and phase_c_id is not null then select*into phase_c from public.data_policy_decisions where id=phase_c_id;if not found or phase_c.project_id<>target_project or phase_c.outcome<>'allow' then outcome:='deny';reason:='trust_policy_denied';end if;end if;select coalesce(array_agg(distinct lower(btrim(v))order by lower(btrim(v)))filter(where nullif(btrim(v),'')is not null),'{}'::text[])into norm_caps from unnest(coalesce(cap_keys,'{}'::text[]))v;if outcome='allow' then select*into envelope from public.authority_envelopes e where e.project_id=target_project and e.status='active' and e.actor_type=actor_type and e.actor_key=actor_ref and e.effective_from<=now()and e.expires_at>now()and(e.job_id=job_id or e.job_id is null)and(e.purpose=purpose or purpose=any(e.allowed_purposes))order by case when e.job_id=job_id then 0 else 1 end,e.version desc,e.created_at desc limit 1;if not found then select*into candidate from public.authority_envelopes e where e.project_id=target_project and e.actor_type=actor_type and e.actor_key=actor_ref and(e.job_id=job_id or e.job_id is null)order by e.created_at desc limit 1;if not found then outcome:='deny';reason:='envelope_missing';elsif candidate.expires_at<=now()then outcome:='deny';reason:='envelope_expired';else outcome:='deny';reason:='envelope_inactive';end if;end if;end if;if outcome='allow' and not(conseq=any(envelope.allowed_consequence_classes))then outcome:='deny';reason:='consequence_not_permitted';end if;min_auto:=private.authority_minimum_autonomy(conseq);if outcome='allow' and(private.authority_autonomy_rank(req_auto)<private.authority_autonomy_rank(min_auto)or envelope.granted_autonomy is null or private.authority_autonomy_rank(envelope.granted_autonomy)<private.authority_autonomy_rank(req_auto))then outcome:='deny';reason:='autonomy_insufficient';end if;if outcome='allow' and not(op=any(envelope.allowed_operation_keys))then outcome:='deny';reason:='operation_not_permitted';end if;if outcome='allow' and cardinality(envelope.allowed_target_types)>0 and(tgt_type is null or not(lower(tgt_type)=any(envelope.allowed_target_types)))then outcome:='deny';reason:='target_not_permitted';end if;if outcome='allow' and cardinality(envelope.allowed_target_references)>0 and(tgt_ref is null or not(tgt_ref=any(envelope.allowed_target_references)))then outcome:='deny';reason:='target_not_permitted';end if;breaker_cat:=private.authority_breaker_category(conseq);if outcome='allow' and breaker_cat is not null then select b.state into breaker_state from public.execution_circuit_breakers b where b.project_id=target_project and b.category=breaker_cat;if breaker_state is null then outcome:='deny';reason:='breaker_blocked';breaker_state:='blocked';elsif breaker_state='paused' then outcome:='paused';reason:='breaker_paused';elsif breaker_state='blocked' then outcome:='deny';reason:='breaker_blocked';end if;end if;if outcome='allow' and(req_auto='A4' or min_auto='A4')then if nullif(btrim(coalesce(evidence_id,'')),'')is null or not exists(select 1 from public.authority_approvals a where a.authority_envelope_id=envelope.id and a.approval_type='exact_action' and a.status='approved' and(a.expires_at is null or a.expires_at>now())and a.operation_key=op and coalesce(a.target_type,'')=coalesce(lower(tgt_type),'')and coalesce(a.target_reference,'')=coalesce(tgt_ref,'')and a.exact_evidence_identity=evidence_id)then outcome:='review_required';reason:='approval_missing';end if;end if;if outcome='allow' and envelope.require_capability_lease then if cardinality(norm_caps)=0 then outcome:='deny';reason:='lease_missing';end if;foreach cap_key in array norm_caps loop exit when outcome<>'allow';select*into lease from public.capability_leases l where l.authority_envelope_id=envelope.id and l.capability_key=cap_key and(l.job_id=job_id or l.job_id is null)order by case l.status when'active' then 0 when'paused' then 1 when'exhausted' then 2 when'revoked' then 3 else 4 end,l.issued_at desc limit 1;if not found then outcome:='deny';reason:='lease_missing';elsif lease.expires_at<=now()or lease.status='expired' then outcome:='deny';reason:='lease_expired';elsif lease.status='revoked' then outcome:='deny';reason:='lease_revoked';elsif lease.status='exhausted' or lease.consumed_operation_count>=lease.max_operations then outcome:='exhausted';reason:='lease_exhausted';elsif lease.status='paused' then outcome:='paused';reason:='lease_paused';elsif lease.status<>'active' then outcome:='deny';reason:='lease_missing';elsif not(op=any(lease.allowed_operations))then outcome:='deny';reason:='operation_not_permitted';elsif not(conseq=any(lease.allowed_consequence_classes))then outcome:='deny';reason:='consequence_not_permitted';elsif cardinality(lease.allowed_target_types)>0 and(tgt_type is null or not(lower(tgt_type)=any(lease.allowed_target_types)))then outcome:='deny';reason:='target_not_permitted';elsif cardinality(lease.allowed_target_references)>0 and(tgt_ref is null or not(tgt_ref=any(lease.allowed_target_references)))then outcome:='deny';reason:='target_not_permitted';else lease_ids:=array_append(lease_ids,lease.id);if first_lease is null then first_lease:=lease.id;end if;if lease.capability_id is not null then select*into capability from public.capabilities c where c.id=lease.capability_id and c.project_id=target_project;else select*into capability from public.capabilities c where c.project_id=target_project and lower(c.capability)=cap_key order by case c.state when'AVAILABLE' then 0 when'BUSY' then 1 else 2 end,c.observed_at desc nulls last limit 1;end if;if found then if not capability.enabled or capability.state in('UNKNOWN','OFFLINE','DISABLED','EXHAUSTED','COOLDOWN')then outcome:='deny';reason:='capability_unhealthy';else if first_cap is null then first_cap:=capability.id;end if;if need_res then select*into reservation from public.reservations r where r.job_id=job_id and r.capability_id=capability.id and r.status='ACTIVE' and r.leased_until>now()order by r.leased_until desc limit 1;if not found then outcome:='deny';reason:='reservation_missing';elsif first_res is null then first_res:=reservation.id;end if;end if;end if;elsif need_res then outcome:='deny';reason:='reservation_missing';end if;end if;end loop;end if;ceiling:=case when envelope.id is null then'{}'::jsonb else jsonb_build_object('max_operation_count',envelope.max_operation_count,'max_concurrent_executions',envelope.max_concurrent_executions,'max_external_calls',envelope.max_external_calls,'max_retry_count',envelope.max_retry_count,'max_runtime_seconds',envelope.max_runtime_seconds,'max_target_count',envelope.max_target_count,'max_file_change_count',envelope.max_file_change_count,'max_external_recipients',envelope.max_external_recipients,'resource_limits',envelope.resource_limits)end;if outcome='allow' and mode='enforced' and consume_op and cardinality(lease_ids)>0 then for locked_lease in select*from public.capability_leases where id=any(lease_ids)order by capability_key,id for update loop if locked_lease.status='paused' then outcome:='paused';reason:='lease_paused';exit;end if;if locked_lease.status='revoked' then outcome:='deny';reason:='lease_revoked';exit;end if;if locked_lease.expires_at<=now()then outcome:='deny';reason:='lease_expired';exit;end if;if locked_lease.status='exhausted' or locked_lease.consumed_operation_count>=locked_lease.max_operations then outcome:='exhausted';reason:='lease_exhausted';exit;end if;end loop;select*into dec from public.execution_authority_decisions d where d.project_id=target_project and d.trace_id=trace_id and d.route_key=route_key and d.requested_operation=op;if found then return jsonb_build_object('decision_id',dec.id,'outcome',dec.outcome,'reason_code',dec.reason_code,'trace_id',dec.trace_id,'route_key',dec.route_key,'enforcement_mode',dec.enforcement_mode,'authority_envelope_id',dec.authority_envelope_id,'capability_lease_ids',dec.capability_lease_ids,'idempotent_replay',true);end if;if outcome='allow' then update public.capability_leases set consumed_operation_count=consumed_operation_count+1,used_operations=least(max_operations,used_operations+1),last_used_at=now(),status=case when consumed_operation_count+1>=max_operations then'exhausted' else status end where id=any(lease_ids);end if;end if;insert into public.execution_authority_decisions(project_id,job_id,actor_key,sponsor_user_id,authority_envelope_id,capability_lease_id,capability_id,requested_operation,purpose,autonomy_level,outcome,reason_code,breaker_snapshot,capability_state_snapshot,resource_usage_snapshot,trace_id,route_key,requesting_user_id,actor_type,actor_reference,requested_consequence_class,requested_autonomy,granted_autonomy,capability_keys,capability_lease_ids,breaker_category,breaker_state,phase_c_decision_id,provider_request_id,reservation_id,exact_evidence_identity,enforcement_mode,ceiling_snapshot)values(target_project,job_id,actor_ref,envelope.sponsor_user_id,envelope.id,first_lease,first_cap,op,purpose,envelope.granted_autonomy,outcome,reason,jsonb_build_object('category',breaker_cat,'state',breaker_state),jsonb_build_object('capability_keys',norm_caps),jsonb_build_object('lease_ids',lease_ids),trace_id,route_key,req_user,actor_type,actor_ref,conseq,req_auto,envelope.granted_autonomy,norm_caps,lease_ids,breaker_cat,breaker_state,phase_c_id,provider_id,first_res,nullif(btrim(coalesce(evidence_id,'')),''),mode,ceiling)returning id into decision_id;perform private.execution_record_event(target_project,job_id,'EXECUTION_AUTHORITY_EVALUATED',actor_ref,jsonb_build_object('execution_authority_decision_id',decision_id,'route_key',route_key,'enforcement_mode',mode,'outcome',outcome,'reason_code',reason,'authority_envelope_id',envelope.id,'capability_lease_ids',lease_ids));return jsonb_build_object('decision_id',decision_id,'outcome',outcome,'reason_code',reason,'trace_id',trace_id,'route_key',route_key,'enforcement_mode',mode,'authority_envelope_id',envelope.id,'capability_lease_ids',lease_ids,'granted_autonomy',envelope.granted_autonomy,'idempotent_replay',false);end;$$;revoke all on function private.authority_evaluate_execution_v1(uuid,uuid,text,text,text,uuid,text,text,text,text,text[],text,text,text,uuid,uuid,boolean,boolean)from public,anon,authenticated;create or replace function public.service_evaluate_execution_authority_v1(
  target_project uuid,
  target_requesting_user uuid,
  target_route_key text,
  target_actor_type text,
  target_actor_reference text,
  target_job uuid,
  target_operation text,
  target_consequence_class text,
  target_requested_autonomy text,
  target_trace_id text,
  target_capability_keys text[] default '{}'::text[],
  target_target_type text default null,
  target_target_reference text default null,
  target_exact_evidence_identity text default null,
  target_phase_c_decision uuid default null,
  target_provider_request uuid default null,
  target_require_reservation boolean default false,
  target_consume_operation boolean default false
) returns jsonb
language sql
security definer
set search_path=public,private,auth
as $$
  select private.authority_evaluate_execution_v1(
    target_project,target_requesting_user,target_route_key,target_actor_type,target_actor_reference,
    target_job,target_operation,target_consequence_class,target_requested_autonomy,target_trace_id,
    target_capability_keys,target_target_type,target_target_reference,target_exact_evidence_identity,
    target_phase_c_decision,target_provider_request,target_require_reservation,target_consume_operation
  );
$$;

create or replace function public.get_authority_execution_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); caller_role text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_access(target_project) then raise insufficient_privilege using message='Project access is required.'; end if;
  caller_role:=private.execution_active_member_role(target_project,caller);

  return jsonb_build_object(
    'envelopes',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.authority_envelopes e where e.project_id=target_project),'[]'::jsonb),
    'approvals',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.authority_approvals a where a.project_id=target_project),'[]'::jsonb),
    'leases',coalesce((select jsonb_agg(to_jsonb(l) order by l.issued_at desc) from public.capability_leases l where l.project_id=target_project),'[]'::jsonb),
    'circuit_breakers',coalesce((select jsonb_agg(to_jsonb(b) order by b.category) from public.execution_circuit_breakers b where b.project_id=target_project),'[]'::jsonb),
    'route_modes',jsonb_build_object(
      'external_ai_provider',private.authority_route_mode(target_project,'external_ai_provider'),
      'job_start',private.authority_route_mode(target_project,'job_start')
    ),
    'decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select * from public.execution_authority_decisions where project_id=target_project order by created_at desc limit 100) d),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'job_number',j.job_number,'title',j.title,'status',j.status,'required_capabilities',j.required_capabilities) order by j.updated_at desc) from (select * from public.jobs where project_id=target_project order by updated_at desc limit 100) j),'[]'::jsonb),
    'caller_role',caller_role,
    'can_propose',caller_role in ('owner','admin','operator'),
    'can_approve',caller_role in ('owner','admin'),
    'can_control',caller_role in ('owner','admin'),
    'boundaries',jsonb_build_object(
      'capacity_reservation_is_authorization',false,
      'legacy_v1_is_canonical_authority',false,
      'phase_c_remains_independent',true,
      'a4_requires_exact_action_approval',true
    )
  );
end;
$$;

create or replace function public.get_job_execution_authority_summary_v1( target_project uuid, target_jobs uuid[] ) returns jsonb language plpgsql stable security definer set search_path=public,private,auth as $$ declare caller uuid:=auth.uid(); job public.jobs%rowtype; envelope public.authority_envelopes%rowtype; latest_decision public.execution_authority_decisions%rowtype; route_mode text; breaker_state_value text; required_key text; lease_state text; lease_states jsonb; readiness text; result jsonb:='{}'::jsonb; begin if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if; if not private.has_project_access(target_project) then raise insufficient_privilege using message='Project access is required.'; end if; route_mode:=private.authority_route_mode(target_project,'job_start'); select state into breaker_state_value from public.execution_circuit_breakers where project_id=target_project and category='resource_execution'; breaker_state_value:=coalesce(breaker_state_value,'blocked'); for job in select * from public.jobs where project_id=target_project and id=any(coalesce(target_jobs,'{}'::uuid[])) loop envelope:=null; select * into envelope from public.authority_envelopes e where e.project_id=target_project and e.status='active' and e.expires_at>now() and (e.job_id=job.id or e.job_id is null) and'resource_execution'=any(e.allowed_consequence_classes) and private.authority_autonomy_rank(e.granted_autonomy)>=private.authority_autonomy_rank('A3') order by case when e.job_id=job.id then 0 else 1 end,e.version desc,e.created_at desc limit 1; lease_states:='{}'::jsonb; for required_key in select lower(value) from jsonb_array_elements_text(coalesce(job.required_capabilities,'[]'::jsonb)) value loop select case when l.expires_at<=now() then'expired' else l.status end into lease_state from public.capability_leases l where l.authority_envelope_id=envelope.id and l.capability_key=required_key and (l.job_id=job.id or l.job_id is null) order by case l.status when'active' then 0 else 1 end,l.issued_at desc limit 1; lease_states:=lease_states||jsonb_build_object(required_key,coalesce(lease_state,'missing')); end loop; latest_decision:=null; select * into latest_decision from public.execution_authority_decisions d where d.project_id=target_project and d.job_id=job.id and d.route_key='job_start' order by d.created_at desc limit 1; readiness:=case when route_mode='report_only' then'report_only' when breaker_state_value='blocked' then'blocked' when breaker_state_value='paused' then'paused' when envelope.id is null then'approval_required' when exists(select 1 from jsonb_each_text(lease_states) x where x.value='expired') then'lease_expired' when exists(select 1 from jsonb_each_text(lease_states) x where x.value in ('missing','revoked','exhausted','paused','cancelled')) then'lease_missing' when latest_decision.id is not null and latest_decision.enforcement_mode='enforced' and latest_decision.outcome='allow' then'authorized' when latest_decision.id is null then'not_evaluated' else'ready_for_check' end; result:=result||jsonb_build_object( job.id::text, jsonb_build_object('route_mode',route_mode,'envelope_id',envelope.id,'envelope_status',envelope.status,'lease_states',lease_states,'breaker_state',breaker_state_value,'decision_outcome',latest_decision.outcome,'decision_reason_code',latest_decision.reason_code,'readiness',readiness ) ); end loop; return result; end; $$; -- Governed mutation grants. Legacy V1 functions remain available only as compatibility paths. revoke all on function public.propose_authority_envelope_v2(uuid,text,text,uuid,text,text,text[],text[],text,uuid,uuid,text[],text[],text[],text[],text[],text[],text[],timestamptz,timestamptz,jsonb,text,boolean,boolean,text,text) from public,anon; grant execute on function public.propose_authority_envelope_v2(uuid,text,text,uuid,text,text,text[],text[],text,uuid,uuid,text[],text[],text[],text[],text[],text[],text[],timestamptz,timestamptz,jsonb,text,boolean,boolean,text,text) to authenticated; revoke all on function public.approve_authority_envelope_v2(uuid,text,jsonb,text) from public,anon; grant execute on function public.approve_authority_envelope_v2(uuid,text,jsonb,text) to authenticated; revoke all on function public.activate_authority_envelope_v2(uuid) from public,anon; grant execute on function public.activate_authority_envelope_v2(uuid) to authenticated; revoke all on function public.reject_authority_envelope_v2(uuid,text) from public,anon; grant execute on function public.reject_authority_envelope_v2(uuid,text) to authenticated; revoke all on function public.pause_authority_envelope_v2(uuid,text) from public,anon; grant execute on function public.pause_authority_envelope_v2(uuid,text) to authenticated; revoke all on function public.revoke_authority_envelope_v2(uuid,text) from public,anon; grant execute on function public.revoke_authority_envelope_v2(uuid,text) to authenticated; revoke all on function public.record_exact_action_approval_v1(uuid,uuid,text,text,text,text,timestamptz,text) from public,anon; grant execute on function public.record_exact_action_approval_v1(uuid,uuid,text,text,text,text,timestamptz,text) to authenticated; revoke all on function public.revoke_authority_approval_v1(uuid,text) from public,anon; grant execute on function public.revoke_authority_approval_v1(uuid,text) to authenticated; revoke all on function public.issue_capability_lease_v2(uuid,text,text[],timestamptz,uuid,uuid,text[],text[],text[],integer,text,text) from public,anon; grant execute on function public.issue_capability_lease_v2(uuid,text,text[],timestamptz,uuid,uuid,text[],text[],text[],integer,text,text) to authenticated; revoke all on function public.pause_capability_lease_v1(uuid,text) from public,anon; grant execute on function public.pause_capability_lease_v1(uuid,text) to authenticated; revoke all on function public.revoke_capability_lease_v1(uuid,text) from public,anon; grant execute on function public.revoke_capability_lease_v1(uuid,text) to authenticated; revoke all on function public.set_execution_circuit_breaker_v2(uuid,text,text,text,text) from public,anon; grant execute on function public.set_execution_circuit_breaker_v2(uuid,text,text,text,text) to authenticated; revoke all on function public.set_authority_execution_route_mode_v1(uuid,text,text,text,text) from public,anon; grant execute on function public.set_authority_execution_route_mode_v1(uuid,text,text,text,text) to authenticated; revoke all on function public.service_tighten_execution_circuit_breaker_v1(uuid,text,text,text,text) from public,anon,authenticated; grant execute on function public.service_tighten_execution_circuit_breaker_v1(uuid,text,text,text,text) to service_role; revoke all on function public.service_evaluate_execution_authority_v1(uuid,uuid,text,text,text,uuid,text,text,text,text,text[],text,text,text,uuid,uuid,boolean,boolean) from public,anon,authenticated; grant execute on function public.service_evaluate_execution_authority_v1(uuid,uuid,text,text,text,uuid,text,text,text,text,text[],text,text,text,uuid,uuid,boolean,boolean) to service_role; revoke all on function public.get_authority_execution_workspace_v1(uuid) from public,anon; grant execute on function public.get_authority_execution_workspace_v1(uuid) to authenticated; revoke all on function public.get_job_execution_authority_summary_v1(uuid,uuid[]) from public,anon; grant execute on function public.get_job_execution_authority_summary_v1(uuid,uuid[]) to authenticated; commit;