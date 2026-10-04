begin;

create or replace function public.submit_development_work_contribution_v1(
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
  caller uuid := auth.uid();
  expected_label text;
  contribution_id uuid;
  ledger_source_ref text;
  routing_metadata jsonb;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  if not exists(
    select 1
    from public.jobs j
    where j.id=target_job
      and j.project_id=target_project
  ) then
    raise exception 'Job does not belong to the requested project.';
  end if;

  expected_label := case target_expertise_section
    when 'ui_ux' then 'UI & UX'
    when 'frontend' then 'Frontend'
    when 'backend' then 'Backend'
    when 'data' then 'Data'
    when 'ai' then 'AI'
    when 'testing' then 'Testing'
    when 'security' then 'Security'
    when 'infrastructure' then 'Infrastructure'
    when 'documentation' then 'Documentation'
    when 'product_planning' then 'Product Planning'
    else null
  end;

  if expected_label is null then
    raise exception 'Unsupported Development Work expertise section.';
  end if;
  if target_impact_area is distinct from expected_label then
    raise exception 'Development Work impact area does not match expertise section.';
  end if;
  if target_verification_track is distinct from target_expertise_section then
    raise exception 'Development Work verification track does not match expertise section.';
  end if;
  if target_routing_version is distinct from 'development-work-expertise-v1' then
    raise exception 'Unsupported Development Work routing version.';
  end if;
  if nullif(btrim(coalesce(target_source_ref,'')),'') is null then
    raise exception 'Development Work source reference is required.';
  end if;
  if nullif(btrim(coalesce(target_content,'')),'') is null then
    raise exception 'Development Work contribution content is required.';
  end if;
  if nullif(btrim(coalesce(target_content_hash,'')),'') is null then
    raise exception 'Development Work content hash is required.';
  end if;

  ledger_source_ref := 'datanest-ai:' || btrim(target_source_ref);
  routing_metadata := jsonb_build_object(
    'category','development_work',
    'impact_area',expected_label,
    'expertise_section',target_expertise_section,
    'expertise_label',expected_label,
    'verification_track',target_verification_track,
    'routing_version',target_routing_version,
    'source','datanest_ai',
    'trust_state','uncertified',
    'content',left(target_content,2000),
    'content_hash',target_content_hash
  );

  insert into public.contribution_ledger(
    project_id,
    job_id,
    user_id,
    contribution_type,
    quantity,
    unit,
    points,
    verified,
    verification_source,
    source_ref,
    metadata
  )
  values(
    target_project,
    target_job,
    caller,
    'human_input',
    1,
    'development_work',
    0,
    false,
    null,
    ledger_source_ref,
    routing_metadata
  )
  on conflict (project_id,user_id,contribution_type,source_ref)
  where source_ref is not null
  do update set
    metadata=public.contribution_ledger.metadata || excluded.metadata
  returning id into contribution_id;

  insert into public.contribution_evidence(
    contribution_id,
    project_id,
    submitted_by,
    evidence_type,
    evidence_ref,
    evidence_text,
    content_hash,
    verification_state,
    metadata
  )
  values(
    contribution_id,
    target_project,
    caller,
    'other',
    ledger_source_ref,
    target_content,
    target_content_hash,
    'submitted',
    routing_metadata
  )
  on conflict (contribution_id,content_hash)
  where content_hash is not null
  do update set
    evidence_ref=excluded.evidence_ref,
    evidence_text=excluded.evidence_text,
    metadata=public.contribution_evidence.metadata || excluded.metadata;

  update public.contribution_ledger
  set lifecycle_state='staged'
  where id=contribution_id
    and lifecycle_state='submitted';

  return contribution_id;
end;
$fn$;

revoke all on function public.submit_development_work_contribution_v1(
  uuid,uuid,text,text,text,text,text,text,text
) from public,anon;

grant execute on function public.submit_development_work_contribution_v1(
  uuid,uuid,text,text,text,text,text,text,text
) to authenticated;

commit;
