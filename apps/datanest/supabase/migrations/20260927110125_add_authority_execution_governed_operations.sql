begin;

create schema if not exists private;

create or replace function private.execution_active_member_role(
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

create or replace function private.execution_validate_context(
  target_project uuid,
  target_job uuid,
  target_product uuid,
  target_actor_type text,
  target_actor_user uuid,
  target_actor_key text,
  target_sponsor_user uuid
) returns void
language plpgsql
security definer
set search_path=public,private,auth
as $$
begin
  if not exists(
    select 1 from public.jobs j
    where j.id=target_job and j.project_id=target_project
  ) then
    raise exception 'Job/project identity mismatch.';
  end if;

  if target_product is not null and not exists(
    select 1 from public.products p
    where p.id=target_product and p.project_id=target_project
  ) then
    raise exception 'Product/project identity mismatch.';
  end if;

  if private.execution_active_member_role(target_project,target_sponsor_user) is null then
    raise exception 'Sponsor must be a current active project member.';
  end if;

  if nullif(btrim(coalesce(target_actor_key,'')),'') is null then
    raise exception 'Actor key is required.';
  end if;

  if target_actor_type='human' then
    if target_actor_user is null then
      raise exception 'Human authority requires an actor user.';
    end if;
    if private.execution_active_member_role(target_project,target_actor_user) is null then
      raise exception 'Human actor must be a current active project member.';
    end if;
  end if;
end;
$$;

create or replace function private.execution_validate_operations(
  target_autonomy text,
  target_operations text[],
  target_reversibility text
) returns void
language plpgsql
immutable
set search_path=pg_catalog
as $$
declare
  op text;
begin
  if target_autonomy not in ('A0','A1','A2','A3','A4') then
    raise exception 'Unsupported autonomy level.';
  end if;

  foreach op in array coalesce(target_operations,'{}'::text[])
  loop
    if op not in ('observe','prepare','write','execute','promote','destruct') then
      raise exception 'Unsupported execution operation: %',op;
    end if;

    if target_autonomy in ('A0','A1') and op<>'observe' then
      raise exception '% authority permits observe only.',target_autonomy;
    elsif target_autonomy='A2' and op not in ('observe','prepare') then
      raise exception 'A2 authority permits observe and prepare only.';
    elsif target_autonomy='A3' and op='destruct' then
      raise exception 'A3 authority cannot permit destruct.';
    end if;
  end loop;

  if 'promote'=any(coalesce(target_operations,'{}'::text[]))
     and target_reversibility='irreversible'
     and target_autonomy<>'A4' then
    raise exception 'Irreversible promotion requires A4 review.';
  end if;
end;
$$;

create or replace function private.execution_operation_allowed(
  target_autonomy text,
  target_operation text
) returns boolean
language sql
immutable
set search_path=pg_catalog
as $$
  select case target_autonomy
    when 'A0' then target_operation='observe'
    when 'A1' then target_operation='observe'
    when 'A2' then target_operation in ('observe','prepare')
    when 'A3' then target_operation in ('observe','prepare','write','execute','promote')
    when 'A4' then target_operation in ('observe','prepare','write','execute','promote','destruct')
    else false
  end;
$$;

create or replace function private.execution_validate_resource_ceiling(
  target_autonomy text,
  target_ceiling jsonb
) returns void
language plpgsql
immutable
set search_path=pg_catalog
as $$
declare
  required_key text;
begin
  if target_ceiling is null or jsonb_typeof(target_ceiling)<>'object' then
    raise exception 'Resource ceiling must be a JSON object.';
  end if;

  if target_autonomy in ('A3','A4') then
    foreach required_key in array array[
      'max_duration_seconds','max_operations','max_cost_minor','max_concurrency','blast_radius'
    ]
    loop
      if not target_ceiling ? required_key then
        raise exception 'A3/A4 resource ceiling requires %.',required_key;
      end if;
    end loop;
  end if;

  if target_ceiling ? 'max_duration_seconds'
     and coalesce((target_ceiling->>'max_duration_seconds')::integer,0)<=0 then
    raise exception 'max_duration_seconds must be positive.';
  end if;
  if target_ceiling ? 'max_operations'
     and coalesce((target_ceiling->>'max_operations')::integer,0)<=0 then
    raise exception 'max_operations must be positive.';
  end if;
  if target_ceiling ? 'max_cost_minor'
     and coalesce((target_ceiling->>'max_cost_minor')::bigint,-1)<0 then
    raise exception 'max_cost_minor must be zero or positive.';
  end if;
  if target_ceiling ? 'max_concurrency'
     and coalesce((target_ceiling->>'max_concurrency')::integer,0)<=0 then
    raise exception 'max_concurrency must be positive.';
  end if;
  if target_ceiling ? 'blast_radius'
     and (
       nullif(btrim(coalesce(target_ceiling->>'blast_radius','')),'') is null
       or lower(btrim(target_ceiling->>'blast_radius'))='unbounded'
     ) then
    raise exception 'blast_radius must be finite.';
  end if;
end;
$$;

create or replace function private.execution_breaker_category(
  target_operation text,
  target_purpose text
) returns text
language sql
immutable
set search_path=pg_catalog
as $$
  select case
    when target_operation='write' then 'autonomous_write'
    when target_operation='promote' then 'deployment'
    when target_operation='execute'
      and lower(btrim(coalesce(target_purpose,''))) in (
        'external_communication','external_message','external_notification','external_publish'
      ) then 'external_communication'
    when target_operation='execute' then 'resource_execution'
    when target_operation='destruct' then 'resource_execution'
    else null
  end;
$$;

create or replace function private.execution_record_event(
  target_project uuid,
  target_job uuid,
  target_event text,
  target_actor text,
  target_payload jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path=public,private
as $$
  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,
    target_job,
    target_event,
    coalesce(nullif(btrim(target_actor),''),'system'),
    coalesce(target_payload,'{}'::jsonb)
  );
$$;

create or replace function public.propose_authority_envelope_v1(
  target_project uuid,
  target_job uuid,
  target_actor_type text,
  target_actor_key text,
  target_sponsor_user uuid,
  target_purpose text,
  target_autonomy_level text,
  target_permitted_capabilities text[],
  target_permitted_operations text[],
  target_expires_at timestamptz,
  target_product uuid default null,
  target_actor_user uuid default null,
  target_data_scope jsonb default '{}'::jsonb,
  target_resource_ceiling jsonb default '{}'::jsonb,
  target_reversibility text default 'reversible',
  target_evidence_requirements jsonb default '{}'::jsonb,
  target_trace_key text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  normalized_capabilities text[];
  normalized_operations text[];
  new_id uuid;
  trace_value text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  caller_role:=private.execution_active_member_role(target_project,caller);
  if target_autonomy_level='A4' and caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='A4 proposal requires owner or admin authority.';
  end if;
  if target_actor_type not in ('human','agent','application','model','service','workflow') then
    raise exception 'Unsupported actor type.';
  end if;
  if target_autonomy_level not in ('A0','A1','A2','A3','A4') then
    raise exception 'Unsupported autonomy level.';
  end if;
  if target_reversibility not in ('reversible','conditionally_reversible','irreversible') then
    raise exception 'Unsupported reversibility state.';
  end if;
  if target_expires_at<=now() then
    raise exception 'Authority Envelope expiry must be in the future.';
  end if;
  if nullif(btrim(coalesce(target_purpose,'')),'') is null then
    raise exception 'Purpose is required.';
  end if;

  perform private.execution_validate_context(
    target_project,target_job,target_product,target_actor_type,target_actor_user,target_actor_key,target_sponsor_user
  );

  select coalesce(array_agg(distinct btrim(value)) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
    into normalized_capabilities
  from unnest(coalesce(target_permitted_capabilities,'{}'::text[])) value;

  select coalesce(array_agg(distinct lower(btrim(value))) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
    into normalized_operations
  from unnest(coalesce(target_permitted_operations,'{}'::text[])) value;

  perform private.execution_validate_operations(target_autonomy_level,normalized_operations,target_reversibility);
  perform private.execution_validate_resource_ceiling(target_autonomy_level,coalesce(target_resource_ceiling,'{}'::jsonb));

  if target_autonomy_level='A4'
     and coalesce(target_evidence_requirements,'{}'::jsonb)='{}'::jsonb then
    raise exception 'A4 authority requires explicit evidence requirements.';
  end if;

  if exists(
    select 1 from unnest(normalized_capabilities) c
    where not exists(
      select 1 from public.capabilities pc
      where pc.project_id=target_project and pc.capability=c
    )
  ) then
    raise exception 'Every permitted capability must exist in the project capability inventory.';
  end if;

  trace_value:=coalesce(
    nullif(btrim(coalesce(target_trace_key,'')),''),
    'AUTH-'||replace(gen_random_uuid()::text,'-','')
  );

  insert into public.authority_envelopes(
    project_id,product_id,job_id,actor_type,actor_user_id,actor_key,sponsor_user_id,
    purpose,autonomy_level,permitted_capabilities,permitted_operations,data_scope,resource_ceiling,
    reversibility,evidence_requirements,approval_state,trace_key,expires_at,created_by
  ) values(
    target_project,target_product,target_job,target_actor_type,target_actor_user,btrim(target_actor_key),target_sponsor_user,
    btrim(target_purpose),target_autonomy_level,normalized_capabilities,normalized_operations,
    coalesce(target_data_scope,'{}'::jsonb),coalesce(target_resource_ceiling,'{}'::jsonb),
    target_reversibility,coalesce(target_evidence_requirements,'{}'::jsonb),'draft',trace_value,target_expires_at,caller
  ) returning id into new_id;

  perform private.execution_record_event(
    target_project,target_job,'AUTHORITY_ENVELOPE_PROPOSED',caller::text,
    jsonb_build_object(
      'authority_envelope_id',new_id,
      'trace_key',trace_value,
      'actor_key',btrim(target_actor_key),
      'sponsor_user_id',target_sponsor_user,
      'autonomy_level',target_autonomy_level,
      'permitted_operations',normalized_operations
    )
  );

  return new_id;
end;
$$;

create or replace function public.approve_authority_envelope_v1(
  target_envelope uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  envelope public.authority_envelopes%rowtype;
  caller_role text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into envelope
  from public.authority_envelopes
  where id=target_envelope
  for update;

  if not found then raise exception 'Authority Envelope not found.'; end if;
  if envelope.approval_state<>'draft' then raise exception 'Only draft Authority Envelopes may be approved.'; end if;

  caller_role:=private.execution_active_member_role(envelope.project_id,caller);
  if caller_role is null then
    raise insufficient_privilege using message='Active project membership is required.';
  end if;

  if envelope.autonomy_level in ('A0','A1','A2') then
    if caller_role not in ('owner','admin','operator') then
      raise insufficient_privilege using message='Operator authority is required to approve A0-A2.';
    end if;
  elsif envelope.autonomy_level='A3' then
    if not private.has_project_role(envelope.project_id,array['owner','admin']) then
      raise insufficient_privilege using message='Owner or admin authority is required to approve A3.';
    end if;
    if envelope.created_by=envelope.sponsor_user_id and caller=envelope.created_by then
      raise exception 'A3 authority requires independent review.';
    end if;
  elsif envelope.autonomy_level='A4' then
    if not private.has_project_role(envelope.project_id,array['owner']) then
      raise insufficient_privilege using message='Owner authority is required to approve A4.';
    end if;
    if caller=envelope.created_by then
      raise exception 'A4 authority requires an independent owner review.';
    end if;
  end if;

  perform private.execution_validate_context(
    envelope.project_id,envelope.job_id,envelope.product_id,envelope.actor_type,envelope.actor_user_id,
    envelope.actor_key,envelope.sponsor_user_id
  );
  perform private.execution_validate_operations(envelope.autonomy_level,envelope.permitted_operations,envelope.reversibility);
  perform private.execution_validate_resource_ceiling(envelope.autonomy_level,envelope.resource_ceiling);

  if envelope.expires_at<=now() then
    raise exception 'Authority Envelope has expired.';
  end if;
  if envelope.autonomy_level='A4' and envelope.evidence_requirements='{}'::jsonb then
    raise exception 'A4 authority requires explicit evidence requirements.';
  end if;

  update public.authority_envelopes
  set approval_state='approved',
      approved_by=caller,
      approved_at=now(),
      effective_from=coalesce(effective_from,now())
  where id=envelope.id;

  perform private.execution_record_event(
    envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_APPROVED',caller::text,
    jsonb_build_object(
      'authority_envelope_id',envelope.id,
      'trace_key',envelope.trace_key,
      'autonomy_level',envelope.autonomy_level
    )
  );
  return envelope.id;
end;
$$;

create or replace function public.reject_authority_envelope_v1(
  target_envelope uuid,
  target_reason text
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
  if not found or envelope.approval_state<>'draft' then raise exception 'Draft Authority Envelope not found.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin authority is required.';
  end if;

  update public.authority_envelopes
  set approval_state='rejected',
      revocation_reason=btrim(coalesce(target_reason,'Rejected.'))
  where id=envelope.id;

  perform private.execution_record_event(
    envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_REJECTED',caller::text,
    jsonb_build_object('authority_envelope_id',envelope.id,'reason',btrim(coalesce(target_reason,'Rejected.')))
  );
  return envelope.id;
end;
$$;

create or replace function public.revoke_authority_envelope_v1(
  target_envelope uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  envelope public.authority_envelopes%rowtype;
  revoked_lease_count integer:=0;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found or envelope.approval_state<>'approved' then raise exception 'Approved Authority Envelope not found.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin authority is required.';
  end if;

  update public.authority_envelopes
  set approval_state='revoked',
      revoked_by=caller,
      revoked_at=now(),
      revocation_reason=btrim(coalesce(target_reason,'Revoked.'))
  where id=envelope.id;

  update public.capability_leases
  set status='revoked',
      released_at=now(),
      release_reason='Authority Envelope revoked: '||btrim(coalesce(target_reason,'Revoked.'))
  where authority_envelope_id=envelope.id
    and status='active';

  get diagnostics revoked_lease_count=row_count;

  perform private.execution_record_event(
    envelope.project_id,envelope.job_id,'AUTHORITY_ENVELOPE_REVOKED',caller::text,
    jsonb_build_object(
      'authority_envelope_id',envelope.id,
      'revoked_lease_count',revoked_lease_count,
      'reason',btrim(coalesce(target_reason,'Revoked.'))
    )
  );
  return envelope.id;
end;
$$;

create or replace function public.issue_capability_lease_v1(
  target_envelope uuid,
  target_capability uuid,
  target_allowed_operations text[],
  target_expires_at timestamptz,
  target_max_operations integer,
  target_trace_key text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  envelope public.authority_envelopes%rowtype;
  capability public.capabilities%rowtype;
  normalized_operations text[];
  op text;
  breaker_category text;
  breaker public.execution_circuit_breakers%rowtype;
  max_envelope_operations integer;
  lease_id uuid;
  trace_value text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into envelope from public.authority_envelopes where id=target_envelope for update;
  if not found then raise exception 'Authority Envelope not found.'; end if;
  if not private.has_project_role(envelope.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin authority is required to issue Capability Leases.';
  end if;
  if envelope.approval_state<>'approved' or envelope.revoked_at is not null then
    raise exception 'Capability Lease requires an approved current Authority Envelope.';
  end if;
  if envelope.expires_at<=now() then raise exception 'Authority Envelope has expired.'; end if;
  if envelope.autonomy_level='A4' then
    raise exception 'A4 cannot issue a generic automated Capability Lease.';
  end if;
  if target_expires_at<=now() or target_expires_at>envelope.expires_at then
    raise exception 'Capability Lease expiry must be current and no later than the Authority Envelope.';
  end if;
  if target_max_operations<=0 then raise exception 'Capability Lease max operations must be positive.'; end if;

  if private.execution_active_member_role(envelope.project_id,envelope.sponsor_user_id) is null then
    raise exception 'Sponsor is no longer an active project member.';
  end if;

  select * into capability
  from public.capabilities
  where id=target_capability and project_id=envelope.project_id
  for update;
  if not found then raise exception 'Capability/project identity mismatch.'; end if;
  if not capability.enabled or capability.state in ('DISABLED','OFFLINE','EXHAUSTED') then
    raise exception 'Capability is not eligible for authorization lease issuance.';
  end if;
  if not (capability.capability=any(envelope.permitted_capabilities)) then
    raise exception 'Capability is outside the Authority Envelope.';
  end if;

  select coalesce(array_agg(distinct lower(btrim(value))) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
    into normalized_operations
  from unnest(coalesce(target_allowed_operations,'{}'::text[])) value;

  if cardinality(normalized_operations)=0 then raise exception 'Capability Lease requires at least one allowed operation.'; end if;
  if not normalized_operations <@ envelope.permitted_operations then
    raise exception 'Capability Lease operations must be a subset of the Authority Envelope.';
  end if;
  perform private.execution_validate_operations(envelope.autonomy_level,normalized_operations,envelope.reversibility);

  if not (envelope.resource_ceiling ? 'max_operations') then
    raise exception 'resource_ceiling_invalid: max_operations is required before lease issuance.';
  end if;
  max_envelope_operations:=(envelope.resource_ceiling->>'max_operations')::integer;
  if target_max_operations>max_envelope_operations then
    raise exception 'Capability Lease max operations exceed Authority Envelope resource ceiling.';
  end if;

  foreach op in array normalized_operations
  loop
    breaker_category:=private.execution_breaker_category(op,envelope.purpose);
    if breaker_category is not null then
      select * into breaker
      from public.execution_circuit_breakers
      where project_id=envelope.project_id and category=breaker_category;
      if not found then
        raise exception 'breaker_missing: % circuit breaker must be explicitly opened before lease issuance.',breaker_category;
      end if;
      if breaker.state='halted' then
        raise exception 'breaker_halted: % circuit breaker is halted.',breaker_category;
      end if;
    end if;
  end loop;

  trace_value:=coalesce(
    nullif(btrim(coalesce(target_trace_key,'')),''),
    envelope.trace_key||'-LEASE-'||replace(gen_random_uuid()::text,'-','')
  );

  insert into public.capability_leases(
    project_id,authority_envelope_id,job_id,capability_id,actor_key,allowed_operations,
    data_scope,resource_ceiling,approval_level,trace_key,status,max_operations,expires_at,issued_by
  ) values(
    envelope.project_id,envelope.id,envelope.job_id,capability.id,envelope.actor_key,normalized_operations,
    envelope.data_scope,envelope.resource_ceiling,envelope.autonomy_level,trace_value,'active',
    target_max_operations,target_expires_at,caller
  ) returning id into lease_id;

  perform private.execution_record_event(
    envelope.project_id,envelope.job_id,'CAPABILITY_LEASE_ISSUED',caller::text,
    jsonb_build_object(
      'capability_lease_id',lease_id,
      'authority_envelope_id',envelope.id,
      'capability_id',capability.id,
      'trace_key',trace_value,
      'max_operations',target_max_operations,
      'expires_at',target_expires_at
    )
  );
  return lease_id;
end;
$$;

create or replace function public.release_capability_lease_v1(
  target_lease uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  lease public.capability_leases%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into lease from public.capability_leases where id=target_lease for update;
  if not found or lease.status<>'active' then raise exception 'Active Capability Lease not found.'; end if;
  if not private.has_project_role(lease.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin authority is required.';
  end if;

  update public.capability_leases
  set status='released',released_at=now(),release_reason=btrim(coalesce(target_reason,'Released.'))
  where id=lease.id;

  perform private.execution_record_event(
    lease.project_id,lease.job_id,'CAPABILITY_LEASE_RELEASED',caller::text,
    jsonb_build_object('capability_lease_id',lease.id,'reason',btrim(coalesce(target_reason,'Released.')))
  );
  return lease.id;
end;
$$;

create or replace function public.set_execution_circuit_breaker_v1(
  target_project uuid,
  target_category text,
  target_state text,
  target_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  breaker_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin authority is required to manage execution circuit breakers.';
  end if;
  if target_category not in ('autonomous_write','deployment','external_communication','resource_execution') then
    raise exception 'Unsupported execution circuit-breaker category.';
  end if;
  if target_state not in ('open','halted') then
    raise exception 'Unsupported execution circuit-breaker state.';
  end if;

  insert into public.execution_circuit_breakers(project_id,category,state,reason,updated_by,updated_at)
  values(target_project,target_category,target_state,nullif(btrim(coalesce(target_reason,'')),''),caller,now())
  on conflict(project_id,category) do update
  set state=excluded.state,
      reason=excluded.reason,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  returning id into breaker_id;

  perform private.execution_record_event(
    target_project,null,'EXECUTION_CIRCUIT_BREAKER_CHANGED',caller::text,
    jsonb_build_object(
      'circuit_breaker_id',breaker_id,
      'category',target_category,
      'state',target_state,
      'reason',nullif(btrim(coalesce(target_reason,'')),'')
    )
  );
  return breaker_id;
end;
$$;

create or replace function public.get_execution_authority_workspace_v1(
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
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  caller_role:=private.execution_active_member_role(target_project,caller);

  return jsonb_build_object(
    'envelopes',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from public.authority_envelopes e
      where e.project_id=target_project
    ),'[]'::jsonb),
    'leases',coalesce((
      select jsonb_agg(to_jsonb(l) order by l.issued_at desc)
      from public.capability_leases l
      where l.project_id=target_project
    ),'[]'::jsonb),
    'breakers',coalesce((
      select jsonb_agg(to_jsonb(b) order by b.category)
      from public.execution_circuit_breakers b
      where b.project_id=target_project
    ),'[]'::jsonb),
    'capabilities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'capability',c.capability,
        'account_key',c.account_key,
        'connector_kind',c.connector_kind,
        'state',c.state,
        'enabled',c.enabled,
        'running',c.running,
        'concurrency_limit',c.concurrency_limit,
        'observed_at',c.observed_at
      ) order by c.capability,c.account_key)
      from public.capabilities c
      where c.project_id=target_project
    ),'[]'::jsonb),
    'caller_role',caller_role,
    'can_propose',caller_role in ('owner','admin','operator'),
    'can_approve_a3',caller_role in ('owner','admin'),
    'can_manage_breakers',caller_role in ('owner','admin'),
    'boundaries',jsonb_build_object(
      'capacity_reservation_is_authorization',false,
      'a4_generic_automation',false,
      'human_job_controls_require_authority_envelope',false,
      'phase_c_remains_independent',true
    )
  );
end;
$$;

create or replace function public.service_authorize_execution_v1(target_project uuid,target_job uuid,target_actor_key text,target_capability uuid,target_requested_operation text,target_purpose text,target_trace_id text,target_authority_envelope uuid,target_capability_lease uuid)returns jsonb language plpgsql security definer set search_path=public,private,auth as $$ declare existing_decision public.execution_authority_decisions%rowtype;job public.jobs%rowtype;envelope public.authority_envelopes%rowtype;lease public.capability_leases%rowtype;capability public.capabilities%rowtype;breaker public.execution_circuit_breakers%rowtype;breaker_category text;sponsor_role text;outcome text:='allow';reason_code text:='authority_allow';breaker_snapshot jsonb:='{}'::jsonb;capability_snapshot jsonb:='{}'::jsonb;resource_snapshot jsonb:='{}'::jsonb;decision_id uuid;max_ceiling_operations integer;begin if nullif(btrim(coalesce(target_trace_id,'')),'')is null then raise exception'Execution trace id is required.';end if;if target_requested_operation not in('observe','prepare','write','execute','promote','destruct')then raise exception'Unsupported execution operation.';end if;select*into existing_decision from public.execution_authority_decisions d where d.project_id=target_project and d.trace_id=target_trace_id and d.requested_operation=target_requested_operation;if found then return jsonb_build_object('decision_id',existing_decision.id,'outcome',existing_decision.outcome,'reason_code',existing_decision.reason_code,'trace_id',existing_decision.trace_id,'authority_envelope_id',existing_decision.authority_envelope_id,'capability_lease_id',existing_decision.capability_lease_id,'capability_id',existing_decision.capability_id,'autonomy_level',existing_decision.autonomy_level,'idempotent_replay',true);end if;select*into job from public.jobs where id=target_job;if not found then raise exception'Job not found.';end if;select*into envelope from public.authority_envelopes where id=target_authority_envelope;select*into capability from public.capabilities where id=target_capability;select*into lease from public.capability_leases where id=target_capability_lease for update;if found then select*into existing_decision from public.execution_authority_decisions d where d.project_id=target_project and d.trace_id=target_trace_id and d.requested_operation=target_requested_operation;if found then return jsonb_build_object('decision_id',existing_decision.id,'outcome',existing_decision.outcome,'reason_code',existing_decision.reason_code,'trace_id',existing_decision.trace_id,'authority_envelope_id',existing_decision.authority_envelope_id,'capability_lease_id',existing_decision.capability_lease_id,'capability_id',existing_decision.capability_id,'autonomy_level',existing_decision.autonomy_level,'idempotent_replay',true);end if;end if;if job.project_id<>target_project or envelope.id is null or envelope.project_id<>target_project or envelope.job_id<>target_job or capability.id is null or capability.project_id<>target_project or lease.id is null or lease.project_id<>target_project or lease.job_id<>target_job or lease.authority_envelope_id<>target_authority_envelope or lease.capability_id<>target_capability or envelope.actor_key<>target_actor_key or lease.actor_key<>target_actor_key then outcome:='deny';reason_code:='identity_mismatch';end if;if outcome='allow' then sponsor_role:=private.execution_active_member_role(target_project,envelope.sponsor_user_id);if sponsor_role is null then outcome:='deny';reason_code:='sponsor_inactive';end if;end if;if outcome='allow' and envelope.approval_state<>'approved' then outcome:='deny';reason_code:='envelope_not_approved';end if;if outcome='allow' and(envelope.revoked_at is not null or envelope.expires_at<=now())then outcome:='deny';reason_code:='envelope_expired';end if;if outcome='allow' and lease.status<>'active' then outcome:='deny';reason_code:=case when lease.status='exhausted' then'lease_exhausted' else'lease_not_active' end;end if;if outcome='allow' and lease.expires_at<=now()then outcome:='deny';reason_code:='lease_expired';end if;if outcome='allow' and lease.used_operations>=lease.max_operations then outcome:='deny';reason_code:='lease_exhausted';end if;if outcome='allow' and not(target_requested_operation=any(lease.allowed_operations))then outcome:='deny';reason_code:='operation_not_permitted';end if;if outcome='allow' and not(target_requested_operation=any(envelope.permitted_operations))then outcome:='deny';reason_code:='operation_not_permitted';end if;if outcome='allow' and not(capability.capability=any(envelope.permitted_capabilities))then outcome:='deny';reason_code:='capability_not_permitted';end if;if outcome='allow' and not private.execution_operation_allowed(envelope.autonomy_level,target_requested_operation)then outcome:='deny';reason_code:='autonomy_insufficient';end if;if outcome='allow' and envelope.autonomy_level='A4' then outcome:='deny';reason_code:='a4_high_impact_generic_automation_denied';end if;if outcome='allow' and target_requested_operation in('write','execute','promote','destruct')then if job.status not in('READY','QUEUED','MATCHING','RESERVED','RUNNING','VERIFYING','MANUAL_ACTION')then outcome:='review_required';reason_code:='job_not_execution_eligible';end if;elsif outcome='allow' and job.status in('CANCELLED','COMPLETED')then outcome:='deny';reason_code:='job_not_execution_eligible';end if;breaker_category:=private.execution_breaker_category(target_requested_operation,target_purpose);if outcome='allow' and breaker_category is not null then select*into breaker from public.execution_circuit_breakers where project_id=target_project and category=breaker_category;if not found then outcome:='review_required';reason_code:='breaker_missing';breaker_snapshot:=jsonb_build_object('category',breaker_category,'state','missing');else breaker_snapshot:=jsonb_build_object('id',breaker.id,'category',breaker.category,'state',breaker.state,'reason',breaker.reason,'updated_at',breaker.updated_at);if breaker.state='halted' then outcome:='deny';reason_code:='breaker_halted';end if;end if;end if;if capability.id is not null then capability_snapshot:=jsonb_build_object('id',capability.id,'capability',capability.capability,'state',capability.state,'enabled',capability.enabled,'running',capability.running,'concurrency_limit',capability.concurrency_limit,'observed_at',capability.observed_at);end if;if outcome='allow' and not capability.enabled then outcome:='deny';reason_code:='capability_disabled';end if;if outcome='allow' and capability.state in('DISABLED','OFFLINE','EXHAUSTED')then outcome:='deny';reason_code:='capability_unavailable';end if;if outcome='allow' and capability.state in('UNKNOWN','COOLDOWN')then outcome:='review_required';reason_code:='capability_health_unknown';end if;if outcome='allow' and capability.running>=capability.concurrency_limit then outcome:='deny';reason_code:='capability_concurrency_exhausted';end if;if envelope.id is not null then begin perform private.execution_validate_resource_ceiling(envelope.autonomy_level,envelope.resource_ceiling);if not(lease.resource_ceiling ?'max_operations')then outcome:='review_required';reason_code:='resource_ceiling_invalid';else max_ceiling_operations:=(lease.resource_ceiling->>'max_operations')::integer;if lease.max_operations>max_ceiling_operations then outcome:='deny';reason_code:='resource_ceiling_invalid';end if;end if;exception when others then outcome:='review_required';reason_code:='resource_ceiling_invalid';end;end if;resource_snapshot:=jsonb_build_object('lease_max_operations',lease.max_operations,'lease_used_operations',lease.used_operations,'lease_expires_at',lease.expires_at,'resource_ceiling',lease.resource_ceiling);if outcome='allow' then update public.capability_leases set used_operations=used_operations+1,last_used_at=now(),status=case when used_operations+1>=max_operations then'exhausted' else status end where id=lease.id returning*into lease;resource_snapshot:=resource_snapshot||jsonb_build_object('lease_used_operations_after',lease.used_operations,'lease_status_after',lease.status);end if;insert into public.execution_authority_decisions(project_id,job_id,actor_key,sponsor_user_id,authority_envelope_id,capability_lease_id,capability_id,requested_operation,purpose,autonomy_level,outcome,reason_code,breaker_snapshot,capability_state_snapshot,resource_usage_snapshot,trace_id)values(target_project,target_job,target_actor_key,case when envelope.id is null then null else envelope.sponsor_user_id end,case when envelope.id is null then null else envelope.id end,case when lease.id is null then null else lease.id end,case when capability.id is null then null else capability.id end,target_requested_operation,btrim(coalesce(target_purpose,'')),case when envelope.id is null then null else envelope.autonomy_level end,outcome,reason_code,breaker_snapshot,capability_snapshot,resource_snapshot,target_trace_id)returning id into decision_id;perform private.execution_record_event(target_project,target_job,'EXECUTION_AUTHORITY_EVALUATED','service_authority',jsonb_build_object('decision_id',decision_id,'trace_id',target_trace_id,'outcome',outcome,'reason_code',reason_code,'authority_envelope_id',case when envelope.id is null then null else envelope.id end,'capability_lease_id',case when lease.id is null then null else lease.id end,'capability_id',case when capability.id is null then null else capability.id end,'requested_operation',target_requested_operation));return jsonb_build_object('decision_id',decision_id,'outcome',outcome,'reason_code',reason_code,'trace_id',target_trace_id,'authority_envelope_id',case when envelope.id is null then null else envelope.id end,'capability_lease_id',case when lease.id is null then null else lease.id end,'capability_id',case when capability.id is null then null else capability.id end,'autonomy_level',case when envelope.id is null then null else envelope.autonomy_level end,'lease_status',case when lease.id is null then null else lease.status end,'lease_used_operations',case when lease.id is null then null else lease.used_operations end,'lease_max_operations',case when lease.id is null then null else lease.max_operations end);end;$$;revoke all on function private.execution_active_member_role(uuid,uuid)from public,anon,authenticated;revoke all on function private.execution_validate_context(uuid,uuid,uuid,text,uuid,text,uuid)from public,anon,authenticated;revoke all on function private.execution_validate_operations(text,text[],text)from public,anon,authenticated;revoke all on function private.execution_operation_allowed(text,text)from public,anon,authenticated;revoke all on function private.execution_validate_resource_ceiling(text,jsonb)from public,anon,authenticated;revoke all on function private.execution_breaker_category(text,text)from public,anon,authenticated;revoke all on function private.execution_record_event(uuid,uuid,text,text,jsonb)from public,anon,authenticated;revoke all on function public.propose_authority_envelope_v1(uuid,uuid,text,text,uuid,text,text,text[],text[],timestamptz,uuid,uuid,jsonb,jsonb,text,jsonb,text)from public,anon;revoke all on function public.approve_authority_envelope_v1(uuid)from public,anon;revoke all on function public.reject_authority_envelope_v1(uuid,text)from public,anon;revoke all on function public.revoke_authority_envelope_v1(uuid,text)from public,anon;revoke all on function public.issue_capability_lease_v1(uuid,uuid,text[],timestamptz,integer,text)from public,anon;revoke all on function public.release_capability_lease_v1(uuid,text)from public,anon;revoke all on function public.set_execution_circuit_breaker_v1(uuid,text,text,text)from public,anon;revoke all on function public.get_execution_authority_workspace_v1(uuid)from public,anon;revoke all on function public.service_authorize_execution_v1(uuid,uuid,text,uuid,text,text,text,uuid,uuid)from public,anon,authenticated;grant execute on function public.propose_authority_envelope_v1(uuid,uuid,text,text,uuid,text,text,text[],text[],timestamptz,uuid,uuid,jsonb,jsonb,text,jsonb,text)to authenticated,service_role;grant execute on function public.approve_authority_envelope_v1(uuid)to authenticated,service_role;grant execute on function public.reject_authority_envelope_v1(uuid,text)to authenticated,service_role;grant execute on function public.revoke_authority_envelope_v1(uuid,text)to authenticated,service_role;grant execute on function public.issue_capability_lease_v1(uuid,uuid,text[],timestamptz,integer,text)to authenticated,service_role;grant execute on function public.release_capability_lease_v1(uuid,text)to authenticated,service_role;grant execute on function public.set_execution_circuit_breaker_v1(uuid,text,text,text)to authenticated,service_role;grant execute on function public.get_execution_authority_workspace_v1(uuid)to authenticated,service_role;grant execute on function public.service_authorize_execution_v1(uuid,uuid,text,uuid,text,text,text,uuid,uuid)to service_role;commit;