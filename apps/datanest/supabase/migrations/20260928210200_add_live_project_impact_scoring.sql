-- Live project impact scoring: input quality × verification acceptance.
-- Scoring version: impact-quality-stage-v1

create or replace function private.get_project_impact_dashboard_v1(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  is_admin boolean;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_project_role(target_project, array['owner','admin','operator','viewer']) then
    raise exception 'Project access denied';
  end if;
  is_admin := private.has_project_role(target_project, array['owner','admin']);

  with candidate_stage as (
    select ce.event_id,
      max(case c.lifecycle_state
        when 'CERTIFIED' then 100 when 'CERTIFICATION_REVIEW' then 90
        when 'STRESS_TESTED' then 85 when 'VALIDATED' then 75 when 'VERIFIED' then 60
        when 'AUDITED' then 40 when 'NEEDS_EVIDENCE' then 25 when 'REJECTED' then 0 else 20 end) as acceptance_score,
      (array_agg(c.lifecycle_state order by case c.lifecycle_state
        when 'CERTIFIED' then 100 when 'CERTIFICATION_REVIEW' then 90
        when 'STRESS_TESTED' then 85 when 'VALIDATED' then 75 when 'VERIFIED' then 60
        when 'AUDITED' then 40 when 'NEEDS_EVIDENCE' then 25 when 'REJECTED' then 0 else 20 end desc))[1] as lifecycle_state
    from ai_candidate_evidence ce
    join ai_learning_candidates c on c.id=ce.candidate_id
    group by ce.event_id
  ),
  scored as (
    select e.*,
      greatest(0, least(100,
        20
        + least(35, (length(btrim(e.content))::numeric / 400) * 35)
        + least(25, ((select count(*) from jsonb_object_keys(coalesce(e.metadata,'{}'::jsonb)))::numeric / 4) * 25)
        + case when e.content_hash is not null and length(e.content_hash)>0 then 10 else 0 end
        + case when e.job_id is not null then 5 else 0 end
        + case when e.session_id is not null then 5 else 0 end
      )) as quality_score,
      coalesce(cs.acceptance_score,20) as acceptance_score,
      coalesce(cs.lifecycle_state,'INTAKE') as lifecycle_state,
      coalesce(nullif(btrim(e.metadata->>'impact_area'),''), nullif(btrim(e.metadata->>'category'),''), e.source_type) as impact_area
    from ai_intake_events e
    left join candidate_stage cs on cs.event_id=e.id
    where e.project_id=target_project and (is_admin or e.source_user_id=auth.uid())
  ),
  enriched as (
    select *, round((quality_score*acceptance_score/100.0),2) as impact_score,
      round((quality_score*acceptance_score/100.0),0) as points
    from scored
  ),
  summary as (
    select count(*)::int input_count, round(coalesce(avg(quality_score),0),2) avg_quality,
      round(coalesce(avg(acceptance_score),0),2) avg_acceptance,
      round(coalesce(avg(impact_score),0),2) avg_impact, coalesce(sum(points),0)::numeric total_points,
      count(*) filter(where lifecycle_state='CERTIFIED')::int certified_inputs,
      count(*) filter(where lifecycle_state='REJECTED')::int rejected_inputs
    from enriched
  ),
  areas as (
    select coalesce(jsonb_agg(jsonb_build_object('impact_area',impact_area,'input_count',input_count,'points',points,'avg_impact',avg_impact) order by points desc),'[]'::jsonb) data
    from (select impact_area,count(*)::int input_count,coalesce(sum(points),0)::numeric points,round(avg(impact_score),2) avg_impact from enriched group by impact_area)x
  ),
  stages as (
    select coalesce(jsonb_agg(jsonb_build_object('stage',lifecycle_state,'input_count',input_count,'points',points) order by stage_order),'[]'::jsonb) data
    from (select lifecycle_state,count(*)::int input_count,coalesce(sum(points),0)::numeric points,
      case lifecycle_state when 'INTAKE' then 1 when 'AUDITED' then 2 when 'VERIFIED' then 3 when 'VALIDATED' then 4 when 'STRESS_TESTED' then 5 when 'CERTIFICATION_REVIEW' then 6 when 'CERTIFIED' then 7 when 'NEEDS_EVIDENCE' then 8 when 'REJECTED' then 9 else 10 end stage_order
      from enriched group by lifecycle_state)x
  ),
  inputs as (
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'job_id',job_id,'session_id',session_id,'source_type',source_type,
      'source_user_id',source_user_id,'content',content,'created_at',created_at,'impact_area',impact_area,
      'quality_score',round(quality_score,2),'acceptance_score',acceptance_score,'impact_score',impact_score,
      'points',points,'lifecycle_state',lifecycle_state,'scoring_version','impact-quality-stage-v1') order by created_at desc),'[]'::jsonb) data
    from (select * from enriched order by created_at desc limit 200)x
  )
  select jsonb_build_object(
    'scoring_version','impact-quality-stage-v1',
    'policy',jsonb_build_object('quality_weight',0.50,'acceptance_weight',0.50,'max_score',100,'points_unit','1 point = 1 impact-score point','raw_activity_never_awards_points',true),
    'summary',(select to_jsonb(summary) from summary),'areas',(select data from areas),'stages',(select data from stages),
    'inputs',(select data from inputs),'viewer_scope',case when is_admin then 'project' else 'user' end
  ) into result;
  return result;
end;
$$;

revoke all on function private.get_project_impact_dashboard_v1(uuid) from public;
grant execute on function private.get_project_impact_dashboard_v1(uuid) to authenticated;
