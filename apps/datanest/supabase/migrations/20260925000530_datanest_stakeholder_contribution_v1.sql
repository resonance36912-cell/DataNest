begin;

do $$
begin
  if to_regclass('public.contribution_ledger') is null then
    raise exception 'stakeholder contribution foundation requires public.contribution_ledger';
  end if;
  if to_regclass('public.stakeholder_profiles') is null then
    raise exception 'stakeholder contribution foundation requires public.stakeholder_profiles';
  end if;
end;
$$;

alter table public.stakeholder_profiles
  add column if not exists lifecycle_stage text not null default 'active_stakeholder',
  add column if not exists reputation_opt_in boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.stakeholder_profiles'::regclass
      and conname='stakeholder_profiles_lifecycle_stage_check'
  ) then
    alter table public.stakeholder_profiles
      add constraint stakeholder_profiles_lifecycle_stage_check
      check (lifecycle_stage in (
        'accepted_user',
        'active_stakeholder',
        'verified_contributor',
        'trusted_contributor',
        'reviewer',
        'steward'
      ));
  end if;
end;
$$;

alter table public.contribution_ledger
  add column if not exists trace_key text,
  add column if not exists lifecycle_state text not null default 'submitted',
  add column if not exists certification_state text not null default 'uncertified',
  add column if not exists certified_by uuid references auth.users(id),
  add column if not exists certified_at timestamptz,
  add column if not exists minting_state text not null default 'not_eligible',
  add column if not exists snapshot_eligible_at timestamptz;

update public.contribution_ledger
set trace_key='DN-CNTR-' || upper(substr(replace(id::text,'-',''),1,12))
where trace_key is null;

update public.contribution_ledger
set lifecycle_state = case
  when contribution_state='rejected' then 'rejected'
  when contribution_state='accepted' and scoring_state='scored' then 'scored'
  when contribution_state='accepted' then 'accepted'
  when evidence_state in ('verified_activity','verified_usage') then 'verified'
  else 'submitted'
end
where lifecycle_state='submitted';

create unique index if not exists contribution_ledger_trace_key_uidx
  on public.contribution_ledger(trace_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contribution_ledger'::regclass
      and conname='contribution_ledger_lifecycle_state_check'
  ) then
    alter table public.contribution_ledger
      add constraint contribution_ledger_lifecycle_state_check
      check (lifecycle_state in (
        'submitted',
        'staged',
        'under_review',
        'changes_requested',
        'verified',
        'accepted',
        'rejected',
        'scored',
        'certified',
        'minted',
        'snapshot_eligible'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contribution_ledger'::regclass
      and conname='contribution_ledger_certification_state_check'
  ) then
    alter table public.contribution_ledger
      add constraint contribution_ledger_certification_state_check
      check (certification_state in ('uncertified','certified','rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contribution_ledger'::regclass
      and conname='contribution_ledger_minting_state_check'
  ) then
    alter table public.contribution_ledger
      add constraint contribution_ledger_minting_state_check
      check (minting_state in ('not_eligible','eligible','minted','held'));
  end if;
end;
$$;

create or replace function private.set_contribution_trace_key()returns trigger language plpgsql security definer set search_path=public,private as $$ begin if new.trace_key is null then new.trace_key:='DN-CNTR-'||upper(substr(replace(new.id::text,'-',''),1,12));end if;return new;end;$$;drop trigger if exists set_contribution_trace_key on public.contribution_ledger;create trigger set_contribution_trace_key before insert on public.contribution_ledger for each row execute function private.set_contribution_trace_key();create table if not exists public.contribution_evidence(id uuid primary key default gen_random_uuid(),contribution_id uuid not null references public.contribution_ledger(id)on delete cascade,project_id uuid not null references public.projects(id)on delete cascade,submitted_by uuid not null references auth.users(id),evidence_type text not null check(evidence_type in('artifact','commit','pull_request','test_result','usage_record','time_record','design','document','campaign','investment_record','external_ai_session','other')),evidence_ref text,evidence_text text,content_hash text,verification_state text not null default'submitted' check(verification_state in('submitted','verified','rejected')),confidence numeric check(confidence is null or(confidence>=0 and confidence<=1)),verified_by uuid references auth.users(id),verified_at timestamptz,metadata jsonb not null default'{}'::jsonb,created_at timestamptz not null default now(),check(nullif(btrim(coalesce(evidence_ref,'')),'')is not null or nullif(btrim(coalesce(evidence_text,'')),'')is not null));create index if not exists contribution_evidence_contribution_idx on public.contribution_evidence(contribution_id,created_at desc);create index if not exists contribution_evidence_project_idx on public.contribution_evidence(project_id,created_at desc);create unique index if not exists contribution_evidence_hash_uidx on public.contribution_evidence(contribution_id,content_hash)where content_hash is not null;create table if not exists public.contribution_reviews(id uuid primary key default gen_random_uuid(),contribution_id uuid not null references public.contribution_ledger(id)on delete cascade,project_id uuid not null references public.projects(id)on delete cascade,reviewer_id uuid not null references auth.users(id),review_stage text not null check(review_stage in('verification','acceptance','scoring','certification')),decision text not null check(decision in('approved','rejected','changes_requested')),evidence_confidence numeric check(evidence_confidence is null or(evidence_confidence>=0 and evidence_confidence<=1)),notes text,metadata jsonb not null default'{}'::jsonb,created_at timestamptz not null default now());create index if not exists contribution_reviews_contribution_idx on public.contribution_reviews(contribution_id,created_at desc);create index if not exists contribution_reviews_project_idx on public.contribution_reviews(project_id,created_at desc);create table if not exists public.contribution_scoring_models(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id)on delete cascade,model_version text not null,status text not null default'draft' check(status in('draft','active','retired')),impact_weight numeric not null default 0.70 check(impact_weight between 0 and 1),quality_weight numeric not null default 0.15 check(quality_weight between 0 and 1),delivery_weight numeric not null default 0.10 check(delivery_weight between 0 and 1),resource_weight numeric not null default 0.05 check(resource_weight between 0 and 1),sparks_per_point numeric not null default 10 check(sparks_per_point>=0),config jsonb not null default'{}'::jsonb,created_by uuid references auth.users(id),effective_from timestamptz,retired_at timestamptz,created_at timestamptz not null default now(),unique(project_id,model_version),check(impact_weight+quality_weight+delivery_weight+resource_weight=1));create unique index if not exists contribution_scoring_models_one_active_idx on public.contribution_scoring_models(project_id)where status='active';create table if not exists public.contribution_scoring_dimensions(model_id uuid not null references public.contribution_scoring_models(id)on delete cascade,group_key text not null check(group_key in('impact','quality','delivery','resource')),dimension_key text not null,weight numeric not null check(weight>=0 and weight<=1),criteria jsonb not null default'{}'::jsonb,active boolean not null default true,primary key(model_id,dimension_key));create table if not exists public.contribution_scores(id uuid primary key default gen_random_uuid(),contribution_id uuid not null references public.contribution_ledger(id)on delete cascade,project_id uuid not null references public.projects(id)on delete cascade,user_id uuid not null references auth.users(id)on delete cascade,scorer_id uuid not null references auth.users(id),model_id uuid not null references public.contribution_scoring_models(id),score_version integer not null,status text not null default'final' check(status in('provisional','final','superseded')),max_points numeric not null check(max_points>=0),impact_rating numeric not null check(impact_rating between 0 and 1),quality_rating numeric not null check(quality_rating between 0 and 1),delivery_rating numeric not null check(delivery_rating between 0 and 1),resource_rating numeric not null check(resource_rating between 0 and 1),evidence_confidence numeric not null check(evidence_confidence between 0 and 1),project_multiplier numeric not null default 1 check(project_multiplier>0),dimension_ratings jsonb not null default'{}'::jsonb,contribution_score numeric not null check(contribution_score>=0),sparks_amount numeric not null default 0 check(sparks_amount>=0),supersedes_score_id uuid references public.contribution_scores(id),created_at timestamptz not null default now(),unique(contribution_id,score_version));create unique index if not exists contribution_scores_one_final_idx on public.contribution_scores(contribution_id)where status='final';create index if not exists contribution_scores_project_idx on public.contribution_scores(project_id,created_at desc);create index if not exists contribution_scores_user_idx on public.contribution_scores(user_id,created_at desc);create table if not exists public.spark_accounts(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,project_id uuid references public.projects(id)on delete cascade,account_type text not null check(account_type in('project','platform','locked')),created_at timestamptz not null default now(),check((account_type='platform' and project_id is null)or(account_type in('project','locked')and project_id is not null)));create unique index if not exists spark_accounts_project_uidx on public.spark_accounts(user_id,project_id,account_type)where project_id is not null;create unique index if not exists spark_accounts_platform_uidx on public.spark_accounts(user_id,account_type)where project_id is null;create table if not exists public.spark_ledger_entries(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.spark_accounts(id)on delete restrict,user_id uuid not null references auth.users(id)on delete cascade,project_id uuid references public.projects(id)on delete cascade,contribution_id uuid references public.contribution_ledger(id)on delete restrict,entry_type text not null check(entry_type in('contribution_award','service_spend','collaboration_bounty','governance_reward','hold','release','reversal','adjustment')),amount numeric not null check(amount<>0),trace_key text not null,policy_version text not null,metadata jsonb not null default'{}'::jsonb,created_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(trace_key));create index if not exists spark_ledger_account_idx on public.spark_ledger_entries(account_id,created_at desc);create index if not exists spark_ledger_user_idx on public.spark_ledger_entries(user_id,created_at desc);create index if not exists spark_ledger_project_idx on public.spark_ledger_entries(project_id,created_at desc)where project_id is not null;create table if not exists public.reputation_snapshots(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id)on delete cascade,user_id uuid not null references auth.users(id)on delete cascade,window_type text not null check(window_type in('rolling_90','lifetime')),period_start timestamptz,period_end timestamptz,aggregate_score numeric not null check(aggregate_score>=0),dimensions jsonb not null default'{}'::jsonb,rank integer check(rank is null or rank>0),model_version text not null,frozen_at timestamptz not null default now(),created_at timestamptz not null default now());create index if not exists reputation_snapshots_project_idx on public.reputation_snapshots(project_id,window_type,frozen_at desc);create index if not exists reputation_snapshots_user_idx on public.reputation_snapshots(user_id,window_type,frozen_at desc);create table if not exists public.datanest_user_preferences(user_id uuid primary key references auth.users(id)on delete cascade,ui_complexity text not null default'simple' check(ui_complexity in('simple','detailed')),updated_at timestamptz not null default now());insert into public.contribution_scoring_models(project_id,model_version,status,impact_weight,quality_weight,delivery_weight,resource_weight,sparks_per_point,config,effective_from)select p.id,'impact-first-v1','active',0.70,0.15,0.10,0.05,10,jsonb_build_object('principle','accepted impact over raw activity','capital_affects_reputation',false,'raw_time_is_not_score',true,'raw_ai_usage_is_not_score',true),now()from public.projects p on conflict(project_id,model_version)do nothing;insert into public.contribution_scoring_dimensions(model_id,group_key,dimension_key,weight,criteria)select m.id,v.group_key,v.dimension_key,v.weight,v.criteria from public.contribution_scoring_models m cross join(values('impact','ui_ux',0.10::numeric,'{"evidence":"usability,accessibility,design consistency"}'::jsonb),('impact','database_architecture',0.10::numeric,'{"evidence":"integrity,migration safety,performance,maintainability"}'::jsonb),('impact','workflow_functionality',0.15::numeric,'{"evidence":"completed journeys,reliability,task improvement"}'::jsonb),('impact','cost_saving',0.12::numeric,'{"evidence":"validated savings without quality regression"}'::jsonb),('impact','brand_promotion',0.05::numeric,'{"evidence":"attributable qualified reach and activation"}'::jsonb),('impact','user_acquisition',0.08::numeric,'{"evidence":"attributable acquisition,activation,retention"}'::jsonb),('impact','datanest_ai_learning',0.12::numeric,'{"evidence":"certified reusable knowledge and measured evaluation improvement"}'::jsonb),('impact','governance_process',0.10::numeric,'{"evidence":"auditability,accountability,dispute resolution"}'::jsonb),('impact','security_testing',0.10::numeric,'{"evidence":"risk reduction,reproduced defects,effective fixes"}'::jsonb),('impact','documentation_mentoring',0.08::numeric,'{"evidence":"reusable guidance and transferred capability"}'::jsonb),('quality','quality_maintainability',1.00::numeric,'{"evidence":"defect rate,rollback rate,maintainability"}'::jsonb),('delivery','delivery_effectiveness',1.00::numeric,'{"evidence":"accepted delivery against agreed scope and timing"}'::jsonb),('resource','time_effectiveness',0.40::numeric,'{"evidence":"validated time effectiveness,not raw hours"}'::jsonb),('resource','ai_effectiveness',0.40::numeric,'{"evidence":"impact per verified AI resource,not raw token use"}'::jsonb),('resource','capital_in_kind',0.20::numeric,'{"evidence":"verified approved resources;does not buy reputation or authority"}'::jsonb))as v(group_key,dimension_key,weight,criteria)where m.model_version='impact-first-v1' on conflict(model_id,dimension_key)do nothing;create or replace function private.ensure_spark_account(
  target_user uuid,
  target_project uuid,
  target_type text
) returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare account_id uuid;
begin
  if target_type='platform' then
    select id into account_id
    from public.spark_accounts
    where user_id=target_user and project_id is null and account_type='platform';

    if account_id is null then
      insert into public.spark_accounts(user_id,project_id,account_type)
      values(target_user,null,'platform')
      returning id into account_id;
    end if;
  else
    select id into account_id
    from public.spark_accounts
    where user_id=target_user and project_id=target_project and account_type=target_type;

    if account_id is null then
      insert into public.spark_accounts(user_id,project_id,account_type)
      values(target_user,target_project,target_type)
      returning id into account_id;
    end if;
  end if;

  return account_id;
end;
$$;

create or replace function private.prevent_spark_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  raise exception 'Spark ledger entries are append-only. Use a reversal entry for corrections.';
end;
$$;

drop trigger if exists prevent_spark_ledger_mutation on public.spark_ledger_entries;
create trigger prevent_spark_ledger_mutation
before update or delete on public.spark_ledger_entries
for each row execute function private.prevent_spark_ledger_mutation();

create or replace view public.spark_account_balances
with (security_invoker=true)
as
select
  a.id as account_id,
  a.user_id,
  a.project_id,
  a.account_type,
  coalesce(sum(l.amount),0)::numeric as balance
from public.spark_accounts a
left join public.spark_ledger_entries l on l.account_id=a.id
group by a.id,a.user_id,a.project_id,a.account_type;

create or replace function public.submit_contribution_evidence(
  target_contribution uuid,
  target_evidence_type text,
  target_evidence_ref text default null,
  target_evidence_text text default null,
  target_content_hash text default null,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
  evidence_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if c.user_id <> caller
     and not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Contribution access is required.';
  end if;

  insert into public.contribution_evidence(
    contribution_id,project_id,submitted_by,evidence_type,
    evidence_ref,evidence_text,content_hash,metadata
  )
  values(
    c.id,c.project_id,caller,target_evidence_type,
    nullif(btrim(target_evidence_ref),''),
    nullif(btrim(target_evidence_text),''),
    nullif(btrim(target_content_hash),''),
    coalesce(target_metadata,'{}'::jsonb)
  )
  returning id into evidence_id;

  if c.lifecycle_state='submitted' then
    update public.contribution_ledger
      set lifecycle_state='staged'
    where id=c.id;
  end if;

  return evidence_id;
end;
$$;

create or replace function public.verify_contribution_v1(
  target_contribution uuid,
  target_confidence numeric default 1,
  target_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_confidence < 0 or target_confidence > 1 then
    raise exception 'Evidence confidence must be between 0 and 1.';
  end if;

  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if c.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot verify their own contribution.';
  end if;
  if c.contribution_state='rejected' then
    raise exception 'Rejected contributions cannot be verified.';
  end if;
  if not exists(
    select 1 from public.contribution_evidence e
    where e.contribution_id=c.id and e.verification_state <> 'rejected'
  ) then
    raise exception 'At least one evidence record is required.';
  end if;

  update public.contribution_evidence
  set verification_state='verified',
      confidence=coalesce(confidence,target_confidence),
      verified_by=caller,
      verified_at=now()
  where contribution_id=c.id
    and verification_state='submitted';

  insert into public.contribution_reviews(
    contribution_id,project_id,reviewer_id,review_stage,decision,
    evidence_confidence,notes
  )
  values(c.id,c.project_id,caller,'verification','approved',target_confidence,target_notes);

  update public.contribution_ledger
  set verified=true,
      verification_source='independent_reviewer_v1',
      evidence_state=case
        when evidence_state='verified_usage' then 'verified_usage'
        else 'verified_activity'
      end,
      lifecycle_state='verified'
  where id=c.id;

  return c.id;
end;
$$;

create or replace function public.accept_contribution_v1(
  target_contribution uuid,
  target_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if c.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot accept their own contribution.';
  end if;
  if c.lifecycle_state <> 'verified' then
    raise exception 'Contribution must be verified before acceptance.';
  end if;

  insert into public.contribution_reviews(
    contribution_id,project_id,reviewer_id,review_stage,decision,notes
  )
  values(c.id,c.project_id,caller,'acceptance','approved',target_notes);

  update public.contribution_ledger
  set contribution_state='accepted',
      lifecycle_state='accepted',
      accepted_by=caller,
      accepted_at=now(),
      scoring_state='unscored'
  where id=c.id;

  return c.id;
end;
$$;

create or replace function public.score_contribution_v1(
  target_contribution uuid,
  target_max_points numeric,
  target_impact_rating numeric,
  target_quality_rating numeric,
  target_delivery_rating numeric,
  target_resource_rating numeric,
  target_evidence_confidence numeric default 1,
  target_project_multiplier numeric default 1,
  target_dimension_ratings jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
  model public.contribution_scoring_models%rowtype;
  score_id uuid;
  next_version integer;
  weighted numeric;
  calculated numeric;
  spark_amount numeric;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_max_points < 0
     or target_impact_rating not between 0 and 1
     or target_quality_rating not between 0 and 1
     or target_delivery_rating not between 0 and 1
     or target_resource_rating not between 0 and 1
     or target_evidence_confidence not between 0 and 1
     or target_project_multiplier <= 0 then
    raise exception 'Invalid scoring inputs.';
  end if;

  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if c.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot score their own contribution.';
  end if;
  if c.contribution_state <> 'accepted' or c.lifecycle_state <> 'accepted' then
    raise exception 'Contribution must be accepted before scoring.';
  end if;

  select * into model
  from public.contribution_scoring_models
  where project_id=c.project_id and status='active'
  order by effective_from desc nulls last,created_at desc
  limit 1;

  if not found then raise exception 'No active contribution scoring model exists.'; end if;

  weighted :=
      model.impact_weight * target_impact_rating
    + model.quality_weight * target_quality_rating
    + model.delivery_weight * target_delivery_rating
    + model.resource_weight * target_resource_rating;

  calculated := round(
    target_max_points
    * weighted
    * target_evidence_confidence
    * target_project_multiplier,
    6
  );
  spark_amount := round(calculated * model.sparks_per_point,6);

  select coalesce(max(score_version),0)+1 into next_version
  from public.contribution_scores
  where contribution_id=c.id;

  update public.contribution_scores
  set status='superseded'
  where contribution_id=c.id and status='final';

  insert into public.contribution_scores(
    contribution_id,project_id,user_id,scorer_id,model_id,score_version,status,
    max_points,impact_rating,quality_rating,delivery_rating,resource_rating,
    evidence_confidence,project_multiplier,dimension_ratings,
    contribution_score,sparks_amount
  )
  values(
    c.id,c.project_id,c.user_id,caller,model.id,next_version,'final',
    target_max_points,target_impact_rating,target_quality_rating,
    target_delivery_rating,target_resource_rating,target_evidence_confidence,
    target_project_multiplier,coalesce(target_dimension_ratings,'{}'::jsonb),
    calculated,spark_amount
  )
  returning id into score_id;

  insert into public.contribution_reviews(
    contribution_id,project_id,reviewer_id,review_stage,decision,
    evidence_confidence,metadata
  )
  values(
    c.id,c.project_id,caller,'scoring','approved',target_evidence_confidence,
    jsonb_build_object('score_id',score_id,'model_version',model.model_version)
  );

  update public.contribution_ledger
  set points=calculated,
      scoring_state='scored',
      lifecycle_state='scored',
      scored_at=now(),
      score_snapshot=jsonb_build_object(
        'score_id',score_id,
        'model_id',model.id,
        'model_version',model.model_version,
        'max_points',target_max_points,
        'impact_rating',target_impact_rating,
        'quality_rating',target_quality_rating,
        'delivery_rating',target_delivery_rating,
        'resource_rating',target_resource_rating,
        'evidence_confidence',target_evidence_confidence,
        'project_multiplier',target_project_multiplier,
        'calculated_points',calculated,
        'sparks_amount',spark_amount,
        'dimension_ratings',coalesce(target_dimension_ratings,'{}'::jsonb)
      )
  where id=c.id;

  return score_id;
end;
$$;

create or replace function public.certify_contribution_v1(
  target_contribution uuid,
  target_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if c.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot certify their own contribution.';
  end if;
  if c.contribution_state <> 'accepted'
     or c.scoring_state <> 'scored'
     or c.lifecycle_state <> 'scored' then
    raise exception 'Contribution must be accepted and scored before certification.';
  end if;
  if not exists(
    select 1 from public.contribution_scores s
    where s.contribution_id=c.id and s.status='final'
  ) then
    raise exception 'A final versioned score is required.';
  end if;

  insert into public.contribution_reviews(
    contribution_id,project_id,reviewer_id,review_stage,decision,notes
  )
  values(c.id,c.project_id,caller,'certification','approved',target_notes);

  update public.contribution_ledger
  set certification_state='certified',
      certified_by=caller,
      certified_at=now(),
      minting_state='eligible',
      lifecycle_state='certified'
  where id=c.id;

  return c.id;
end;
$$;

create or replace function public.mint_contribution_sparks_v1(
  target_contribution uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
  score public.contribution_scores%rowtype;
  model public.contribution_scoring_models%rowtype;
  account_id uuid;
  ledger_id uuid;
  mint_trace text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if c.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot mint Sparks for their own contribution.';
  end if;
  if c.certification_state <> 'certified' or c.minting_state <> 'eligible' then
    raise exception 'Contribution is not eligible for Sparks minting.';
  end if;

  select * into score
  from public.contribution_scores
  where contribution_id=c.id and status='final'
  order by score_version desc
  limit 1;

  if not found then raise exception 'Final contribution score not found.'; end if;

  select * into model from public.contribution_scoring_models where id=score.model_id;
  account_id := private.ensure_spark_account(c.user_id,c.project_id,'project');
  mint_trace := 'DN-SPARK-' || upper(substr(replace(c.id::text,'-',''),1,12));

  insert into public.spark_ledger_entries(
    account_id,user_id,project_id,contribution_id,entry_type,amount,
    trace_key,policy_version,metadata,created_by
  )
  values(
    account_id,c.user_id,c.project_id,c.id,'contribution_award',score.sparks_amount,
    mint_trace,model.model_version,
    jsonb_build_object(
      'score_id',score.id,
      'contribution_trace_key',c.trace_key,
      'score_version',score.score_version
    ),
    caller
  )
  on conflict(trace_key) do nothing
  returning id into ledger_id;

  if ledger_id is null then
    select id into ledger_id
    from public.spark_ledger_entries
    where trace_key=mint_trace;
  end if;

  update public.contribution_ledger
  set minting_state='minted',
      lifecycle_state='minted',
      snapshot_eligible_at=coalesce(snapshot_eligible_at,now())
  where id=c.id;

  return ledger_id;
end;
$$;

create or replace function public.get_contribution_workspace(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  profile jsonb;
  stakeholder_summary jsonb;
  stakeholder jsonb;
  balances jsonb;
  counts jsonb;
  model_version text;
  preference text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select to_jsonb(sp) into profile
  from public.stakeholder_profiles sp
  where sp.project_id=target_project and sp.user_id=caller;

  stakeholder_summary := private.get_stakeholder_summary(target_project);

  select elem into stakeholder
  from jsonb_array_elements(coalesce(stakeholder_summary->'stakeholders','[]'::jsonb)) elem
  where elem->>'user_id'=caller::text
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_type',b.account_type,
    'project_id',b.project_id,
    'balance',b.balance
  ) order by b.account_type),'[]'::jsonb)
  into balances
  from public.spark_account_balances b
  where b.user_id=caller
    and (b.project_id=target_project or b.project_id is null);

  select jsonb_build_object(
    'submitted',count(*) filter (where lifecycle_state in ('submitted','staged','under_review','changes_requested')),
    'verified',count(*) filter (where lifecycle_state='verified'),
    'accepted',count(*) filter (where contribution_state='accepted'),
    'scored',count(*) filter (where scoring_state='scored'),
    'certified',count(*) filter (where certification_state='certified'),
    'minted',count(*) filter (where minting_state='minted')
  )
  into counts
  from public.contribution_ledger
  where project_id=target_project and user_id=caller;

  select model_version into model_version
  from public.contribution_scoring_models
  where project_id=target_project and status='active'
  order by effective_from desc nulls last,created_at desc
  limit 1;

  select ui_complexity into preference
  from public.datanest_user_preferences
  where user_id=caller;

  return jsonb_build_object(
    'profile',coalesce(profile,'{}'::jsonb),
    'stakeholder',coalesce(stakeholder,'{}'::jsonb),
    'counts',coalesce(counts,'{}'::jsonb),
    'spark_balances',coalesce(balances,'[]'::jsonb),
    'scoring_model_version',model_version,
    'ui_complexity',coalesce(preference,'simple'),
    'economic_boundary',jsonb_build_object(
      'contribution_share_is_legal_ownership',false,
      'sparks_are_royalty_entitlement',false,
      'royalties_are_separate',true
    )
  );
end;
$$;

alter table public.contribution_evidence enable row level security;
alter table public.contribution_reviews enable row level security;
alter table public.contribution_scoring_models enable row level security;
alter table public.contribution_scoring_dimensions enable row level security;
alter table public.contribution_scores enable row level security;
alter table public.spark_accounts enable row level security;
alter table public.spark_ledger_entries enable row level security;
alter table public.reputation_snapshots enable row level security;
alter table public.datanest_user_preferences enable row level security;

drop policy if exists contribution_evidence_select on public.contribution_evidence;
create policy contribution_evidence_select
on public.contribution_evidence for select to authenticated
using (
  exists(
    select 1 from public.contribution_ledger c
    where c.id=contribution_id
      and (
        c.user_id=(select auth.uid())
        or private.has_project_role(c.project_id,array['owner','admin'])
      )
  )
);

drop policy if exists contribution_reviews_select on public.contribution_reviews;
create policy contribution_reviews_select
on public.contribution_reviews for select to authenticated
using (
  reviewer_id=(select auth.uid())
  or exists(
    select 1 from public.contribution_ledger c
    where c.id=contribution_id
      and (
        c.user_id=(select auth.uid())
        or private.has_project_role(c.project_id,array['owner','admin'])
      )
  )
);

drop policy if exists contribution_scoring_models_select on public.contribution_scoring_models;
create policy contribution_scoring_models_select
on public.contribution_scoring_models for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists contribution_scoring_dimensions_select on public.contribution_scoring_dimensions;
create policy contribution_scoring_dimensions_select
on public.contribution_scoring_dimensions for select to authenticated
using (
  exists(
    select 1 from public.contribution_scoring_models m
    where m.id=model_id and private.has_project_access(m.project_id)
  )
);

drop policy if exists contribution_scores_select on public.contribution_scores;
create policy contribution_scores_select
on public.contribution_scores for select to authenticated
using (
  user_id=(select auth.uid())
  or scorer_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

drop policy if exists spark_accounts_select on public.spark_accounts;
create policy spark_accounts_select
on public.spark_accounts for select to authenticated
using (
  user_id=(select auth.uid())
  or (
    project_id is not null
    and private.has_project_role(project_id,array['owner','admin'])
  )
);

drop policy if exists spark_ledger_entries_select on public.spark_ledger_entries;
create policy spark_ledger_entries_select
on public.spark_ledger_entries for select to authenticated
using (
  user_id=(select auth.uid())
  or (
    project_id is not null
    and private.has_project_role(project_id,array['owner','admin'])
  )
);

drop policy if exists reputation_snapshots_select on public.reputation_snapshots;
create policy reputation_snapshots_select
on public.reputation_snapshots for select to authenticated
using (
  user_id=(select auth.uid())
  or (
    project_id is not null
    and private.has_project_access(project_id)
  )
);

drop policy if exists datanest_user_preferences_select on public.datanest_user_preferences;
create policy datanest_user_preferences_select
on public.datanest_user_preferences for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists datanest_user_preferences_insert on public.datanest_user_preferences;
create policy datanest_user_preferences_insert
on public.datanest_user_preferences for insert to authenticated
with check (user_id=(select auth.uid()));

drop policy if exists datanest_user_preferences_update on public.datanest_user_preferences;
create policy datanest_user_preferences_update
on public.datanest_user_preferences for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

revoke all on public.contribution_evidence from anon,authenticated;
revoke all on public.contribution_reviews from anon,authenticated;
revoke all on public.contribution_scoring_models from anon,authenticated;
revoke all on public.contribution_scoring_dimensions from anon,authenticated;
revoke all on public.contribution_scores from anon,authenticated;
revoke all on public.spark_accounts from anon,authenticated;
revoke all on public.spark_ledger_entries from anon,authenticated;
revoke all on public.reputation_snapshots from anon,authenticated;
revoke all on public.spark_account_balances from anon,authenticated;
revoke all on public.datanest_user_preferences from anon;

grant select on public.contribution_evidence to authenticated;
grant select on public.contribution_reviews to authenticated;
grant select on public.contribution_scoring_models to authenticated;
grant select on public.contribution_scoring_dimensions to authenticated;
grant select on public.contribution_scores to authenticated;
grant select on public.spark_accounts to authenticated;
grant select on public.spark_ledger_entries to authenticated;
grant select on public.reputation_snapshots to authenticated;
grant select,insert,update on public.datanest_user_preferences to authenticated;

revoke all on function public.submit_contribution_evidence(uuid,text,text,text,text,jsonb) from public,anon;
revoke all on function public.verify_contribution_v1(uuid,numeric,text) from public,anon;
revoke all on function public.accept_contribution_v1(uuid,text) from public,anon;
revoke all on function public.score_contribution_v1(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb) from public,anon;
revoke all on function public.certify_contribution_v1(uuid,text) from public,anon;
revoke all on function public.mint_contribution_sparks_v1(uuid) from public,anon;
revoke all on function public.get_contribution_workspace(uuid) from public,anon;

grant execute on function public.submit_contribution_evidence(uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.verify_contribution_v1(uuid,numeric,text) to authenticated;
grant execute on function public.accept_contribution_v1(uuid,text) to authenticated;
grant execute on function public.score_contribution_v1(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb) to authenticated;
grant execute on function public.certify_contribution_v1(uuid,text) to authenticated;
grant execute on function public.mint_contribution_sparks_v1(uuid) to authenticated;
grant execute on function public.get_contribution_workspace(uuid) to authenticated;

commit;
