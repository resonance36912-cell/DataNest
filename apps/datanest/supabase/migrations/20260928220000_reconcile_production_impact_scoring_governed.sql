-- Reconcile production Impact Scoring with the governed contribution ledger.
-- Production does not contain the staging ai_intake_events/ai_learning_candidates tables.
-- This forward migration keeps raw staging activity out of production scoring.

create or replace function private.get_n0nymous_squad_consideration_v1(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $fn$
declare
  uid uuid := auth.uid();
  is_admin boolean;
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator','viewer']) then
    raise exception 'Project access denied';
  end if;
  is_admin := private.has_project_role(target_project,array['owner','admin']);

  with scored as (
    select l.*,
      greatest(0,least(100,
        20
        + case
            when coalesce((l.metadata->>'evidence_confidence')::numeric,
                          case when l.verified then 1 else 0 end) <= 1
            then coalesce((l.metadata->>'evidence_confidence')::numeric,
                          case when l.verified then 1 else 0 end) * 50
            else least(50,coalesce((l.metadata->>'evidence_confidence')::numeric,0) * 0.5)
          end
        + case when l.verified then 15 else 0 end
        + case when l.scoring_state is not null and l.scoring_state <> 'unscored' then 15 else 0 end
      )) as quality_score,
      case lower(coalesce(l.certification_state,l.lifecycle_state,'intake'))
        when 'certified' then 100 when 'certification_review' then 90
        when 'stress_tested' then 85 when 'validated' then 75 when 'verified' then 60
        when 'audited' then 40 when 'needs_evidence' then 25 when 'rejected' then 0 else 20
      end as acceptance_score
    from public.contribution_ledger l
    where l.project_id=target_project and l.user_id is not null
      and (is_admin or l.user_id=uid)
  ), enriched as (
    select *,
      round((quality_score*acceptance_score/100.0),2) as impact_score,
      case when lower(coalesce(lifecycle_state,'')) in
        ('verified','validated','stress_tested','certification_review','certified')
        then greatest(0,coalesce(points,0)) else 0 end as points_awarded
    from scored
  ), self as (
    select count(*)::int input_count, coalesce(sum(points_awarded),0)::numeric total_points,
      round(coalesce(avg(quality_score),0),2) avg_quality,
      round(coalesce(avg(impact_score),0),2) avg_impact,
      count(*) filter(where lower(coalesce(certification_state,''))='certified')::int certified_inputs
    from enriched where user_id=uid
  ), candidates as (
    select left(md5(user_id::text||target_project::text||'n0nymous-v1'),10) anonymous_id,
      count(*)::int input_count, coalesce(sum(points_awarded),0)::numeric total_points,
      round(coalesce(avg(quality_score),0),2) avg_quality,
      round(coalesce(avg(impact_score),0),2) avg_impact,
      count(*) filter(where lower(coalesce(certification_state,''))='certified')::int certified_inputs
    from enriched group by user_id
    having coalesce(sum(points_awarded),0) >= 100
       and count(*) filter(where lower(coalesce(certification_state,''))='certified') >= 1
       and coalesce(avg(impact_score),0) >= 60
  )
  select jsonb_build_object(
    'status','consideration_only','criteria_version','n0nymous-v1',
    'thresholds',jsonb_build_object('minimum_points',100,'minimum_certified_inputs',1,'minimum_average_impact',60),
    'self',(select jsonb_build_object(
      'eligible_for_consideration',total_points >= 100 and certified_inputs >= 1 and avg_impact >= 60,
      'input_count',input_count,'total_points',total_points,'avg_quality',avg_quality,
      'avg_impact',avg_impact,'certified_inputs',certified_inputs) from self),
    'candidate_pool',case when is_admin then coalesce(
      (select jsonb_agg(jsonb_build_object(
        'anonymous_id',anonymous_id,'input_count',input_count,'total_points',total_points,
        'avg_quality',avg_quality,'avg_impact',avg_impact,'certified_inputs',certified_inputs)
        order by total_points desc) from candidates),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$fn$;

revoke all on function private.get_n0nymous_squad_consideration_v1(uuid) from public,authenticated;

create or replace function private.get_project_impact_dashboard_v1(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $fn$
declare is_admin boolean; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator','viewer']) then
    raise exception 'Project access denied';
  end if;
  is_admin := private.has_project_role(target_project,array['owner','admin']);

  with scored as (
    select l.*,
      greatest(0,least(100,
        20
        + case
            when coalesce((l.metadata->>'evidence_confidence')::numeric,
                          case when l.verified then 1 else 0 end) <= 1
            then coalesce((l.metadata->>'evidence_confidence')::numeric,
                          case when l.verified then 1 else 0 end) * 50
            else least(50,coalesce((l.metadata->>'evidence_confidence')::numeric,0) * 0.5)
          end
        + case when l.verified then 15 else 0 end
        + case when l.scoring_state is not null and l.scoring_state <> 'unscored' then 15 else 0 end
      )) as quality_score,
      case lower(coalesce(l.certification_state,l.lifecycle_state,'intake'))
        when 'certified' then 100 when 'certification_review' then 90
        when 'stress_tested' then 85 when 'validated' then 75 when 'verified' then 60
        when 'audited' then 40 when 'needs_evidence' then 25 when 'rejected' then 0 else 20
      end as acceptance_score,
      coalesce(nullif(btrim(l.metadata->>'impact_area'),''),nullif(btrim(l.metadata->>'category'),''),l.contribution_type) as impact_area
    from public.contribution_ledger l
    where l.project_id=target_project and (is_admin or l.user_id=auth.uid())
  ), enriched as (
    select *, round((quality_score*acceptance_score/100.0),2) as impact_score,
      case when lower(coalesce(lifecycle_state,'')) in
        ('verified','validated','stress_tested','certification_review','certified')
        then greatest(0,coalesce(points,0)) else 0 end as points_awarded
    from scored
  ), summary as (
    select count(*)::int input_count, round(coalesce(avg(quality_score),0),2) avg_quality,
      round(coalesce(avg(acceptance_score),0),2) avg_acceptance,
      round(coalesce(avg(impact_score),0),2) avg_impact,
      coalesce(sum(points_awarded),0)::numeric total_points,
      count(*) filter(where lower(coalesce(certification_state,''))='certified')::int certified_inputs,
      count(*) filter(where lower(coalesce(certification_state,''))='rejected')::int rejected_inputs
    from enriched
  ), areas as (
    select coalesce(jsonb_agg(jsonb_build_object('impact_area',impact_area,'input_count',input_count,'points',points,'avg_impact',avg_impact) order by points desc),'[]'::jsonb) data
    from (select impact_area,count(*)::int input_count,coalesce(sum(points_awarded),0)::numeric points,
      round(avg(impact_score),2) avg_impact from enriched group by impact_area)x
  ), stages as (
    select coalesce(jsonb_agg(jsonb_build_object('stage',lifecycle_state,'input_count',input_count,'points',points) order by stage_order),'[]'::jsonb) data
    from (select lower(coalesce(lifecycle_state,'intake')) lifecycle_state,count(*)::int input_count,
      coalesce(sum(points_awarded),0)::numeric points,
      case lower(coalesce(lifecycle_state,'intake'))
        when 'intake' then 1 when 'audited' then 2 when 'verified' then 3 when 'validated' then 4
        when 'stress_tested' then 5 when 'certification_review' then 6 when 'certified' then 7
        when 'needs_evidence' then 8 when 'rejected' then 9 else 10 end stage_order
      from enriched group by lower(coalesce(lifecycle_state,'intake')))x
  ), inputs as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'job_id',job_id,'session_id',null,'source_type',contribution_type,
      'content',coalesce(nullif(btrim(metadata->>'content'),''),nullif(btrim(source_ref),''),contribution_type),
      'created_at',coalesce(occurred_at,created_at),'impact_area',impact_area,
      'quality_score',round(quality_score,2),'acceptance_score',acceptance_score,'impact_score',impact_score,
      'points',points_awarded,'lifecycle_state',upper(coalesce(lifecycle_state,'INTAKE')),
      'scoring_version','production-contribution-impact-v1'
    ) order by coalesce(occurred_at,created_at) desc),'[]'::jsonb) data
    from (select * from enriched order by coalesce(occurred_at,created_at) desc limit 200)x
  )
  select jsonb_build_object(
    'scoring_version','production-contribution-impact-v1',
    'policy',jsonb_build_object('quality_weight',0.50,'acceptance_weight',0.50,'max_score',100,
      'points_unit','1 governed contribution point = 1 impact point',
      'raw_activity_never_awards_points',true,'source','public.contribution_ledger'),
    'summary',(select to_jsonb(summary) from summary),'areas',(select data from areas),
    'stages',(select data from stages),'inputs',(select data from inputs),
    'viewer_scope',case when is_admin then 'project' else 'user' end,
    'n0nymous_squad',private.get_n0nymous_squad_consideration_v1(target_project)
  ) into result;
  return result;
end;
$fn$;

revoke all on function private.get_project_impact_dashboard_v1(uuid) from public;
grant execute on function private.get_project_impact_dashboard_v1(uuid) to authenticated;
