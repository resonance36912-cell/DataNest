begin;

create table if not exists public.spark_economy_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  policy_version text not null,
  status text not null default 'active' check (status in ('active','retired')),
  internal_utility_only boolean not null default true check (internal_utility_only=true),
  project_spend_enabled boolean not null default true,
  platform_spend_enabled boolean not null default false check (platform_spend_enabled=false),
  cash_purchase_enabled boolean not null default false check (cash_purchase_enabled=false),
  cash_redemption_enabled boolean not null default false check (cash_redemption_enabled=false),
  p2p_transfer_enabled boolean not null default false check (p2p_transfer_enabled=false),
  external_transfer_enabled boolean not null default false check (external_transfer_enabled=false),
  secondary_market_enabled boolean not null default false check (secondary_market_enabled=false),
  contribution_history_changes_on_spend boolean not null default false check (contribution_history_changes_on_spend=false),
  created_by uuid references auth.users(id),
  effective_from timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id,policy_version)
);

create unique index if not exists spark_economy_one_active_policy_idx
  on public.spark_economy_policies(project_id)
  where status='active';
create index if not exists spark_economy_policies_created_by_idx
  on public.spark_economy_policies(created_by)
  where created_by is not null;

create table if not exists public.spark_service_catalog (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  policy_id uuid not null references public.spark_economy_policies(id) on delete restrict,
  service_key text not null,
  service_version integer not null check (service_version > 0),
  name text not null,
  description text,
  spark_price numeric not null check (spark_price > 0),
  account_type text not null default 'project' check (account_type='project'),
  fulfillment_mode text not null default 'manual' check (fulfillment_mode='manual'),
  status text not null default 'active' check (status in ('active','paused','retired')),
  terms text,
  terms_version text not null default 'spark-service-v1',
  created_by uuid not null references auth.users(id),
  activated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  retired_at timestamptz,
  unique(project_id,service_key,service_version),
  check (service_key ~ '^[a-z0-9][a-z0-9._-]{1,63}$')
);

create unique index if not exists spark_service_catalog_one_active_key_idx
  on public.spark_service_catalog(project_id,service_key)
  where status='active';
create index if not exists spark_service_catalog_project_idx
  on public.spark_service_catalog(project_id,status,name);
create index if not exists spark_service_catalog_policy_idx
  on public.spark_service_catalog(policy_id);
create index if not exists spark_service_catalog_created_by_idx
  on public.spark_service_catalog(created_by);
create index if not exists spark_service_catalog_activated_by_idx
  on public.spark_service_catalog(activated_by);

create table if not exists public.spark_redemptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.spark_service_catalog(id) on delete restrict,
  spend_account_id uuid not null references public.spark_accounts(id) on delete restrict,
  locked_account_id uuid not null references public.spark_accounts(id) on delete restrict,
  request_key uuid not null,
  trace_key text not null unique,
  service_key_snapshot text not null,
  service_version_snapshot integer not null,
  service_name_snapshot text not null,
  policy_version text not null,
  quantity integer not null check (quantity > 0 and quantity <= 100),
  unit_spark_price numeric not null check (unit_spark_price > 0),
  total_sparks numeric not null check (total_sparks > 0),
  status text not null default 'held' check (status in ('held','fulfilled','cancelled','rejected')),
  request_note text,
  resolution_note text,
  requested_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,request_key),
  check (total_sparks = unit_spark_price * quantity)
);

create index if not exists spark_redemptions_project_status_idx
  on public.spark_redemptions(project_id,status,requested_at desc);
create index if not exists spark_redemptions_user_idx
  on public.spark_redemptions(user_id,requested_at desc);
create index if not exists spark_redemptions_service_idx
  on public.spark_redemptions(service_id,requested_at desc);
create index if not exists spark_redemptions_spend_account_idx
  on public.spark_redemptions(spend_account_id);
create index if not exists spark_redemptions_locked_account_idx
  on public.spark_redemptions(locked_account_id);
create index if not exists spark_redemptions_resolved_by_idx
  on public.spark_redemptions(resolved_by)
  where resolved_by is not null;

insert into public.spark_economy_policies(
  project_id,policy_version,status,created_by
)
select
  p.id,
  'internal-utility-v1',
  'active',
  (
    select pm.user_id
    from public.project_members pm
    where pm.project_id=p.id
      and pm.status='active'
      and pm.role='owner'
    order by pm.created_at
    limit 1
  )
from public.projects p
on conflict(project_id,policy_version) do nothing;

create or replace function private.get_spark_account_balance(
  target_account uuid
) returns numeric
language sql
stable
security definer
set search_path=public,private
as $$
  select coalesce(sum(l.amount),0::numeric)
  from public.spark_ledger_entries l
  where l.account_id=target_account;
$$;

create or replace function public.publish_spark_service_v1(
  target_project uuid,
  target_service_key text,
  target_name text,
  target_spark_price numeric,
  target_description text default null,
  target_terms text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  policy public.spark_economy_policies%rowtype;
  next_version integer;
  normalized_key text;
  new_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  normalized_key := lower(btrim(coalesce(target_service_key,'')));
  if normalized_key !~ '^[a-z0-9][a-z0-9._-]{1,63}$' then
    raise exception 'Service key must use 2-64 lowercase letters, numbers, dot, underscore or hyphen.';
  end if;
  if nullif(btrim(coalesce(target_name,'')),'') is null then
    raise exception 'Service name is required.';
  end if;
  if target_spark_price is null or target_spark_price<=0 or target_spark_price>1000000000 then
    raise exception 'Spark price must be greater than zero and within the governed limit.';
  end if;

  select * into policy
  from public.spark_economy_policies
  where project_id=target_project and status='active'
  order by effective_from desc,created_at desc
  limit 1;

  if not found then
    raise exception 'An active Spark economy policy is required.';
  end if;

  if not policy.internal_utility_only
     or not policy.project_spend_enabled
     or policy.platform_spend_enabled
     or policy.cash_purchase_enabled
     or policy.cash_redemption_enabled
     or policy.p2p_transfer_enabled
     or policy.external_transfer_enabled
     or policy.secondary_market_enabled
     or policy.contribution_history_changes_on_spend then
    raise exception 'The active Spark policy violates internal-utility-v1 boundaries.';
  end if;

  select coalesce(max(service_version),0)+1
  into next_version
  from public.spark_service_catalog
  where project_id=target_project and service_key=normalized_key;

  update public.spark_service_catalog
  set status='retired',retired_at=now()
  where project_id=target_project
    and service_key=normalized_key
    and status='active';

  insert into public.spark_service_catalog(
    project_id,policy_id,service_key,service_version,name,description,
    spark_price,account_type,fulfillment_mode,status,terms,created_by,activated_by
  )
  values(
    target_project,policy.id,normalized_key,next_version,btrim(target_name),
    nullif(btrim(coalesce(target_description,'')),''),
    target_spark_price,'project','manual','active',
    nullif(btrim(coalesce(target_terms,'')),''),
    caller,caller
  )
  returning id into new_id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,
    'SPARK_SERVICE_PUBLISHED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'service_id',new_id,
      'service_key',normalized_key,
      'service_version',next_version,
      'spark_price',target_spark_price,
      'policy_version',policy.policy_version,
      'cash_value',false
    )
  );

  return new_id;
end;
$$;

create or replace function public.set_spark_service_status_v1(
  target_service uuid,
  target_status text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  service_row public.spark_service_catalog%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_status not in ('paused','retired') then
    raise exception 'Service status may only move to paused or retired. Publish a new version to activate again.';
  end if;

  select * into service_row
  from public.spark_service_catalog
  where id=target_service
  for update;

  if not found then raise exception 'Spark service not found.'; end if;
  if not private.has_project_role(service_row.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if service_row.status=target_status then return service_row.id; end if;
  if service_row.status='retired' then
    raise exception 'Retired Spark services are immutable.';
  end if;

  update public.spark_service_catalog
  set status=target_status,
      retired_at=case when target_status='retired' then now() else retired_at end
  where id=service_row.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    service_row.project_id,
    'SPARK_SERVICE_STATUS_CHANGED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'service_id',service_row.id,
      'service_key',service_row.service_key,
      'status',target_status
    )
  );

  return service_row.id;
end;
$$;

create or replace function public.request_spark_redemption_v1(
  target_service uuid,
  target_quantity integer,
  target_request_key uuid,
  target_note text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  service_row public.spark_service_catalog%rowtype;
  policy public.spark_economy_policies%rowtype;
  existing public.spark_redemptions%rowtype;
  spend_account uuid;
  locked_account uuid;
  available numeric;
  total numeric;
  redemption_id uuid;
  trace text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_request_key is null then raise exception 'A request key is required.'; end if;
  if target_quantity is null or target_quantity<1 or target_quantity>100 then
    raise exception 'Quantity must be between 1 and 100.';
  end if;

  select * into service_row
  from public.spark_service_catalog
  where id=target_service and status='active';

  if not found then raise exception 'Active Spark service not found.'; end if;
  if not private.has_project_access(service_row.project_id) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select * into existing
  from public.spark_redemptions
  where user_id=caller and request_key=target_request_key;

  if found then
    if existing.service_id<>target_service or existing.quantity<>target_quantity then
      raise exception 'Request key already exists for a different Spark redemption payload.';
    end if;
    return existing.id;
  end if;

  select * into policy
  from public.spark_economy_policies
  where id=service_row.policy_id
    and project_id=service_row.project_id
    and status='active';

  if not found then raise exception 'The service policy is no longer active.'; end if;

  if not policy.internal_utility_only
     or not policy.project_spend_enabled
     or policy.platform_spend_enabled
     or policy.cash_purchase_enabled
     or policy.cash_redemption_enabled
     or policy.p2p_transfer_enabled
     or policy.external_transfer_enabled
     or policy.secondary_market_enabled
     or policy.contribution_history_changes_on_spend then
    raise exception 'Spark redemption is disabled by the active internal-utility policy.';
  end if;

  total := service_row.spark_price*target_quantity;
  spend_account := private.ensure_spark_account(caller,service_row.project_id,'project');
  locked_account := private.ensure_spark_account(caller,service_row.project_id,'locked');

  perform id
  from public.spark_accounts
  where id in (spend_account,locked_account)
  order by id
  for update;

  available := private.get_spark_account_balance(spend_account);
  if available<total then
    raise exception 'Insufficient spendable Project Sparks.';
  end if;

  redemption_id := gen_random_uuid();
  trace := 'DN-SPARK-REDEEM-' || upper(substr(replace(redemption_id::text,'-',''),1,16));

  insert into public.spark_redemptions(
    id,project_id,user_id,service_id,spend_account_id,locked_account_id,
    request_key,trace_key,service_key_snapshot,service_version_snapshot,
    service_name_snapshot,policy_version,quantity,unit_spark_price,total_sparks,
    status,request_note
  )
  values(
    redemption_id,service_row.project_id,caller,service_row.id,spend_account,locked_account,
    target_request_key,trace,service_row.service_key,service_row.service_version,
    service_row.name,policy.policy_version,target_quantity,service_row.spark_price,total,
    'held',nullif(btrim(coalesce(target_note,'')),'')
  );

  insert into public.spark_ledger_entries(
    account_id,user_id,project_id,entry_type,amount,trace_key,policy_version,metadata,created_by
  )
  values
  (
    spend_account,caller,service_row.project_id,'hold',-total,
    trace||'-HOLD-OUT',policy.policy_version,
    jsonb_build_object(
      'redemption_id',redemption_id,
      'service_id',service_row.id,
      'service_key',service_row.service_key,
      'quantity',target_quantity,
      'direction','spendable_to_locked',
      'cash_value',false
    ),
    caller
  ),
  (
    locked_account,caller,service_row.project_id,'hold',total,
    trace||'-HOLD-IN',policy.policy_version,
    jsonb_build_object(
      'redemption_id',redemption_id,
      'service_id',service_row.id,
      'service_key',service_row.service_key,
      'quantity',target_quantity,
      'direction','spendable_to_locked',
      'cash_value',false
    ),
    caller
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    service_row.project_id,
    'SPARK_REDEMPTION_HELD',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'redemption_id',redemption_id,
      'trace_key',trace,
      'service_id',service_row.id,
      'service_key',service_row.service_key,
      'quantity',target_quantity,
      'total_sparks',total,
      'cash_value',false
    )
  );

  return redemption_id;
end;
$$;

create or replace function public.cancel_spark_redemption_v1(
  target_redemption uuid,
  target_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  redemption public.spark_redemptions%rowtype;
  resolution_status text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into redemption
  from public.spark_redemptions
  where id=target_redemption
  for update;

  if not found then raise exception 'Spark redemption not found.'; end if;
  if redemption.status in ('cancelled','rejected') then return redemption.id; end if;
  if redemption.status='fulfilled' then
    raise exception 'Fulfilled Spark redemptions cannot be cancelled.';
  end if;

  if redemption.user_id<>caller
     and not private.has_project_role(redemption.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Only the requester or project operators may cancel this redemption.';
  end if;

  perform id
  from public.spark_accounts
  where id in (redemption.spend_account_id,redemption.locked_account_id)
  order by id
  for update;

  if private.get_spark_account_balance(redemption.locked_account_id)<redemption.total_sparks then
    raise exception 'Locked Spark balance is inconsistent with the redemption hold.';
  end if;

  insert into public.spark_ledger_entries(
    account_id,user_id,project_id,entry_type,amount,trace_key,policy_version,metadata,created_by
  )
  values
  (
    redemption.locked_account_id,redemption.user_id,redemption.project_id,'release',-redemption.total_sparks,
    redemption.trace_key||'-RELEASE-OUT',redemption.policy_version,
    jsonb_build_object('redemption_id',redemption.id,'direction','locked_to_spendable','cash_value',false),
    caller
  ),
  (
    redemption.spend_account_id,redemption.user_id,redemption.project_id,'release',redemption.total_sparks,
    redemption.trace_key||'-RELEASE-IN',redemption.policy_version,
    jsonb_build_object('redemption_id',redemption.id,'direction','locked_to_spendable','cash_value',false),
    caller
  );

  resolution_status := case when redemption.user_id=caller then 'cancelled' else 'rejected' end;

  update public.spark_redemptions
  set status=resolution_status,
      resolution_note=nullif(btrim(coalesce(target_reason,'')),''),
      resolved_by=caller,
      resolved_at=now()
  where id=redemption.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    redemption.project_id,
    case when resolution_status='cancelled' then 'SPARK_REDEMPTION_CANCELLED' else 'SPARK_REDEMPTION_REJECTED' end,
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'redemption_id',redemption.id,
      'trace_key',redemption.trace_key,
      'total_sparks',redemption.total_sparks,
      'status',resolution_status,
      'cash_value',false
    )
  );

  return redemption.id;
end;
$$;

create or replace function public.fulfill_spark_redemption_v1(
  target_redemption uuid,
  target_note text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  redemption public.spark_redemptions%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into redemption
  from public.spark_redemptions
  where id=target_redemption
  for update;

  if not found then raise exception 'Spark redemption not found.'; end if;
  if redemption.status='fulfilled' then return redemption.id; end if;
  if redemption.status<>'held' then
    raise exception 'Only held Spark redemptions may be fulfilled.';
  end if;
  if not private.has_project_role(redemption.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin or operator access is required.';
  end if;

  perform id
  from public.spark_accounts
  where id=redemption.locked_account_id
  for update;

  if private.get_spark_account_balance(redemption.locked_account_id)<redemption.total_sparks then
    raise exception 'Locked Spark balance is inconsistent with the redemption hold.';
  end if;

  insert into public.spark_ledger_entries(
    account_id,user_id,project_id,entry_type,amount,trace_key,policy_version,metadata,created_by
  )
  values(
    redemption.locked_account_id,redemption.user_id,redemption.project_id,
    'service_spend',-redemption.total_sparks,
    redemption.trace_key||'-SPEND',redemption.policy_version,
    jsonb_build_object(
      'redemption_id',redemption.id,
      'service_id',redemption.service_id,
      'service_key',redemption.service_key_snapshot,
      'service_version',redemption.service_version_snapshot,
      'quantity',redemption.quantity,
      'cash_value',false
    ),
    caller
  );

  update public.spark_redemptions
  set status='fulfilled',
      resolution_note=nullif(btrim(coalesce(target_note,'')),''),
      resolved_by=caller,
      resolved_at=now()
  where id=redemption.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    redemption.project_id,
    'SPARK_REDEMPTION_FULFILLED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'redemption_id',redemption.id,
      'trace_key',redemption.trace_key,
      'service_id',redemption.service_id,
      'service_key',redemption.service_key_snapshot,
      'total_sparks',redemption.total_sparks,
      'cash_value',false
    )
  );

  return redemption.id;
end;
$$;

create or replace function public.get_sparks_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  policy jsonb;
  balances jsonb;
  services jsonb;
  redemptions jsonb;
  ledger jsonb;
  metrics jsonb;
  can_operate boolean;
  can_manage boolean;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  can_operate := private.has_project_role(target_project,array['owner','admin','operator']);
  can_manage := private.has_project_role(target_project,array['owner','admin']);

  select to_jsonb(p) into policy
  from public.spark_economy_policies p
  where p.project_id=target_project and p.status='active'
  order by p.effective_from desc,p.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',b.account_id,
    'account_type',b.account_type,
    'project_id',b.project_id,
    'balance',b.balance
  ) order by b.account_type),'[]'::jsonb)
  into balances
  from public.spark_account_balances b
  where b.user_id=caller
    and (b.project_id=target_project or b.project_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'service_key',s.service_key,
    'service_version',s.service_version,
    'name',s.name,
    'description',s.description,
    'spark_price',s.spark_price,
    'status',s.status,
    'fulfillment_mode',s.fulfillment_mode,
    'terms',s.terms,
    'terms_version',s.terms_version
  ) order by s.name,s.service_version desc),'[]'::jsonb)
  into services
  from public.spark_service_catalog s
  where s.project_id=target_project
    and s.status='active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'trace_key',r.trace_key,
    'user_id',r.user_id,
    'service_id',r.service_id,
    'service_key',r.service_key_snapshot,
    'service_version',r.service_version_snapshot,
    'service_name',r.service_name_snapshot,
    'quantity',r.quantity,
    'unit_spark_price',r.unit_spark_price,
    'total_sparks',r.total_sparks,
    'status',r.status,
    'request_note',r.request_note,
    'resolution_note',r.resolution_note,
    'requested_at',r.requested_at,
    'resolved_at',r.resolved_at
  ) order by r.requested_at desc),'[]'::jsonb)
  into redemptions
  from public.spark_redemptions r
  where r.project_id=target_project
    and (r.user_id=caller or can_operate)
  limit 100;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,
    'entry_type',q.entry_type,
    'amount',q.amount,
    'trace_key',q.trace_key,
    'policy_version',q.policy_version,
    'account_type',q.account_type,
    'metadata',q.metadata,
    'created_at',q.created_at
  ) order by q.created_at desc),'[]'::jsonb)
  into ledger
  from (
    select l.id,l.entry_type,l.amount,l.trace_key,l.policy_version,l.metadata,l.created_at,a.account_type
    from public.spark_ledger_entries l
    join public.spark_accounts a on a.id=l.account_id
    where l.user_id=caller
      and (l.project_id=target_project or (l.project_id is null and a.account_type='platform'))
    order by l.created_at desc
    limit 100
  ) q;

  select jsonb_build_object(
    'lifetime_contribution_awards',coalesce(sum(l.amount) filter (where l.entry_type='contribution_award' and l.amount>0),0),
    'lifetime_service_spend',coalesce(-sum(l.amount) filter (where l.entry_type='service_spend' and l.amount<0),0),
    'held_redemptions',(
      select count(*) from public.spark_redemptions r
      where r.project_id=target_project and r.user_id=caller and r.status='held'
    ),
    'fulfilled_redemptions',(
      select count(*) from public.spark_redemptions r
      where r.project_id=target_project and r.user_id=caller and r.status='fulfilled'
    )
  )
  into metrics
  from public.spark_ledger_entries l
  where l.user_id=caller and l.project_id=target_project;

  return jsonb_build_object(
    'policy',coalesce(policy,'{}'::jsonb),
    'balances',coalesce(balances,'[]'::jsonb),
    'services',coalesce(services,'[]'::jsonb),
    'redemptions',coalesce(redemptions,'[]'::jsonb),
    'ledger',coalesce(ledger,'[]'::jsonb),
    'metrics',coalesce(metrics,'{}'::jsonb),
    'can_operate',can_operate,
    'can_manage_services',can_manage,
    'boundaries',jsonb_build_object(
      'internal_utility_only',true,
      'cash_purchase_enabled',false,
      'cash_redemption_enabled',false,
      'p2p_transfer_enabled',false,
      'external_transfer_enabled',false,
      'secondary_market_enabled',false,
      'platform_spend_enabled',false,
      'spending_changes_contribution_history',false,
      'spending_changes_reputation',false,
      'spending_changes_royalty_or_ownership',false
    )
  );
end;
$$;

alter table public.spark_economy_policies enable row level security;
alter table public.spark_service_catalog enable row level security;
alter table public.spark_redemptions enable row level security;

drop policy if exists spark_economy_policies_select on public.spark_economy_policies;
create policy spark_economy_policies_select
on public.spark_economy_policies for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists spark_service_catalog_select on public.spark_service_catalog;
create policy spark_service_catalog_select
on public.spark_service_catalog for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists spark_redemptions_select on public.spark_redemptions;
create policy spark_redemptions_select
on public.spark_redemptions for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin','operator'])
);

revoke all on public.spark_economy_policies from anon,authenticated;
revoke all on public.spark_service_catalog from anon,authenticated;
revoke all on public.spark_redemptions from anon,authenticated;

grant select on public.spark_economy_policies to authenticated;
grant select on public.spark_service_catalog to authenticated;
grant select on public.spark_redemptions to authenticated;

revoke all on function public.publish_spark_service_v1(uuid,text,text,numeric,text,text) from public,anon;
revoke all on function public.set_spark_service_status_v1(uuid,text) from public,anon;
revoke all on function public.request_spark_redemption_v1(uuid,integer,uuid,text) from public,anon;
revoke all on function public.cancel_spark_redemption_v1(uuid,text) from public,anon;
revoke all on function public.fulfill_spark_redemption_v1(uuid,text) from public,anon;
revoke all on function public.get_sparks_workspace_v1(uuid) from public,anon;

grant execute on function public.publish_spark_service_v1(uuid,text,text,numeric,text,text) to authenticated;
grant execute on function public.set_spark_service_status_v1(uuid,text) to authenticated;
grant execute on function public.request_spark_redemption_v1(uuid,integer,uuid,text) to authenticated;
grant execute on function public.cancel_spark_redemption_v1(uuid,text) to authenticated;
grant execute on function public.fulfill_spark_redemption_v1(uuid,text) to authenticated;
grant execute on function public.get_sparks_workspace_v1(uuid) to authenticated;

commit;
