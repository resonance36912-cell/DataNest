-- N0NYMOUS SQUAD consideration layer.
-- Adds an anonymous, evidence-based consideration signal without exposing contributor identity.

alter function private.get_project_impact_dashboard_v1(uuid) rename to get_project_impact_dashboard_base_v1;
revoke all on function private.get_project_impact_dashboard_base_v1(uuid) from public;
grant execute on function private.get_project_impact_dashboard_base_v1(uuid) to authenticated;

create or replace function private.get_n0nymous_squad_consideration_v1(target_project uuid)
returns jsonb language plpgsql security definer set search_path=public,private
as $fn$
begin
  if to_regclass('public.ai_intake_events') is null
     or to_regclass('public.ai_candidate_evidence') is null
     or to_regclass('public.ai_learning_candidates') is null then
    return jsonb_build_object(
      'status','unavailable',
      'criteria_version','n0nymous-v1',
      'reason','governed_ai_staging_relations_unavailable',
      'self',jsonb_build_object('eligible_for_consideration',false),
      'candidate_pool','[]'::jsonb
    );
  end if;

  return (
with candidate_stage as (
  select ce.event_id,
    max(case c.lifecycle_state
      when 'CERTIFIED' then 100 when 'CERTIFICATION_REVIEW' then 90 when 'STRESS_TESTED' then 85
      when 'VALIDATED' then 75 when 'VERIFIED' then 60 when 'AUDITED' then 40
      when 'NEEDS_EVIDENCE' then 25 when 'REJECTED' then 0 else 20 end) acceptance_score
  from ai_candidate_evidence ce
  join ai_learning_candidates c on c.id=ce.candidate_id
  group by ce.event_id
), scored as (
  select e.*,
    greatest(0,least(100,
      20
      + least(35,(length(btrim(e.content))::numeric/400)*35)
      + least(25,((select count(*) from jsonb_object_keys(coalesce(e.metadata,'{}'::jsonb)))::numeric/4)*25)
      + case when e.content_hash is not null and length(e.content_hash)>0 then 10 else 0 end
      + case when e.job_id is not null then 5 else 0 end
      + case when e.session_id is not null then 5 else 0 end
    )) quality_score,
    coalesce(cs.acceptance_score,20) acceptance_score
  from ai_intake_events e
  left join candidate_stage cs on cs.event_id=e.id
  where e.project_id=target_project
), enriched as (
  select e.*,
    round(quality_score*acceptance_score/100.0,2) impact_score,
    round(quality_score*acceptance_score/100.0,0) points,
    coalesce((
      select c.lifecycle_state
      from ai_candidate_evidence ce
      join ai_learning_candidates c on c.id=ce.candidate_id
      where ce.event_id=e.id
      order by case c.lifecycle_state
        when 'CERTIFIED' then 100 when 'CERTIFICATION_REVIEW' then 90 when 'STRESS_TESTED' then 85
        when 'VALIDATED' then 75 when 'VERIFIED' then 60 when 'AUDITED' then 40
        when 'NEEDS_EVIDENCE' then 25 when 'REJECTED' then 0 else 20 end desc
      limit 1
    ),'INTAKE') lifecycle_state
  from scored e
), self_stats as (
  select count(*)::int input_count,
    round(coalesce(avg(quality_score),0),2) avg_quality,
    round(coalesce(avg(impact_score),0),2) avg_impact,
    coalesce(sum(points),0)::numeric total_points,
    count(*) filter(where lifecycle_state='CERTIFIED')::int certified_inputs
  from enriched
  where source_user_id=auth.uid()
), pool as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'anonymous_id',left(md5(source_user_id::text||target_project::text||'n0nymous-v1'),10),
    'input_count',input_count,'total_points',total_points,'avg_quality',avg_quality,
    'avg_impact',avg_impact,'certified_inputs',certified_inputs
  ) order by total_points desc),'[]'::jsonb) data
  from (
    select source_user_id,count(*)::int input_count,
      coalesce(sum(points),0)::numeric total_points,
      round(avg(quality_score),2) avg_quality,
      round(avg(impact_score),2) avg_impact,
      count(*) filter(where lifecycle_state='CERTIFIED')::int certified_inputs
    from enriched
    group by source_user_id
    having coalesce(sum(points),0)>=100
      and count(*) filter(where lifecycle_state='CERTIFIED')>=1
      and avg(impact_score)>=60
  ) c
)
select jsonb_build_object(
  'status','consideration_only',
  'criteria_version','n0nymous-v1',
  'thresholds',jsonb_build_object(
    'minimum_points',100,
    'minimum_certified_inputs',1,
    'minimum_average_impact',60
  ),
  'self',jsonb_build_object(
    'eligible_for_consideration',
      coalesce((select total_points>=100 and certified_inputs>=1 and avg_impact>=60 from self_stats),false),
    'input_count',(select input_count from self_stats),
    'total_points',(select total_points from self_stats),
    'avg_quality',(select avg_quality from self_stats),
    'avg_impact',(select avg_impact from self_stats),
    'certified_inputs',(select certified_inputs from self_stats)
  ),
  'candidate_pool',
    case when private.has_project_role(target_project,array['owner','admin'])
      then (select data from pool) else '[]'::jsonb end
)
  );
end;
$fn$;

revoke all on function private.get_n0nymous_squad_consideration_v1(uuid) from public, authenticated;

create or replace function private.get_project_impact_dashboard_v1(target_project uuid)
returns jsonb language plpgsql security definer set search_path=public,private
as $fn$
declare result jsonb;
begin
  result := private.get_project_impact_dashboard_base_v1(target_project);
  result := result || jsonb_build_object(
    'n0nymous_squad',
    private.get_n0nymous_squad_consideration_v1(target_project)
  );
  return result;
end;
$fn$;

revoke all on function private.get_project_impact_dashboard_v1(uuid) from public;
grant execute on function private.get_project_impact_dashboard_v1(uuid) to authenticated;
