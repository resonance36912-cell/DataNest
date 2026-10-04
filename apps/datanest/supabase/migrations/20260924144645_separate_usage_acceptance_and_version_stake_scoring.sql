
alter table public.contribution_ledger
  add column if not exists proposed_points numeric not null default 0,
  add column if not exists evidence_state text not null default 'reported',
  add column if not exists contribution_state text not null default 'reported',
  add column if not exists scoring_state text not null default 'unscored',
  add column if not exists accepted_by uuid references auth.users(id),
  add column if not exists accepted_at timestamptz,
  add column if not exists scored_at timestamptz,
  add column if not exists score_policy_version_id uuid,
  add column if not exists score_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists request_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contribution_ledger'::regclass
      and conname='contribution_ledger_evidence_state_check'
  ) then
    alter table public.contribution_ledger
      add constraint contribution_ledger_evidence_state_check
      check (evidence_state in ('reported','verified_activity','verified_usage'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contribution_ledger'::regclass
      and conname='contribution_ledger_contribution_state_check'
  ) then
    alter table public.contribution_ledger
      add constraint contribution_ledger_contribution_state_check
      check (contribution_state in ('reported','accepted','rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contribution_ledger'::regclass
      and conname='contribution_ledger_scoring_state_check'
  ) then
    alter table public.contribution_ledger
      add constraint contribution_ledger_scoring_state_check
      check (scoring_state in ('unscored','scored'));
  end if;
end $$;

create table if not exists public.stake_policy_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  formula_version text not null,
  weights jsonb not null,
  currency text not null,
  stakeholder_pool_percent numeric(7,4),
  non_binding boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id,version)
);

create table if not exists public.contribution_adjustments (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contribution_ledger(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('reversal','correction')),
  delta_points numeric not null,
  delta_quantity numeric not null default 0,
  reason text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists contribution_single_reversal_idx
  on public.contribution_adjustments(contribution_id)
  where adjustment_type='reversal';

create table if not exists public.stake_calculation_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  policy_version_id uuid references public.stake_policy_versions(id),
  trigger_type text not null,
  trigger_ref uuid,
  snapshot jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.stake_policy_versions enable row level security;
alter table public.contribution_adjustments enable row level security;
alter table public.stake_calculation_snapshots enable row level security;

create policy stake_policy_versions_select on public.stake_policy_versions
for select to authenticated
using (private.has_project_access(project_id));

create policy contribution_adjustments_select on public.contribution_adjustments
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

create policy stake_calculation_snapshots_select on public.stake_calculation_snapshots
for select to authenticated
using (private.has_project_access(project_id));

grant select on public.stake_policy_versions,public.contribution_adjustments,public.stake_calculation_snapshots
to authenticated;

insert into public.stake_policy_versions(
  project_id,version,formula_version,weights,currency,stakeholder_pool_percent,non_binding,created_by
)
select
  sp.project_id,1,sp.formula_version,sp.weights,sp.currency,sp.stakeholder_pool_percent,sp.non_binding,sp.updated_by
from public.stake_policies sp
where not exists (
  select 1 from public.stake_policy_versions v where v.project_id=sp.project_id
);

update public.contribution_ledger cl
set
  proposed_points=case when cl.proposed_points=0 then cl.points else cl.proposed_points end,
  evidence_state=case
    when cl.verification_source='provider_reported_usage' then 'verified_usage'
    when cl.verified then 'verified_activity'
    else 'reported'
  end,
  contribution_state=case when cl.verified then 'accepted' else 'reported' end,
  scoring_state=case when cl.verified then 'scored' else 'unscored' end,
  accepted_at=case when cl.verified then coalesce(cl.accepted_at,cl.created_at) else cl.accepted_at end,
  scored_at=case when cl.verified then coalesce(cl.scored_at,cl.created_at) else cl.scored_at end,
  score_policy_version_id=case
    when cl.verified then coalesce(
      cl.score_policy_version_id,
      (select v.id from public.stake_policy_versions v
       where v.project_id=cl.project_id
       order by v.version desc limit 1)
    )
    else cl.score_policy_version_id
  end,
  score_snapshot=case
    when cl.verified and cl.score_snapshot='{}'::jsonb then coalesce(
      (select jsonb_build_object(
        'policy_version_id',v.id,
        'version',v.version,
        'formula_version',v.formula_version,
        'weights',v.weights,
        'currency',v.currency,
        'stakeholder_pool_percent',v.stakeholder_pool_percent
      )
      from public.stake_policy_versions v
      where v.project_id=cl.project_id
      order by v.version desc limit 1),
      '{}'::jsonb
    )
    else cl.score_snapshot
  end;

alter table public.contribution_ledger
  drop constraint if exists contribution_ledger_score_policy_version_id_fkey;

alter table public.contribution_ledger
  add constraint contribution_ledger_score_policy_version_id_fkey
  foreign key (score_policy_version_id)
  references public.stake_policy_versions(id);

create index if not exists contribution_ledger_policy_version_idx
  on public.contribution_ledger(score_policy_version_id);
create index if not exists contribution_adjustments_project_user_idx
  on public.contribution_adjustments(project_id,user_id,created_at desc);
create index if not exists stake_policy_versions_project_idx
  on public.stake_policy_versions(project_id,version desc);
create index if not exists stake_snapshots_project_idx
  on public.stake_calculation_snapshots(project_id,created_at desc);

create or replace function private.current_stake_policy_version(target_project uuid)
returns public.stake_policy_versions
language sql
stable
security definer
set search_path = public, private
as $$
  select v
  from public.stake_policy_versions v
  where v.project_id=target_project
  order by v.version desc
  limit 1;
$$;

create or replace function private.insert_contribution(
  target_project uuid,
  target_job uuid,
  target_user uuid,
  target_type text,
  target_quantity numeric,
  target_unit text,
  target_points numeric,
  target_verified boolean,
  target_source_ref text,
  target_metadata jsonb default '{}'::jsonb,
  target_monetary_value_minor bigint default null,
  target_currency text default null,
  target_verification_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare new_id uuid;
begin
  if target_user is null then return null; end if;

  insert into public.contribution_ledger(
    project_id,job_id,user_id,contribution_type,quantity,unit,
    points,proposed_points,monetary_value_minor,currency,
    verified,verification_source,evidence_state,
    contribution_state,scoring_state,source_ref,metadata
  )
  values(
    target_project,target_job,target_user,target_type,
    coalesce(target_quantity,1),coalesce(target_unit,'event'),
    0,coalesce(target_points,0),
    target_monetary_value_minor,target_currency,
    coalesce(target_verified,false),target_verification_source,
    case
      when coalesce(target_verified,false) and target_verification_source='provider_reported_usage' then 'verified_usage'
      when coalesce(target_verified,false) then 'verified_activity'
      else 'reported'
    end,
    'reported','unscored',target_source_ref,coalesce(target_metadata,'{}'::jsonb)
  )
  on conflict (project_id,user_id,contribution_type,source_ref)
  where source_ref is not null
  do update set
    quantity=excluded.quantity,
    unit=excluded.unit,
    proposed_points=greatest(public.contribution_ledger.proposed_points,excluded.proposed_points),
    monetary_value_minor=coalesce(excluded.monetary_value_minor,public.contribution_ledger.monetary_value_minor),
    currency=coalesce(excluded.currency,public.contribution_ledger.currency),
    verified=public.contribution_ledger.verified or excluded.verified,
    verification_source=coalesce(excluded.verification_source,public.contribution_ledger.verification_source),
    evidence_state=case
      when public.contribution_ledger.evidence_state='verified_usage' or excluded.evidence_state='verified_usage' then 'verified_usage'
      when public.contribution_ledger.evidence_state='verified_activity' or excluded.evidence_state='verified_activity' then 'verified_activity'
      else 'reported'
    end,
    metadata=public.contribution_ledger.metadata || excluded.metadata
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function private.get_stakeholder_summary(target_project uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  pool numeric;
  result jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Stakeholder access is required.';
  end if;

  select stakeholder_pool_percent into pool
  from public.stake_policies where project_id=target_project;

  with adjustment_totals as (
    select contribution_id,coalesce(sum(delta_points),0) as delta_points
    from public.contribution_adjustments
    group by contribution_id
  ),
  contributions as (
    select
      sp.user_id,
      sp.status,
      sp.origin,
      sp.first_accepted_at,
      au.email,
      coalesce(sum(
        case
          when cl.contribution_state='accepted' and cl.scoring_state='scored'
          then cl.points + coalesce(adj.delta_points,0)
          else 0
        end
      ),0) as accepted_points,
      coalesce(sum(cl.proposed_points) filter (where cl.contribution_state <> 'rejected'),0) as tracked_points,
      count(*) filter (where cl.contribution_type='human_input' and cl.contribution_state='accepted') as human_inputs,
      count(*) filter (where cl.contribution_type='development_update' and cl.contribution_state='accepted') as development_updates,
      count(*) filter (where cl.contribution_type='test_run' and cl.contribution_state='accepted') as tests_run,
      count(*) filter (where cl.contribution_type='dispatched_prompt' and cl.contribution_state='accepted') as prompts_dispatched,
      coalesce(sum(cl.quantity) filter (
        where cl.contribution_type='ai_usage' and cl.evidence_state='verified_usage'
      ),0) as verified_ai_usage_units,
      coalesce(sum(cl.quantity) filter (
        where cl.contribution_type='manual_ai_credit'
      ),0) as declared_ai_credit_units,
      count(*) filter (
        where cl.contribution_state='reported'
      ) as pending_contributions,
      count(*) filter (
        where cl.contribution_type='manual_ai_credit' and cl.evidence_state='reported'
      ) as unverified_credit_entries
    from public.stakeholder_profiles sp
    left join auth.users au on au.id=sp.user_id
    left join public.contribution_ledger cl
      on cl.project_id=sp.project_id and cl.user_id=sp.user_id
    left join adjustment_totals adj on adj.contribution_id=cl.id
    where sp.project_id=target_project and sp.status='active'
    group by sp.user_id,sp.status,sp.origin,sp.first_accepted_at,au.email
  ),
  totals as (
    select greatest(coalesce(sum(accepted_points),0),0) as total_accepted_points
    from contributions
  )
  select jsonb_build_object(
    'stakeholder_pool_percent',pool,
    'non_binding',true,
    'formula_version',(select formula_version from public.stake_policies where project_id=target_project),
    'stakeholders',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',c.user_id,
        'email',c.email,
        'status',c.status,
        'origin',c.origin,
        'first_accepted_at',c.first_accepted_at,
        'verified_points',round(c.accepted_points,4),
        'accepted_points',round(c.accepted_points,4),
        'tracked_points',round(c.tracked_points,4),
        'human_inputs',c.human_inputs,
        'development_updates',c.development_updates,
        'tests_run',c.tests_run,
        'prompts_dispatched',c.prompts_dispatched,
        'ai_usage_units',round(c.verified_ai_usage_units,4),
        'verified_ai_usage_units',round(c.verified_ai_usage_units,4),
        'declared_ai_credit_units',round(c.declared_ai_credit_units,4),
        'pending_contributions',c.pending_contributions,
        'unverified_credit_entries',c.unverified_credit_entries,
        'contribution_share_percent',
          case when t.total_accepted_points>0
            then round((c.accepted_points/t.total_accepted_points)*100,4)
            else 0 end,
        'suggested_product_stake_percent',
          case
            when pool is null then null
            when t.total_accepted_points>0 then round((c.accepted_points/t.total_accepted_points)*pool,4)
            else 0
          end
      )
      order by c.accepted_points desc,c.email
    ),'[]'::jsonb)
  )
  into result
  from contributions c cross join totals t;

  return result;
end;
$$;

create or replace function private.capture_stake_snapshot(
  target_project uuid,
  target_trigger_type text,
  target_trigger_ref uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  snapshot_id uuid;
  policy_id uuid;
  payload jsonb;
begin
  select id into policy_id
  from public.stake_policy_versions
  where project_id=target_project
  order by version desc
  limit 1;

  payload := private.get_stakeholder_summary(target_project);

  insert into public.stake_calculation_snapshots(
    project_id,policy_version_id,trigger_type,trigger_ref,snapshot,created_by
  )
  values(
    target_project,policy_id,target_trigger_type,target_trigger_ref,payload,auth.uid()
  )
  returning id into snapshot_id;

  return snapshot_id;
end;
$$;

create or replace function private.verify_contribution(target_contribution uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
  policy public.stake_policy_versions%rowtype;
  calculated_points numeric;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if c.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot approve their own contribution.';
  end if;

  if c.contribution_state <> 'reported' then
    raise exception 'Only reported contributions can be accepted.';
  end if;

  select * into policy
  from public.stake_policy_versions
  where project_id=c.project_id
  order by version desc
  limit 1;

  if c.contribution_type='manual_ai_credit' then
    if c.monetary_value_minor is not null and c.currency=policy.currency then
      calculated_points := (c.monetary_value_minor::numeric/100)
        * coalesce((policy.weights->>'manual_ai_credit_currency')::numeric,0);
    else
      calculated_points := c.quantity
        * coalesce((policy.weights->>'manual_ai_credit_unit')::numeric,0);
    end if;
  else
    calculated_points := c.proposed_points;
  end if;

  update public.contribution_ledger
  set
    verified=true,
    verification_source=case
      when evidence_state='verified_usage' then verification_source
      else 'independent_reviewer'
    end,
    evidence_state=case
      when evidence_state='verified_usage' then 'verified_usage'
      else 'verified_activity'
    end,
    contribution_state='accepted',
    scoring_state='scored',
    points=calculated_points,
    accepted_by=caller,
    accepted_at=now(),
    scored_at=now(),
    score_policy_version_id=policy.id,
    score_snapshot=jsonb_build_object(
      'policy_version_id',policy.id,
      'version',policy.version,
      'formula_version',policy.formula_version,
      'weights',policy.weights,
      'currency',policy.currency,
      'stakeholder_pool_percent',policy.stakeholder_pool_percent,
      'calculated_points',calculated_points
    ),
    metadata=metadata || jsonb_build_object(
      'accepted_by',caller,
      'accepted_at',now()
    )
  where id=target_contribution;

  perform private.capture_stake_snapshot(c.project_id,'contribution_accepted',target_contribution);

  return target_contribution;
end;
$$;

create or replace function public.accept_contribution(target_contribution uuid)
returns uuid
language sql
set search_path = public, private
as $$ select private.verify_contribution(target_contribution); $$;

create or replace function public.verify_contribution(target_contribution uuid)
returns uuid
language sql
set search_path = public, private
as $$ select private.verify_contribution(target_contribution); $$;

create or replace function private.reject_contribution(target_contribution uuid, target_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
begin
  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if c.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot review their own contribution.';
  end if;

  if c.contribution_state <> 'reported' then
    raise exception 'Only reported contributions can be rejected.';
  end if;

  update public.contribution_ledger
  set contribution_state='rejected',
      metadata=metadata || jsonb_build_object(
        'rejected_by',caller,
        'rejected_at',now(),
        'rejection_reason',target_reason
      )
  where id=target_contribution;

  return target_contribution;
end;
$$;

create or replace function public.reject_contribution(target_contribution uuid, target_reason text)
returns uuid
language sql
set search_path = public, private
as $$ select private.reject_contribution(target_contribution,target_reason); $$;

create or replace function private.reverse_contribution(target_contribution uuid, target_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
  adj_id uuid;
  existing_delta numeric;
begin
  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if c.contribution_state <> 'accepted' or c.scoring_state <> 'scored' then
    raise exception 'Only accepted, scored contributions can be reversed.';
  end if;

  select coalesce(sum(delta_points),0) into existing_delta
  from public.contribution_adjustments
  where contribution_id=c.id;

  insert into public.contribution_adjustments(
    contribution_id,project_id,user_id,adjustment_type,
    delta_points,delta_quantity,reason,created_by
  )
  values(
    c.id,c.project_id,c.user_id,'reversal',
    -(c.points+existing_delta),-c.quantity,target_reason,caller
  )
  returning id into adj_id;

  perform private.capture_stake_snapshot(c.project_id,'contribution_reversed',adj_id);

  return adj_id;
end;
$$;

create or replace function public.reverse_contribution(target_contribution uuid, target_reason text)
returns uuid
language sql
set search_path = public, private
as $$ select private.reverse_contribution(target_contribution,target_reason); $$;

create or replace function private.set_stakeholder_pool(
  target_project uuid,
  target_pool_percent numeric
)
returns numeric
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  current_policy public.stake_policies%rowtype;
  next_version integer;
  new_version_id uuid;
begin
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if target_pool_percent is not null and (target_pool_percent < 0 or target_pool_percent > 100) then
    raise exception 'Stakeholder pool must be between 0 and 100 percent.';
  end if;

  select * into current_policy from public.stake_policies where project_id=target_project;
  select coalesce(max(version),0)+1 into next_version
  from public.stake_policy_versions where project_id=target_project;

  update public.stake_policies
  set stakeholder_pool_percent=target_pool_percent,
      updated_by=auth.uid(),
      updated_at=now()
  where project_id=target_project;

  insert into public.stake_policy_versions(
    project_id,version,formula_version,weights,currency,
    stakeholder_pool_percent,non_binding,created_by
  )
  values(
    target_project,next_version,current_policy.formula_version,current_policy.weights,
    current_policy.currency,target_pool_percent,current_policy.non_binding,auth.uid()
  )
  returning id into new_version_id;

  perform private.capture_stake_snapshot(target_project,'stakeholder_pool_changed',new_version_id);

  return target_pool_percent;
end;
$$;

create or replace function public.get_stake_history(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
begin
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,
      'policy_version_id',s.policy_version_id,
      'trigger_type',s.trigger_type,
      'trigger_ref',s.trigger_ref,
      'snapshot',s.snapshot,
      'created_at',s.created_at
    ) order by s.created_at desc),'[]'::jsonb)
    from (
      select * from public.stake_calculation_snapshots
      where project_id=target_project
      order by created_at desc
      limit 50
    ) s
  );
end;
$$;

grant execute on function public.accept_contribution(uuid) to authenticated;
grant execute on function public.verify_contribution(uuid) to authenticated;
grant execute on function public.reject_contribution(uuid,text) to authenticated;
grant execute on function public.reverse_contribution(uuid,text) to authenticated;
grant execute on function public.get_stake_history(uuid) to authenticated;
