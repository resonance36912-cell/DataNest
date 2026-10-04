-- Performance hardening for live impact scoring.
-- Optional staging indexes are intentionally deferred because the governed AI staging
-- relations are not present in every DataNest database. The function below fails
-- closed to an explicit unavailable state when those relations are absent.

create or replace function private.get_project_impact_dashboard_base_v1(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $fn$
declare is_admin boolean; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if to_regclass('public.ai_intake_events') is null
     or to_regclass('public.ai_candidate_evidence') is null
     or to_regclass('public.ai_learning_candidates') is null then
    return jsonb_build_object(
      'status','unavailable',
      'reason','governed_ai_staging_relations_unavailable',
      'scoring_version','impact-quality-stage-v1',
      'summary',jsonb_build_object(
        'input_count',0,
        'avg_quality',0,
        'avg_acceptance',0,
        'avg_impact',0,
        'total_points',0,
        'certified_inputs',0,
        'rejected_inputs',0
      ),
      'areas','[]'::jsonb,
      'stages','[]'::jsonb,
      'inputs','[]'::jsonb
    );
  end if;
  if not private.has_project_role(target_project,array['owner','admin','operator','viewer']) then raise exception 'Project access denied'; end if;
  is_admin:=private.has_project_role(target_project,array['owner','admin']);
  with candidate_stage as (
    select ce.event_id,
      max(case c.lifecycle_state when 'CERTIFIED' then 100 when 'CERTIFICATION_REVIEW' then 90 when 'STRESS_TESTED' then 85 when 'VALIDATED' then 75 when 'VERIFIED' then 60 when 'AUDITED' then 40 when 'NEEDS_EVIDENCE' then 25 when 'REJECTED' then 0 else 20 end) acceptance_score,
      (array_agg(c.lifecycle_state order by case c.lifecycle_state when 'CERTIFIED' then 100 when 'CERTIFICATION_REVIEW' then 90 when 'STRESS_TESTED' then 85 when 'VALIDATED' then 75 when 'VERIFIED' then 60 when 'AUDITED' then 40 when 'NEEDS_EVIDENCE' then 25 when 'REJECTED' then 0 else 20 end desc))[1] lifecycle_state
    from ai_candidate_evidence ce join ai_learning_candidates c on c.id=ce.candidate_id
    where c.project_id=target_project
    group by ce.event_id
  ), scored as (
    select e.*,greatest(0,least(100,20+least(35,(length(btrim(e.content))::numeric/400)*35)+least(25,((select count(*) from jsonb_object_keys(coalesce(e.metadata,'{}'::jsonb)))::numeric/4)*25)+case when e.content_hash is not null and length(e.content_hash)>0 then 10 else 0 end+case when e.job_id is not null then 5 else 0 end+case when e.session_id is not null then 5 else 0 end)) quality_score,
      coalesce(cs.acceptance_score,20) acceptance_score,coalesce(cs.lifecycle_state,'INTAKE') lifecycle_state,
      coalesce(nullif(btrim(e.metadata->>'impact_area'),''),nullif(btrim(e.metadata->>'category'),''),e.source_type) impact_area
    from ai_intake_events e left join candidate_stage cs on cs.event_id=e.id
    where e.project_id=target_project and (is_admin or e.source_user_id=auth.uid())
  ), enriched as (
    select *,round(quality_score*acceptance_score/100.0,2) impact_score,round(quality_score*acceptance_score/100.0,0) points from scored
  ), summary as (
    select count(*)::int input_count,round(coalesce(avg(quality_score),0),2) avg_quality,round(coalesce(avg(acceptance_score),0),2) avg_acceptance,round(coalesce(avg(impact_score),0),2) avg_impact,coalesce(sum(points),0)::numeric total_points,count(*) filter(where lifecycle_state='CERTIFIED')::int certified_inputs,count(*) filter(where lifecycle_state='REJECTED')::int rejected_inputs from enriched
  ), areas as (
    select coalesce(jsonb_agg(jsonb_build_object('impact_area',impact_area,'input_count',input_count,'points',points,'avg_impact',avg_impact) order by points desc),'[]'::jsonb) data from (select impact_area,count(*)::int input_count,coalesce(sum(points),0)::numeric points,round(avg(impact_score),2) avg_impact from enriched group by impact_area)x
  ), stages as (
    select coalesce(jsonb_agg(jsonb_build_object('stage',lifecycle_state,'input_count',input_count,'points',points) order by stage_order),'[]'::jsonb) data from (select lifecycle_state,count(*)::int input_count,coalesce(sum(points),0)::numeric points,case lifecycle_state when 'INTAKE' then 1 when 'AUDITED' then 2 when 'VERIFIED' then 3 when 'VALIDATED' then 4 when 'STRESS_TESTED' then 5 when 'CERTIFICATION_REVIEW' then 6 when 'CERTIFIED' then 7 when 'NEEDS_EVIDENCE' then 8 when 'REJECTED' then 9 else 10 end stage_order from enriched group by lifecycle_state)x
  ), inputs as (
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'job_id',job_id,'session_id',session_id,'source_type',source_type,'content',content,'created_at',created_at,'impact_area',impact_area,'quality_score',round(quality_score,2),'acceptance_score',acceptance_score,'impact_score',impact_score,'points',points,'lifecycle_state',lifecycle_state,'scoring_version','impact-quality-stage-v1') order by created_at desc),'[]'::jsonb) data from (select * from enriched order by created_at desc limit 200)x
  )
  select jsonb_build_object('scoring_version','impact-quality-stage-v1','policy',jsonb_build_object('quality_weight',0.50,'acceptance_weight',0.50,'max_score',100,'points_unit','1 point = 1 impact-score point','raw_activity_never_awards_points',true),'summary',(select to_jsonb(summary) from summary),'areas',(select data from areas),'stages',(select data from stages),'inputs',(select data from inputs),'viewer_scope',case when is_admin then 'project' else 'user' end) into result;
  return result;
end;
$fn$;
revoke all on function private.get_project_impact_dashboard_base_v1(uuid) from public;
grant execute on function private.get_project_impact_dashboard_base_v1(uuid) to authenticated;