begin;

do $$
begin
  if to_regclass('public.reputation_snapshots') is null then
    raise exception 'contribution intelligence requires public.reputation_snapshots';
  end if;
  if to_regclass('public.contribution_scores') is null then
    raise exception 'contribution intelligence requires public.contribution_scores';
  end if;
  if to_regclass('public.contribution_reviews') is null then
    raise exception 'contribution intelligence requires public.contribution_reviews';
  end if;
  if to_regclass('public.stakeholder_profiles') is null then
    raise exception 'contribution intelligence requires public.stakeholder_profiles';
  end if;
end;
$$;

alter table public.datanest_user_preferences
  add column if not exists ranking_opt_in boolean not null default true,
  add column if not exists squad_opt_in boolean not null default false;

alter table public.reputation_snapshots
  add column if not exists batch_id uuid,
  add column if not exists trust_score numeric not null default 100,
  add column if not exists anomaly_score numeric not null default 0,
  add column if not exists eligible_for_ranking boolean not null default false,
  add column if not exists exclusion_reasons text[] not null default '{}'::text[],
  add column if not exists certified_contributions integer not null default 0,
  add column if not exists approved_reviews integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.reputation_snapshots'::regclass
      and conname='reputation_snapshots_trust_score_check'
  ) then
    alter table public.reputation_snapshots
      add constraint reputation_snapshots_trust_score_check
      check (trust_score between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.reputation_snapshots'::regclass
      and conname='reputation_snapshots_anomaly_score_check'
  ) then
    alter table public.reputation_snapshots
      add constraint reputation_snapshots_anomaly_score_check
      check (anomaly_score between 0 and 100);
  end if;
end;
$$;

create index if not exists reputation_snapshots_batch_idx
  on public.reputation_snapshots(project_id,batch_id,window_type,rank);

create table if not exists public.contribution_reputation_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_version text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  impact_weight numeric not null default 0.50 check (impact_weight between 0 and 1),
  quality_weight numeric not null default 0.20 check (quality_weight between 0 and 1),
  collaboration_weight numeric not null default 0.15 check (collaboration_weight between 0 and 1),
  governance_weight numeric not null default 0.10 check (governance_weight between 0 and 1),
  knowledge_weight numeric not null default 0.05 check (knowledge_weight between 0 and 1),
  minimum_certified_for_rank integer not null default 1 check (minimum_certified_for_rank >= 0),
  minimum_certified_for_squad integer not null default 2 check (minimum_certified_for_squad >= 0),
  trusted_score_threshold numeric not null default 70 check (trusted_score_threshold between 0 and 100),
  reviewer_score_threshold numeric not null default 80 check (reviewer_score_threshold between 0 and 100),
  trusted_minimum_certified integer not null default 3 check (trusted_minimum_certified >= 0),
  reviewer_minimum_certified integer not null default 5 check (reviewer_minimum_certified >= 0),
  reviewer_minimum_reviews integer not null default 2 check (reviewer_minimum_reviews >= 0),
  config jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  retired_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id,model_version),
  check (
    impact_weight + quality_weight + collaboration_weight + governance_weight + knowledge_weight = 1
  )
);

create unique index if not exists contribution_reputation_models_one_active_idx
  on public.contribution_reputation_models(project_id)
  where status='active';

create table if not exists public.contribution_anomaly_signals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contribution_id uuid references public.contribution_ledger(id) on delete cascade,
  signal_type text not null check (signal_type in (
    'reused_evidence','self_review','burst_certification'
  )),
  severity text not null check (severity in ('info','low','medium','high','critical')),
  confidence numeric not null check (confidence between 0 and 1),
  status text not null default 'open' check (status in ('open','confirmed','dismissed','resolved')),
  signal_key text not null unique,
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index if not exists contribution_anomaly_project_user_idx
  on public.contribution_anomaly_signals(project_id,user_id,status,severity,detected_at desc);
create index if not exists contribution_anomaly_contribution_idx
  on public.contribution_anomaly_signals(contribution_id)
  where contribution_id is not null;
create index if not exists contribution_anomaly_reviewed_by_idx
  on public.contribution_anomaly_signals(reviewed_by)
  where reviewed_by is not null;
create index if not exists contribution_reputation_models_created_by_idx
  on public.contribution_reputation_models(created_by)
  where created_by is not null;

create table if not exists public.stakeholder_progression_recommendations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_stage text not null,
  recommended_stage text not null check (recommended_stage in (
    'verified_contributor','trusted_contributor','reviewer'
  )),
  basis_snapshot_id uuid not null references public.reputation_snapshots(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','dismissed','superseded')),
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text
);

create unique index if not exists stakeholder_progression_one_pending_idx
  on public.stakeholder_progression_recommendations(project_id,user_id,recommended_stage)
  where status='pending';
create index if not exists stakeholder_progression_user_idx
  on public.stakeholder_progression_recommendations(project_id,user_id,created_at desc);
create index if not exists stakeholder_progression_reviewed_by_idx
  on public.stakeholder_progression_recommendations(reviewed_by)
  where reviewed_by is not null;
create index if not exists stakeholder_progression_snapshot_idx
  on public.stakeholder_progression_recommendations(basis_snapshot_id);

create table if not exists public.n0nymous_squad_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  batch_id uuid not null,
  snapshot_id uuid not null references public.reputation_snapshots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_code text not null,
  rank integer not null check (rank between 1 and 10),
  aggregate_score numeric not null check (aggregate_score between 0 and 100),
  trust_score numeric not null check (trust_score between 0 and 100),
  status text not null default 'active' check (status in ('active','expired')),
  created_at timestamptz not null default now(),
  expired_at timestamptz,
  unique(project_id,batch_id,user_id),
  unique(project_id,batch_id,rank)
);

create index if not exists n0nymous_squad_active_idx
  on public.n0nymous_squad_memberships(project_id,status,rank)
  where status='active';
create index if not exists n0nymous_squad_snapshot_idx
  on public.n0nymous_squad_memberships(snapshot_id);
create index if not exists n0nymous_squad_user_idx
  on public.n0nymous_squad_memberships(user_id,status,created_at desc);

insert into public.contribution_reputation_models(
  project_id,model_version,status,
  impact_weight,quality_weight,collaboration_weight,governance_weight,knowledge_weight,
  minimum_certified_for_rank,minimum_certified_for_squad,
  trusted_score_threshold,reviewer_score_threshold,
  trusted_minimum_certified,reviewer_minimum_certified,reviewer_minimum_reviews,
  config,effective_from
)
select
  p.id,
  'contribution-intelligence-v1',
  'active',
  0.50,0.20,0.15,0.10,0.05,
  1,2,
  70,80,
  3,5,2,
  jsonb_build_object(
    'principle','accepted impact and demonstrated contribution, not raw activity',
    'rank_investment',false,
    'rank_sparks_balance',false,
    'open_anomaly_is_penalty',false,
    'confirmed_high_signal_excludes_from_rank',true,
    'squad_grants_admin',false,
    'progression_requires_human_approval',true,
    'rolling_window_days',90
  ),
  now()
from public.projects p
on conflict(project_id,model_version) do nothing;

create or replace function private.jsonb_ratio_01(
  payload jsonb,
  key_name text
) returns numeric
language plpgsql
immutable
set search_path=public,private
as $$
declare
  raw_value text;
  parsed numeric;
begin
  raw_value := payload->>key_name;
  if raw_value is null then return 0; end if;
  parsed := raw_value::numeric;
  return greatest(0,least(1,parsed));
exception when others then
  return 0;
end;
$$;

create or replace function private.anomaly_severity_weight(
  target_severity text
) returns numeric
language sql
immutable
set search_path=public,private
as $$
  select case target_severity
    when 'critical' then 50
    when 'high' then 30
    when 'medium' then 15
    when 'low' then 5
    else 0
  end::numeric;
$$;

create or replace function public.review_contribution_anomaly_v1(
  target_signal uuid,
  target_status text,
  target_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  signal public.contribution_anomaly_signals%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_status not in ('confirmed','dismissed','resolved') then
    raise exception 'Anomaly review status must be confirmed, dismissed, or resolved.';
  end if;

  select * into signal
  from public.contribution_anomaly_signals
  where id=target_signal;

  if not found then raise exception 'Anomaly signal not found.'; end if;
  if not private.has_project_role(signal.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if signal.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot adjudicate their own anomaly signal.';
  end if;

  update public.contribution_anomaly_signals
  set status=target_status,
      reviewed_by=caller,
      reviewed_at=now(),
      resolution_notes=nullif(btrim(coalesce(target_notes,'')),'')
  where id=signal.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    signal.project_id,
    'CONTRIBUTION_ANOMALY_REVIEWED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'signal_id',signal.id,
      'signal_type',signal.signal_type,
      'subject_user_id',signal.user_id,
      'review_status',target_status
    )
  );

  return signal.id;
end;
$$;

create or replace function public.review_stakeholder_progression_v1(
  target_recommendation uuid,
  target_status text,
  target_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  recommendation public.stakeholder_progression_recommendations%rowtype;
  current_profile public.stakeholder_profiles%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_status not in ('approved','dismissed') then
    raise exception 'Progression review status must be approved or dismissed.';
  end if;

  select * into recommendation
  from public.stakeholder_progression_recommendations
  where id=target_recommendation and status='pending';

  if not found then raise exception 'Pending progression recommendation not found.'; end if;
  if not private.has_project_role(recommendation.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if recommendation.user_id=caller then
    raise insufficient_privilege using message='A stakeholder cannot approve their own progression.';
  end if;

  select * into current_profile
  from public.stakeholder_profiles
  where project_id=recommendation.project_id
    and user_id=recommendation.user_id;

  if not found then raise exception 'Stakeholder profile not found.'; end if;
  if current_profile.lifecycle_stage<>recommendation.current_stage then
    update public.stakeholder_progression_recommendations
    set status='superseded',
        reviewed_by=caller,
        reviewed_at=now(),
        review_notes='Lifecycle changed before review.'
    where id=recommendation.id;

    insert into public.events(project_id,event_type,actor,payload)
    values(
      recommendation.project_id,
      'STAKEHOLDER_PROGRESSION_SUPERSEDED',
      coalesce(auth.jwt()->>'email',caller::text),
      jsonb_build_object(
        'recommendation_id',recommendation.id,
        'subject_user_id',recommendation.user_id,
        'expected_stage',recommendation.current_stage,
        'actual_stage',current_profile.lifecycle_stage,
        'grants_project_role',false
      )
    );

    return recommendation.id;
  end if;

  update public.stakeholder_progression_recommendations
  set status=target_status,
      reviewed_by=caller,
      reviewed_at=now(),
      review_notes=nullif(btrim(coalesce(target_notes,'')),'')
  where id=recommendation.id;

  if target_status='approved' then
    update public.stakeholder_profiles
    set lifecycle_stage=recommendation.recommended_stage,
        updated_at=now()
    where project_id=recommendation.project_id
      and user_id=recommendation.user_id;

    update public.stakeholder_progression_recommendations
    set status='superseded'
    where project_id=recommendation.project_id
      and user_id=recommendation.user_id
      and id<>recommendation.id
      and status='pending';
  end if;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    recommendation.project_id,
    'STAKEHOLDER_PROGRESSION_REVIEWED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'recommendation_id',recommendation.id,
      'subject_user_id',recommendation.user_id,
      'from_stage',recommendation.current_stage,
      'recommended_stage',recommendation.recommended_stage,
      'review_status',target_status,
      'grants_project_role',false
    )
  );

  return recommendation.id;
end;
$$;

create or replace function public.refresh_contribution_intelligence_v1(target_project uuid ) returns jsonb language plpgsql security definer set search_path=public,private,auth,extensions as $$ declare caller uuid :=auth.uid();model public.contribution_reputation_models%rowtype;window_name text;window_start timestamptz;window_end timestamptz :=now();batch uuid;rolling_batch uuid;lifetime_batch uuid;refreshed integer :=0;inserted_count integer :=0;begin if caller is null then raise insufficient_privilege using message='Authentication is required.';end if;if not private.has_project_role(target_project,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.';end if;select *into model from public.contribution_reputation_models where project_id=target_project and status='active' order by effective_from desc nulls last,created_at desc limit 1;if not found then raise exception 'No active contribution reputation model exists.';end if;insert into public.contribution_anomaly_signals(project_id,user_id,contribution_id,signal_type,severity,confidence,signal_key,evidence ) select target_project,c.user_id,min(c.id::text)::uuid,'reused_evidence','high',1,'DN-ANOM-EVID-' ||encode(digest(target_project::text ||':' ||c.user_id::text ||':' ||e.content_hash,'sha256'),'hex'),jsonb_build_object('content_hash',e.content_hash,'contribution_count',count(distinct c.id),'contribution_ids',jsonb_agg(distinct c.id) ) from public.contribution_evidence e join public.contribution_ledger c on c.id=e.contribution_id where c.project_id=target_project and e.content_hash is not null group by c.user_id,e.content_hash having count(distinct c.id)>1 on conflict(signal_key) do update set confidence=excluded.confidence,evidence=excluded.evidence,detected_at=now() where public.contribution_anomaly_signals.status='open';insert into public.contribution_anomaly_signals(project_id,user_id,contribution_id,signal_type,severity,confidence,signal_key,evidence ) select target_project,c.user_id,c.id,'self_review','critical',1,'DN-ANOM-SELF-' ||replace(r.id::text,'-',''),jsonb_build_object('review_id',r.id,'review_stage',r.review_stage,'decision',r.decision ) from public.contribution_reviews r join public.contribution_ledger c on c.id=r.contribution_id where c.project_id=target_project and r.reviewer_id=c.user_id on conflict(signal_key) do nothing;insert into public.contribution_anomaly_signals(project_id,user_id,signal_type,severity,confidence,signal_key,evidence ) select target_project,c.user_id,'burst_certification','medium',least(1,count(*)::numeric/12),'DN-ANOM-BURST-' ||encode(digest(target_project::text ||':' ||c.user_id::text ||':' ||date_trunc('hour',c.certified_at)::text,'sha256'),'hex' ),jsonb_build_object('hour',date_trunc('hour',c.certified_at),'certified_count',count(*),'note','Review signal only; open signals do not reduce reputation.' ) from public.contribution_ledger c where c.project_id=target_project and c.certification_state='certified' and c.certified_at is not null group by c.user_id,date_trunc('hour',c.certified_at) having count(*)>=8 on conflict(signal_key) do update set confidence=excluded.confidence,evidence=excluded.evidence,detected_at=now() where public.contribution_anomaly_signals.status='open';foreach window_name in array array['rolling_90','lifetime'] loop batch :=gen_random_uuid();window_start :=case when window_name='rolling_90' then window_end -interval '90 days' else null end;with base as (select sp.user_id,sp.lifecycle_stage,sp.reputation_opt_in,coalesce(pref.ranking_opt_in,true) as ranking_opt_in,coalesce(pref.squad_opt_in,false) as squad_opt_in,count(distinct c.id) filter (where c.certification_state='certified' and (window_start is null or coalesce(c.certified_at,c.created_at)>=window_start) )::integer as certified_count,coalesce(sum(s.contribution_score) filter (where c.certification_state='certified' and s.status='final' and (window_start is null or coalesce(c.certified_at,c.created_at)>=window_start) ),0)::numeric as impact_raw,coalesce(avg(s.quality_rating) filter (where c.certification_state='certified' and s.status='final' and (window_start is null or coalesce(c.certified_at,c.created_at)>=window_start) ),0)::numeric *100 as quality_score,coalesce(avg(private.jsonb_ratio_01(s.dimension_ratings,'documentation_mentoring')) filter (where c.certification_state='certified' and s.status='final' and (window_start is null or coalesce(c.certified_at,c.created_at)>=window_start) ),0)::numeric *100 as collaboration_score,coalesce(avg(private.jsonb_ratio_01(s.dimension_ratings,'governance_process')) filter (where c.certification_state='certified' and s.status='final' and (window_start is null or coalesce(c.certified_at,c.created_at)>=window_start) ),0)::numeric *100 as governance_score,coalesce(avg(private.jsonb_ratio_01(s.dimension_ratings,'datanest_ai_learning')) filter (where c.certification_state='certified' and s.status='final' and (window_start is null or coalesce(c.certified_at,c.created_at)>=window_start) ),0)::numeric *100 as knowledge_score from public.stakeholder_profiles sp left join public.datanest_user_preferences pref on pref.user_id=sp.user_id left join public.contribution_ledger c on c.project_id=sp.project_id and c.user_id=sp.user_id left join public.contribution_scores s on s.contribution_id=c.id and s.status='final' where sp.project_id=target_project and sp.status='active' group by sp.user_id,sp.lifecycle_stage,sp.reputation_opt_in,pref.ranking_opt_in,pref.squad_opt_in ),reviews as (select sp.user_id,count(r.id) filter (where r.decision='approved' and (window_start is null or r.created_at>=window_start) )::integer as approved_reviews from public.stakeholder_profiles sp left join public.contribution_reviews r on r.project_id=sp.project_id and r.reviewer_id=sp.user_id where sp.project_id=target_project and sp.status='active' group by sp.user_id ),signals as (select sp.user_id,coalesce(sum(private.anomaly_severity_weight(a.severity)*a.confidence ) filter (where a.status in ('open','confirmed')),0)::numeric as anomaly_points,coalesce(sum(private.anomaly_severity_weight(a.severity)*a.confidence ) filter (where a.status='confirmed'),0)::numeric as confirmed_penalty,count(a.id) filter (where a.status='confirmed' and a.severity in ('high','critical') )::integer as confirmed_high_count from public.stakeholder_profiles sp left join public.contribution_anomaly_signals a on a.project_id=sp.project_id and a.user_id=sp.user_id where sp.project_id=target_project and sp.status='active' group by sp.user_id ),normalized as (select b.*,coalesce(r.approved_reviews,0) as approved_reviews,least(100,coalesce(g.anomaly_points,0)) as anomaly_score,greatest(0,100-least(100,coalesce(g.confirmed_penalty,0))) as trust_score,coalesce(g.confirmed_high_count,0) as confirmed_high_count,case when max(b.impact_raw) over()>0 then round((b.impact_raw/max(b.impact_raw) over())*100,6) else 0 end as impact_score from base b left join reviews r on r.user_id=b.user_id left join signals g on g.user_id=b.user_id ),scored as (select n.*,round(model.impact_weight*n.impact_score +model.quality_weight*n.quality_score +model.collaboration_weight*n.collaboration_score +model.governance_weight*n.governance_score +model.knowledge_weight*n.knowledge_score,6 ) as aggregate_score,(n.reputation_opt_in and n.ranking_opt_in and n.certified_count>=model.minimum_certified_for_rank and n.confirmed_high_count=0 ) as eligible,array_remove(array[ case when not n.reputation_opt_in then 'project_reputation_disabled' end,case when not n.ranking_opt_in then 'ranking_opt_out' end,case when n.certified_count<model.minimum_certified_for_rank then 'insufficient_certified_contributions' end,case when n.confirmed_high_count>0 then 'confirmed_high_risk_signal' end ]::text[],null) as reasons from normalized n ),ranked as (select s.*,case when s.eligible then row_number() over(order by case when s.eligible then s.aggregate_score end desc nulls last,case when s.eligible then s.trust_score end desc nulls last,case when s.eligible then s.certified_count end desc nulls last,s.user_id )::integer else null end as calculated_rank from scored s ) insert into public.reputation_snapshots(project_id,user_id,window_type,period_start,period_end,aggregate_score,dimensions,rank,model_version,batch_id,trust_score,anomaly_score,eligible_for_ranking,exclusion_reasons,certified_contributions,approved_reviews,frozen_at ) select target_project,ranked.user_id,window_name,window_start,window_end,ranked.aggregate_score,jsonb_build_object('impact',round(ranked.impact_score,6),'quality',round(ranked.quality_score,6),'collaboration_mentoring',round(ranked.collaboration_score,6),'governance',round(ranked.governance_score,6),'reusable_knowledge',round(ranked.knowledge_score,6),'weights',jsonb_build_object('impact',model.impact_weight,'quality',model.quality_weight,'collaboration_mentoring',model.collaboration_weight,'governance',model.governance_weight,'reusable_knowledge',model.knowledge_weight ),'open_signals_are_not_reputation_penalties',true ),ranked.calculated_rank,model.model_version,batch,ranked.trust_score,ranked.anomaly_score,ranked.eligible,ranked.reasons,ranked.certified_count,ranked.approved_reviews,now() from ranked;get diagnostics inserted_count =row_count;refreshed :=refreshed +inserted_count;if window_name='rolling_90' then rolling_batch :=batch;update public.n0nymous_squad_memberships set status='expired',expired_at=now() where project_id=target_project and status='active';with candidates as (select rs.*,row_number() over(order by rs.aggregate_score desc,rs.trust_score desc,rs.certified_contributions desc,rs.user_id )::integer as squad_rank from public.reputation_snapshots rs join public.datanest_user_preferences pref on pref.user_id=rs.user_id where rs.project_id=target_project and rs.batch_id=batch and rs.window_type='rolling_90' and rs.eligible_for_ranking and rs.certified_contributions>=model.minimum_certified_for_squad and pref.squad_opt_in ) insert into public.n0nymous_squad_memberships(project_id,batch_id,snapshot_id,user_id,member_code,rank,aggregate_score,trust_score,status ) select target_project,batch,candidates.id,candidates.user_id,'N0-' ||upper(substr(encode(digest(target_project::text ||':' ||candidates.user_id::text,'sha256'),'hex'),1,8 )),candidates.squad_rank,candidates.aggregate_score,candidates.trust_score,'active' from candidates where candidates.squad_rank<=10;else lifetime_batch :=batch;insert into public.stakeholder_progression_recommendations(project_id,user_id,current_stage,recommended_stage,basis_snapshot_id,rationale ) select target_project,sp.user_id,sp.lifecycle_stage,case when sp.lifecycle_stage in ('accepted_user','active_stakeholder') and rs.certified_contributions>=1 and rs.trust_score>=90 then 'verified_contributor' when sp.lifecycle_stage='verified_contributor' and rs.aggregate_score>=model.trusted_score_threshold and rs.certified_contributions>=model.trusted_minimum_certified and rs.trust_score>=90 then 'trusted_contributor' when sp.lifecycle_stage='trusted_contributor' and rs.aggregate_score>=model.reviewer_score_threshold and rs.certified_contributions>=model.reviewer_minimum_certified and rs.approved_reviews>=model.reviewer_minimum_reviews and rs.trust_score>=95 then 'reviewer' else null end,rs.id,jsonb_build_object('aggregate_score',rs.aggregate_score,'trust_score',rs.trust_score,'certified_contributions',rs.certified_contributions,'approved_reviews',rs.approved_reviews,'model_version',model.model_version,'automatic_privilege_change',false ) from public.reputation_snapshots rs join public.stakeholder_profiles sp on sp.project_id=rs.project_id and sp.user_id=rs.user_id where rs.project_id=target_project and rs.batch_id=batch and rs.window_type='lifetime' and rs.eligible_for_ranking and ((sp.lifecycle_stage in ('accepted_user','active_stakeholder') and rs.certified_contributions>=1 and rs.trust_score>=90) or (sp.lifecycle_stage='verified_contributor' and rs.aggregate_score>=model.trusted_score_threshold and rs.certified_contributions>=model.trusted_minimum_certified and rs.trust_score>=90) or (sp.lifecycle_stage='trusted_contributor' and rs.aggregate_score>=model.reviewer_score_threshold and rs.certified_contributions>=model.reviewer_minimum_certified and rs.approved_reviews>=model.reviewer_minimum_reviews and rs.trust_score>=95) ) on conflict do nothing;end if;end loop;insert into public.events(project_id,event_type,actor,payload) values(target_project,'CONTRIBUTION_INTELLIGENCE_REFRESHED',coalesce(auth.jwt()->>'email',caller::text),jsonb_build_object('model_version',model.model_version,'rolling_batch',rolling_batch,'lifetime_batch',lifetime_batch,'snapshot_rows',refreshed,'open_signals_are_not_reputation_penalties',true,'squad_grants_admin',false ) );return jsonb_build_object('model_version',model.model_version,'rolling_batch',rolling_batch,'lifetime_batch',lifetime_batch,'snapshot_rows',refreshed );end;$$;

create or replace function public.get_contribution_intelligence_workspace(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  latest_rolling jsonb;
  latest_lifetime jsonb;
  latest_progression jsonb;
  active_squad jsonb;
  squad_members jsonb;
  anomaly_signals jsonb;
  preferences jsonb;
  active_model jsonb;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select to_jsonb(rs) into latest_rolling
  from public.reputation_snapshots rs
  where rs.project_id=target_project
    and rs.user_id=caller
    and rs.window_type='rolling_90'
  order by rs.frozen_at desc
  limit 1;

  select to_jsonb(rs) into latest_lifetime
  from public.reputation_snapshots rs
  where rs.project_id=target_project
    and rs.user_id=caller
    and rs.window_type='lifetime'
  order by rs.frozen_at desc
  limit 1;

  select to_jsonb(pr) into latest_progression
  from public.stakeholder_progression_recommendations pr
  where pr.project_id=target_project
    and pr.user_id=caller
    and pr.status='pending'
  order by pr.created_at desc
  limit 1;

  select to_jsonb(sm) into active_squad
  from public.n0nymous_squad_memberships sm
  where sm.project_id=target_project
    and sm.user_id=caller
    and sm.status='active'
  order by sm.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'member_code',s.member_code,
    'rank',s.rank,
    'aggregate_score',s.aggregate_score,
    'trust_score',s.trust_score
  ) order by s.rank),'[]'::jsonb)
  into squad_members
  from public.n0nymous_squad_memberships s
  where s.project_id=target_project
    and s.status='active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'signal_type',a.signal_type,
    'severity',a.severity,
    'confidence',a.confidence,
    'status',a.status,
    'detected_at',a.detected_at,
    'evidence',a.evidence,
    'resolution_notes',a.resolution_notes
  ) order by a.detected_at desc),'[]'::jsonb)
  into anomaly_signals
  from (
    select *
    from public.contribution_anomaly_signals
    where project_id=target_project
      and user_id=caller
      and status in ('open','confirmed')
    order by detected_at desc
    limit 20
  ) a;

  select jsonb_build_object(
    'ui_complexity',coalesce(p.ui_complexity,'simple'),
    'ranking_opt_in',coalesce(p.ranking_opt_in,true),
    'squad_opt_in',coalesce(p.squad_opt_in,false)
  )
  into preferences
  from (select 1) seed
  left join public.datanest_user_preferences p on p.user_id=caller;

  select jsonb_build_object(
    'model_version',m.model_version,
    'weights',jsonb_build_object(
      'impact',m.impact_weight,
      'quality',m.quality_weight,
      'collaboration_mentoring',m.collaboration_weight,
      'governance',m.governance_weight,
      'reusable_knowledge',m.knowledge_weight
    ),
    'minimum_certified_for_rank',m.minimum_certified_for_rank,
    'minimum_certified_for_squad',m.minimum_certified_for_squad,
    'trusted_score_threshold',m.trusted_score_threshold,
    'reviewer_score_threshold',m.reviewer_score_threshold
  )
  into active_model
  from public.contribution_reputation_models m
  where m.project_id=target_project and m.status='active'
  order by m.effective_from desc nulls last,m.created_at desc
  limit 1;

  return jsonb_build_object(
    'rolling_90',coalesce(latest_rolling,'{}'::jsonb),
    'lifetime',coalesce(latest_lifetime,'{}'::jsonb),
    'progression',coalesce(latest_progression,'{}'::jsonb),
    'active_squad_membership',coalesce(active_squad,'{}'::jsonb),
    'squad',coalesce(squad_members,'[]'::jsonb),
    'anomaly_signals',coalesce(anomaly_signals,'[]'::jsonb),
    'preferences',coalesce(preferences,jsonb_build_object(
      'ui_complexity','simple','ranking_opt_in',true,'squad_opt_in',false
    )),
    'model',coalesce(active_model,'{}'::jsonb),
    'can_manage',private.has_project_role(target_project,array['owner','admin']),
    'boundaries',jsonb_build_object(
      'ranking_is_legal_ownership',false,
      'squad_grants_admin',false,
      'open_anomaly_is_reputation_penalty',false,
      'progression_requires_human_approval',true
    )
  );
end;
$$;

alter table public.contribution_reputation_models enable row level security;
alter table public.contribution_anomaly_signals enable row level security;
alter table public.stakeholder_progression_recommendations enable row level security;
alter table public.n0nymous_squad_memberships enable row level security;

drop policy if exists contribution_reputation_models_select on public.contribution_reputation_models;
create policy contribution_reputation_models_select
on public.contribution_reputation_models for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists contribution_anomaly_signals_select on public.contribution_anomaly_signals;
create policy contribution_anomaly_signals_select
on public.contribution_anomaly_signals for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

drop policy if exists stakeholder_progression_select on public.stakeholder_progression_recommendations;
create policy stakeholder_progression_select
on public.stakeholder_progression_recommendations for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

drop policy if exists reputation_snapshots_select on public.reputation_snapshots;
create policy reputation_snapshots_select
on public.reputation_snapshots for select to authenticated
using (
  user_id=(select auth.uid())
  or (
    project_id is not null
    and private.has_project_role(project_id,array['owner','admin'])
  )
);

revoke all on public.contribution_reputation_models from anon,authenticated;
revoke all on public.contribution_anomaly_signals from anon,authenticated;
revoke all on public.stakeholder_progression_recommendations from anon,authenticated;
revoke all on public.n0nymous_squad_memberships from anon,authenticated;

grant select on public.contribution_reputation_models to authenticated;
grant select on public.contribution_anomaly_signals to authenticated;
grant select on public.stakeholder_progression_recommendations to authenticated;

revoke all on function public.refresh_contribution_intelligence_v1(uuid) from public,anon;
revoke all on function public.review_contribution_anomaly_v1(uuid,text,text) from public,anon;
revoke all on function public.review_stakeholder_progression_v1(uuid,text,text) from public,anon;
revoke all on function public.get_contribution_intelligence_workspace(uuid) from public,anon;

grant execute on function public.refresh_contribution_intelligence_v1(uuid) to authenticated;
grant execute on function public.review_contribution_anomaly_v1(uuid,text,text) to authenticated;
grant execute on function public.review_stakeholder_progression_v1(uuid,text,text) to authenticated;
grant execute on function public.get_contribution_intelligence_workspace(uuid) to authenticated;

commit;
