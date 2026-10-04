create schema if not exists recovery;
revoke all on schema recovery from public,anon;
grant usage on schema recovery to authenticated;

create table if not exists recovery.mutation_recovery_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  mutation_kind text not null check (mutation_kind in ('unifi_job','spark_redemption','product_test_run')),
  request_key uuid not null,
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  verification_state text not null default 'unverified'
    check (verification_state in ('unverified','unconfirmed','confirmed_absent')),
  last_checked_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_attempt_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('confirmed','superseded_after_absence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mutation_recovery_scope_length check (char_length(scope) between 10 and 240),
  constraint mutation_recovery_payload_object check (jsonb_typeof(payload)='object'),
  constraint mutation_recovery_payload_size check (octet_length(payload::text) <= 16384),
  constraint mutation_recovery_resolution_coherence check (
    (resolved_at is null and resolution is null)
    or
    (resolved_at is not null and resolution is not null)
  ),
  unique(project_id,user_id,scope,request_key)
);

create unique index if not exists mutation_recovery_one_active_scope_uidx
  on recovery.mutation_recovery_ledger(project_id,user_id,scope)
  where resolved_at is null;

create index if not exists mutation_recovery_user_project_active_idx
  on recovery.mutation_recovery_ledger(user_id,project_id,started_at)
  where resolved_at is null;

alter table recovery.mutation_recovery_ledger enable row level security;

grant select,insert,update on table recovery.mutation_recovery_ledger to authenticated;
revoke all on table recovery.mutation_recovery_ledger from anon;
revoke delete,truncate,references,trigger on table recovery.mutation_recovery_ledger from authenticated;

drop policy if exists mutation_recovery_select_own on recovery.mutation_recovery_ledger;
create policy mutation_recovery_select_own
on recovery.mutation_recovery_ledger
for select
to authenticated
using (
  user_id=(select auth.uid())
  and exists(
    select 1 from public.project_members pm
    where pm.project_id=mutation_recovery_ledger.project_id
      and pm.user_id=(select auth.uid())
      and pm.status='active'
  )
);

drop policy if exists mutation_recovery_insert_own on recovery.mutation_recovery_ledger;
create policy mutation_recovery_insert_own
on recovery.mutation_recovery_ledger
for insert
to authenticated
with check (
  user_id=(select auth.uid())
  and exists(
    select 1 from public.project_members pm
    where pm.project_id=mutation_recovery_ledger.project_id
      and pm.user_id=(select auth.uid())
      and pm.status='active'
  )
);

drop policy if exists mutation_recovery_update_own on recovery.mutation_recovery_ledger;
create policy mutation_recovery_update_own
on recovery.mutation_recovery_ledger
for update
to authenticated
using (
  user_id=(select auth.uid())
  and exists(
    select 1 from public.project_members pm
    where pm.project_id=mutation_recovery_ledger.project_id
      and pm.user_id=(select auth.uid())
      and pm.status='active'
  )
)
with check (
  user_id=(select auth.uid())
  and exists(
    select 1 from public.project_members pm
    where pm.project_id=mutation_recovery_ledger.project_id
      and pm.user_id=(select auth.uid())
      and pm.status='active'
  )
);

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
  existing_row recovery.mutation_recovery_ledger%rowtype;
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

  select * into existing_row
  from recovery.mutation_recovery_ledger
  where project_id=target_project
    and user_id=caller
    and scope=target_scope
    and resolved_at is null
  for update;

  if found then
    if existing_row.request_key<>target_request_key
       or existing_row.mutation_kind<>target_kind
       or existing_row.payload<>target_payload then
      raise exception 'An unresolved durable recovery already exists for this workflow scope.'
        using errcode='23505',
              hint='Reconcile or safely supersede the existing recovery identity before creating new intent.';
    end if;

    update recovery.mutation_recovery_ledger
    set verification_state='unverified',
        last_checked_at=null,
        attempt_count=attempt_count+1,
        last_attempt_at=now(),
        updated_at=now()
    where id=existing_row.id
    returning * into saved_row;
  else
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
  end if;

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
    'last_attempt_at',saved_row.last_attempt_at
  );
end;
$function$;

create or replace function public.mark_mutation_recovery_verification_v1(
  target_project uuid,
  target_scope text,
  target_request_key uuid,
  target_state text
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
  if target_state not in ('unconfirmed','confirmed_absent') then
    raise invalid_parameter_value using message='Unsupported recovery verification state.';
  end if;

  update recovery.mutation_recovery_ledger
  set verification_state=target_state,
      last_checked_at=now(),
      updated_at=now()
  where project_id=target_project
    and user_id=caller
    and scope=target_scope
    and request_key=target_request_key
    and resolved_at is null
  returning * into saved_row;

  if not found then
    raise exception 'Active mutation recovery identity was not found.';
  end if;

  return jsonb_build_object(
    'id',saved_row.id,
    'verification_state',saved_row.verification_state,
    'last_checked_at',saved_row.last_checked_at
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

  select * into saved_row
  from recovery.mutation_recovery_ledger
  where project_id=target_project
    and user_id=caller
    and scope=target_scope
    and request_key=target_request_key
    and resolved_at is null
  for update;

  if not found then
    raise exception 'Active mutation recovery identity was not found.';
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
    'resolved_at',saved_row.resolved_at
  );
end;
$function$;

create or replace function public.list_mutation_recoveries_v1(target_project uuid)
returns jsonb
language sql
stable
security invoker
set search_path='recovery','public','auth'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,
        'project_id',r.project_id,
        'user_id',r.user_id,
        'scope',r.scope,
        'mutation_kind',r.mutation_kind,
        'request_key',r.request_key,
        'payload',r.payload,
        'started_at',r.started_at,
        'verification_state',r.verification_state,
        'last_checked_at',r.last_checked_at,
        'attempt_count',r.attempt_count,
        'last_attempt_at',r.last_attempt_at
      )
      order by r.started_at
    ),
    '[]'::jsonb
  )
  from recovery.mutation_recovery_ledger r
  where r.project_id=target_project
    and r.user_id=auth.uid()
    and r.resolved_at is null;
$function$;

revoke all on function public.register_mutation_recovery_v1(uuid,text,text,uuid,jsonb,timestamptz) from public,anon;
revoke all on function public.mark_mutation_recovery_verification_v1(uuid,text,uuid,text) from public,anon;
revoke all on function public.resolve_mutation_recovery_v1(uuid,text,uuid,text) from public,anon;
revoke all on function public.list_mutation_recoveries_v1(uuid) from public,anon;
grant execute on function public.register_mutation_recovery_v1(uuid,text,text,uuid,jsonb,timestamptz) to authenticated;
grant execute on function public.mark_mutation_recovery_verification_v1(uuid,text,uuid,text) to authenticated;
grant execute on function public.resolve_mutation_recovery_v1(uuid,text,uuid,text) to authenticated;
grant execute on function public.list_mutation_recoveries_v1(uuid) to authenticated;
