begin;

create or replace function public.get_development_work_contribution_dashboard_v1(
  target_project uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $fn$
declare
  is_admin boolean;
  result jsonb;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if not private.has_project_role(target_project,array['owner','admin','operator','viewer']) then
    raise insufficient_privilege using message='Project access denied.';
  end if;

  is_admin:=private.has_project_role(target_project,array['owner','admin']);

  with expertise(expertise_section,expertise_label,sort_order) as (
    values
      ('ui_ux','UI & UX',1),
      ('frontend','Frontend',2),
      ('backend','Backend',3),
      ('data','Data',4),
      ('ai','AI',5),
      ('testing','Testing',6),
      ('security','Security',7),
      ('infrastructure','Infrastructure',8),
      ('documentation','Documentation',9),
      ('product_planning','Product Planning',10)
  ),
  base as (
    select
      l.id,
      l.job_id,
      l.user_id,
      l.source_ref,
      l.points,
      l.verified,
      l.scoring_state,
      l.certification_state,
      l.lifecycle_state,
      l.metadata,
      coalesce(l.occurred_at,l.created_at) as contribution_at,
      l.metadata->>'expertise_section' as expertise_section,
      coalesce(nullif(btrim(l.metadata->>'expertise_label'),''),nullif(btrim(l.metadata->>'impact_area'),'')) as expertise_label,
      l.metadata->>'verification_track' as verification_track,
      coalesce(ev.verification_state,'submitted') as verification_state,
      ev.confidence as evidence_confidence,
      ev.verified_at,
      greatest(0,least(100,
        20
        + case
            when coalesce(ev.confidence,(l.metadata->>'evidence_confidence')::numeric,case when l.verified then 1 else 0 end) <= 1
            then coalesce(ev.confidence,(l.metadata->>'evidence_confidence')::numeric,case when l.verified then 1 else 0 end) * 50
            else least(50,coalesce(ev.confidence,(l.metadata->>'evidence_confidence')::numeric,0) * 0.5)
          end
        + case when l.verified then 15 else 0 end
        + case when l.scoring_state is not null and l.scoring_state <> 'unscored' then 15 else 0 end
      )) as quality_score,
      case lower(coalesce(l.certification_state,l.lifecycle_state,'intake'))
        when 'certified' then 100
        when 'certification_review' then 90
        when 'stress_tested' then 85
        when 'validated' then 75
        when 'verified' then 60
        when 'audited' then 40
        when 'needs_evidence' then 25
        when 'rejected' then 0
        else 20
      end as acceptance_score
    from public.contribution_ledger l
    left join lateral (
      select e.verification_state,e.confidence,e.verified_at
      from public.contribution_evidence e
      where e.contribution_id=l.id
      order by e.created_at desc,e.id desc
      limit 1
    ) ev on true
    where l.project_id=target_project
      and l.metadata->>'category'='development_work'
      and l.metadata->>'routing_version'='development-work-expertise-v1'
      and (is_admin or l.user_id=auth.uid())
  ),
  enriched as (
    select
      b.*,
      round((quality_score*acceptance_score/100.0),2) as impact_score,
      case
        when lower(coalesce(lifecycle_state,'')) in
          ('verified','validated','stress_tested','certification_review','certified')
        then greatest(0,coalesce(points,0))
        else 0
      end as points_awarded
    from base b
  ),
  section_rollup as (
    select
      e.expertise_section,
      e.expertise_label,
      e.sort_order,
      count(b.id)::int as input_count,
      count(b.id) filter(
        where b.id is not null
          and lower(coalesce(b.lifecycle_state,'')) not in
            ('verified','validated','stress_tested','certification_review','certified','rejected')
          and b.verification_state<>'rejected'
      )::int as pending_count,
      count(b.id) filter(
        where b.id is not null
          and (
            b.verification_state='verified'
            or lower(coalesce(b.lifecycle_state,'')) in
              ('verified','validated','stress_tested','certification_review','certified')
          )
      )::int as verified_count,
      count(b.id) filter(
        where b.id is not null
          and (
            b.verification_state='rejected'
            or lower(coalesce(b.lifecycle_state,''))='rejected'
            or lower(coalesce(b.certification_state,''))='rejected'
          )
      )::int as rejected_count,
      coalesce(sum(b.points_awarded),0)::numeric as verified_points,
      round(coalesce(avg(b.impact_score),0),2) as avg_impact,
      count(b.id) filter(where b.contribution_at>=now()-interval '7 days')::int as recent_count,
      count(b.id) filter(
        where b.contribution_at>=now()-interval '14 days'
          and b.contribution_at<now()-interval '7 days'
      )::int as previous_count,
      coalesce(
        (array_agg(upper(coalesce(b.verification_state,b.lifecycle_state,'SUBMITTED')) order by b.contribution_at desc)
          filter(where b.id is not null))[1],
        'NONE'
      ) as latest_verification_state
    from expertise e
    left join enriched b on b.expertise_section=e.expertise_section
    group by e.expertise_section,e.expertise_label,e.sort_order
  ),
  sections as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'expertise_section',expertise_section,
      'expertise_label',expertise_label,
      'verification_track',expertise_section,
      'input_count',input_count,
      'pending_count',pending_count,
      'verified_count',verified_count,
      'rejected_count',rejected_count,
      'verified_project_impact',verified_points,
      'avg_impact',avg_impact,
      'latest_verification_state',latest_verification_state,
      'trend_signal',case
        when recent_count=0 and previous_count=0 then 'quiet'
        when previous_count=0 and recent_count>0 then 'new'
        when recent_count>previous_count then 'rising'
        when recent_count<previous_count then 'cooling'
        else 'steady'
      end,
      'recent_7d_inputs',recent_count,
      'previous_7d_inputs',previous_count
    ) order by sort_order),'[]'::jsonb) as data
    from section_rollup
  ),
  queue as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,
      'job_id',job_id,
      'expertise_section',expertise_section,
      'expertise_label',expertise_label,
      'verification_track',verification_track,
      'verification_state',upper(coalesce(verification_state,'submitted')),
      'lifecycle_state',upper(coalesce(lifecycle_state,'staged')),
      'certification_state',upper(coalesce(certification_state,'uncertified')),
      'impact_score',impact_score,
      'verified_project_impact',points_awarded,
      'content',left(coalesce(nullif(btrim(metadata->>'content'),''),source_ref,'development_work'),500),
      'created_at',contribution_at
    ) order by contribution_at desc),'[]'::jsonb) as data
    from (
      select *
      from enriched
      order by contribution_at desc
      limit 100
    ) q
  ),
  summary as (
    select
      count(*)::int as input_count,
      count(*) filter(
        where lower(coalesce(lifecycle_state,'')) not in
          ('verified','validated','stress_tested','certification_review','certified','rejected')
          and verification_state<>'rejected'
      )::int as pending_count,
      count(*) filter(
        where verification_state='verified'
          or lower(coalesce(lifecycle_state,'')) in
            ('verified','validated','stress_tested','certification_review','certified')
      )::int as verified_count,
      count(*) filter(
        where verification_state='rejected'
          or lower(coalesce(lifecycle_state,''))='rejected'
          or lower(coalesce(certification_state,''))='rejected'
      )::int as rejected_count,
      coalesce(sum(points_awarded),0)::numeric as verified_project_impact,
      round(coalesce(avg(impact_score),0),2) as avg_impact
    from enriched
  )
  select jsonb_build_object(
    'routing_version','development-work-expertise-v1',
    'scoring_version','production-contribution-impact-v1',
    'viewer_scope',case when is_admin then 'project' else 'user' end,
    'summary',(select to_jsonb(summary) from summary),
    'sections',(select data from sections),
    'queue',(select data from queue),
    'policy',jsonb_build_object(
      'trend_window_days',7,
      'trend_signal_is_activity_only',true,
      'raw_activity_never_awards_points',true,
      'verification_source','public.contribution_evidence',
      'impact_source','public.contribution_ledger'
    )
  ) into result;

  return result;
end;
$fn$;

revoke all on function public.get_development_work_contribution_dashboard_v1(uuid) from public,anon;
grant execute on function public.get_development_work_contribution_dashboard_v1(uuid) to authenticated;

commit;
