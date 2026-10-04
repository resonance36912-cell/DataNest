begin;

create or replace function public.submit_development_work_contribution_v2(
  target_project uuid,
  target_job uuid,
  target_source_ref text,
  target_content text,
  target_content_hash text,
  target_impact_area text,
  target_expertise_section text,
  target_verification_track text,
  target_routing_version text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $fn$
declare
  created_contribution_id uuid;
  requirement_focus_keys text[];
  job_requirement_focus_keys text[];
  matched_requirement_focus_keys text[];
  focus_patch jsonb;
begin
  created_contribution_id := public.submit_development_work_contribution_v1(
    target_project,
    target_job,
    target_source_ref,
    target_content,
    target_content_hash,
    target_impact_area,
    target_expertise_section,
    target_verification_track,
    target_routing_version
  );

  requirement_focus_keys := case target_expertise_section
    when 'ui_ux' then array['ui_ux']
    when 'frontend' then array['workflow_functionality','ui_ux']
    when 'backend' then array['workflow_functionality','database_architecture']
    when 'data' then array['database_architecture']
    when 'ai' then array['datanest_ai_learning','workflow_functionality']
    when 'testing' then array['security_testing','workflow_functionality']
    when 'security' then array['security_testing','governance_process']
    when 'infrastructure' then array['database_architecture','cost_saving']
    when 'documentation' then array['documentation_mentoring']
    when 'product_planning' then array['workflow_functionality','governance_process']
    else array[]::text[]
  end;

  select coalesce(array_agg(value order by ordinality),array[]::text[])
    into job_requirement_focus_keys
  from public.jobs j
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(coalesce(j.requirements,'{}'::jsonb)->'focus_areas')='array'
        then coalesce(j.requirements,'{}'::jsonb)->'focus_areas'
      else '[]'::jsonb
    end
  ) with ordinality as focus(value,ordinality)
  where j.id=target_job
    and j.project_id=target_project
    and value=any(array[
      'ui_ux','database_architecture','workflow_functionality','cost_saving','brand_promotion',
      'user_acquisition','datanest_ai_learning','governance_process','security_testing','documentation_mentoring'
    ]::text[]);

  select coalesce(array_agg(focus_key order by focus_key),array[]::text[])
    into matched_requirement_focus_keys
  from unnest(requirement_focus_keys) as focus_key
  where focus_key=any(job_requirement_focus_keys);

  focus_patch := jsonb_build_object(
    'requirement_focus_keys',to_jsonb(requirement_focus_keys),
    'job_requirement_focus_keys',to_jsonb(job_requirement_focus_keys),
    'matched_requirement_focus_keys',to_jsonb(matched_requirement_focus_keys),
    'requirement_focus_match',cardinality(matched_requirement_focus_keys)>0,
    'requirement_focus_version','work-focus-v1'
  );

  update public.contribution_ledger
  set metadata=coalesce(metadata,'{}'::jsonb) || focus_patch
  where id=created_contribution_id;

  update public.contribution_evidence ce
  set metadata=coalesce(ce.metadata,'{}'::jsonb) || focus_patch
  where ce.contribution_id=created_contribution_id;

  return created_contribution_id;
end;
$fn$;

revoke all on function public.submit_development_work_contribution_v2(
  uuid,uuid,text,text,text,text,text,text,text
) from public,anon;

grant execute on function public.submit_development_work_contribution_v2(
  uuid,uuid,text,text,text,text,text,text,text
) to authenticated;

commit;
