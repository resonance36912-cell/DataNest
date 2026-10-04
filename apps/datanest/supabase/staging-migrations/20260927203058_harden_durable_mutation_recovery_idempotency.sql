create or replace function public.register_mutation_recovery_v1(
  target_project uuid,
  target_scope text,
  target_kind text,
  target_request_key uuid,
  target_payload jsonb,
  target_started_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path='recovery','public','auth'
as $function$
declare
  caller uuid := auth.uid();
  expected_scope text;
  exact_row recovery.mutation_recovery_ledger%rowtype;
  active_row recovery.mutation_recovery_ledger%rowtype;
  saved_row recovery.mutation_recovery_ledger%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not exists(
    select 1 from public.project_members pm
    where pm.project_id=target_project
      and pm.user_id=caller
      and pm.status='active'
  ) then
    raise insufficient_privilege using message='Active project membership is required.';
  end if;
  if target_kind not in ('unifi_job','spark_redemption','product_test_run') then
    raise invalid_parameter_value using message='Unsupported mutation recovery kind.';
  end if;

  expected_scope := case target_kind
    when 'unifi_job' then 'unifi-job:'||target_project::text||':'||caller::text
    when 'spark_redemption' then 'sparks-redemption:'||target_project::text||':'||caller::text
    when 'product_test_run' then 'productlab-test-run:'||target_project::text||':'||caller::text
  end;

  if target_scope is distinct from expected_scope then
    raise invalid_parameter_value using message='Mutation recovery scope does not match the authenticated project/user context.';
  end if;
  if target_request_key is null then
    raise invalid_parameter_value using message='Mutation recovery request identity is required.';
  end if;
  if target_payload is null or jsonb_typeof(target_payload)<>'object' or octet_length(target_payload::text)>16384 then
    raise invalid_parameter_value using message='Mutation recovery payload must be a bounded JSON object.';
  end if;

  select *
  into exact_row
  from recovery.mutation_recovery_ledger
  where project_id=target_project
    and user_id=caller
    and scope=target_scope
    and request_key=target_request_key
  limit 1
  for update;

  if found then
    if exact_row.mutation_kind<>target_kind or exact_row.payload<>target_payload then
      raise exception 'Recovery request identity already exists with a different payload.'
        using errcode='23505';
    end if;

    if exact_row.resolved_at is not null then
      return jsonb_build_object(
        'id',exact_row.id,
        'project_id',exact_row.project_id,
        'user_id',exact_row.user_id,
        'scope',exact_row.scope,
        'mutation_kind',exact_row.mutation_kind,
        'request_key',exact_row.request_key,
        'payload',exact_row.payload,
        'started_at',exact_row.started_at,
        'verification_state',exact_row.verification_state,
        'last_checked_at',exact_row.last_checked_at,
        'attempt_count',exact_row.attempt_count,
        'last_attempt_at',exact_row.last_attempt_at,
        'resolved_at',exact_row.resolved_at,
        'resolution',exact_row.resolution,
        'active',false
      );
    end if;

    update recovery.mutation_recovery_ledger
    set verification_state='unverified',
        last_checked_at=null,
        attempt_count=attempt_count+1,
        last_attempt_at=now(),
        updated_at=now()
    where id=exact_row.id
    returning * into saved_row;

    return jsonb_build_object(
      'id',saved_row.id,
      'project_id',saved_row.project_id,
      'user_id',saved_row.user_id,
      'scope',saved_row.scope,
      'mutation_kind',saved_row.mutation_kind,
      'request_key',saved_row.request_key,
      'payload',saved_row.payload,
      'started_at',saved_row.started_at,
      'verification_state',saved_row.verification_state,
      'last_checked_at',saved_row.last_checked_at,
      'attempt_count',saved_row.attempt_count,
      'last_attempt_at',saved_row.last_attempt_at,
      'resolved_at',null,
      'resolution',null,
      'active',true
    );
  end if;

  select *
  into active_row
  from recovery.mutation_recovery_ledger
  where project_id=target_project
    and user_id=caller
    and scope=target_scope
    and resolved_at is null
  limit 1
  for update;

  if found then
    raise exception 'An unresolved durable recovery already exists for this workflow scope.'
      using errcode='23505',
            hint='Reconcile or safely supersede the existing recovery identity before creating new intent.';
  end if;

  insert into recovery.mutation_recovery_ledger(
    project_id,user_id,scope,mutation_kind,request_key,payload,started_at,
    verification_state,last_checked_at,attempt_count,last_attempt_at
  )
  values(
    target_project,caller,target_scope,target_kind,target_request_key,target_payload,
    least(coalesce(target_started_at,now()),now()),
    'unverified',null,1,now()
  )
  returning * into saved_row;

  return jsonb_build_object(
    'id',saved_row.id,
    'project_id',saved_row.project_id,
    'user_id',saved_row.user_id,
    'scope',saved_row.scope,
    'mutation_kind',saved_row.mutation_kind,
    'request_key',saved_row.request_key,
    'payload',saved_row.payload,
    'started_at',saved_row.started_at,
    'verification_state',saved_row.verification_state,
    'last_checked_at',saved_row.last_checked_at,
    'attempt_count',saved_row.attempt_count,
    'last_attempt_at',saved_row.last_attempt_at,
    'resolved_at',null,
    'resolution',null,
    'active',true
  );
end;
$function$;

create or replace function public.resolve_mutation_recovery_v1(
  target_project uuid,
  target_scope text,
  target_request_key uuid,
  target_resolution text
)
returns jsonb
language plpgsql
security invoker
set search_path='recovery','public','auth'
as $function$
declare
  caller uuid := auth.uid();
  saved_row recovery.mutation_recovery_ledger%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not exists(
    select 1 from public.project_members pm
    where pm.project_id=target_project
      and pm.user_id=caller
      and pm.status='active'
  ) then
    raise insufficient_privilege using message='Active project membership is required.';
  end if;
  if target_resolution not in ('confirmed','superseded_after_absence') then
    raise invalid_parameter_value using message='Unsupported mutation recovery resolution.';
  end if;

  select *
  into saved_row
  from recovery.mutation_recovery_ledger
  where project_id=target_project
    and user_id=caller
    and scope=target_scope
    and request_key=target_request_key
  limit 1
  for update;

  if not found then
    raise exception 'Mutation recovery identity was not found.';
  end if;

  if saved_row.resolved_at is not null then
    if saved_row.resolution<>target_resolution then
      raise exception 'Mutation recovery identity is already finalized with a different resolution.';
    end if;
    return jsonb_build_object(
      'id',saved_row.id,
      'resolution',saved_row.resolution,
      'resolved_at',saved_row.resolved_at,
      'active',false
    );
  end if;

  if target_resolution='superseded_after_absence'
     and saved_row.verification_state<>'confirmed_absent' then
    raise exception 'A recovery identity can only be superseded after authoritative absence is confirmed.';
  end if;

  update recovery.mutation_recovery_ledger
  set resolved_at=now(),
      resolution=target_resolution,
      updated_at=now()
  where id=saved_row.id
  returning * into saved_row;

  return jsonb_build_object(
    'id',saved_row.id,
    'resolution',saved_row.resolution,
    'resolved_at',saved_row.resolved_at,
    'active',false
  );
end;
$function$;
