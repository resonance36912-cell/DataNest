begin;

create or replace function public.save_external_audit_profile_v1(
  target_assessment uuid,
  target_revision integer,
  target_domains text[],
  target_jurisdiction text,
  target_selected_standards jsonb,
  target_excluded_standards jsonb,
  target_approve boolean default false
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare a public.external_audit_assessments%rowtype;
declare next_version integer;
declare result_id uuid;
begin
  select * into a from public.external_audit_assessments where id=target_assessment;
  if not found then raise exception 'Assessment not found.'; end if;
  if a.revision<>target_revision then raise exception 'Assessment revision is stale.'; end if;
  if not private.has_project_role(a.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required.';
  end if;
  if target_approve and not private.has_project_role(a.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to approve a standards profile.';
  end if;
  select coalesce(max(profile_version),0)+1 into next_version from public.external_audit_profiles where assessment_id=a.id and revision=a.revision;
  insert into public.external_audit_profiles(
    assessment_id,project_id,revision,profile_version,domains,jurisdiction,
    selected_standards,excluded_standards,approved_by,approved_at,created_by
  ) values (
    a.id,a.project_id,a.revision,next_version,coalesce(target_domains,'{}'::text[]),
    nullif(btrim(coalesce(target_jurisdiction,'')),''),
    coalesce(target_selected_standards,'[]'::jsonb),coalesce(target_excluded_standards,'[]'::jsonb),
    case when target_approve then auth.uid() else null end,
    case when target_approve then now() else null end,auth.uid()
  ) returning id into result_id;
  insert into public.external_audit_events(assessment_id,project_id,revision,event_type,actor_user_id,payload)
  values(a.id,a.project_id,a.revision,case when target_approve then 'STANDARDS_PROFILE_APPROVED' else 'STANDARDS_PROFILE_SAVED' end,auth.uid(),jsonb_build_object('profile_id',result_id,'profile_version',next_version));
  return result_id;
end;
$$;

create or replace function public.review_external_audit_finding_v1(
  target_finding uuid,
  target_decision text,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare f public.external_audit_findings%rowtype;
declare reviewer_ok boolean;
begin
  select * into f from public.external_audit_findings where id=target_finding for update;
  if not found then raise exception 'Finding not found.'; end if;
  reviewer_ok := private.has_project_role(f.project_id,array['owner','admin'])
    or (
      private.has_project_role(f.project_id,array['operator'])
      and exists(select 1 from public.external_audit_reviewers r where r.assessment_id=f.assessment_id and r.reviewer_user_id=auth.uid() and r.active)
    );
  if not reviewer_ok then raise insufficient_privilege using message='Authorized reviewer access is required.'; end if;
  if target_decision not in ('observation','potential_gap','verified_nonconformity','accepted','rejected') then raise exception 'Invalid finding decision.'; end if;
  if target_decision='verified_nonconformity' and not exists(
    select 1 from public.external_audit_profiles p where p.assessment_id=f.assessment_id and p.revision=f.revision and p.approved_at is not null
  ) then raise exception 'An approved standards profile is required.'; end if;
  update public.external_audit_findings set state=target_decision where id=f.id;
  insert into public.external_audit_events(assessment_id,project_id,revision,event_type,actor_user_id,payload)
  values(f.assessment_id,f.project_id,f.revision,'FINDING_REVIEWED',auth.uid(),jsonb_build_object('finding_id',f.id,'decision',target_decision,'reason',left(coalesce(target_reason,''),2000)));
  return f.id;
end;
$$;

create or replace function public.approve_external_audit_action_v1(
  target_action uuid,
  target_request_key uuid
) returns table(action_id uuid,job_id uuid)
language plpgsql
security definer
set search_path=public,auth
as $$
declare act public.external_audit_actions%rowtype;
declare f public.external_audit_findings%rowtype;
declare reviewer_ok boolean;
declare created_job uuid;
declare existing_job uuid;
begin
  if target_request_key is null then raise exception 'Request key is required.'; end if;
  select * into act from public.external_audit_actions where id=target_action for update;
  if not found then raise exception 'Action not found.'; end if;
  select * into f from public.external_audit_findings where id=act.finding_id;
  reviewer_ok := private.has_project_role(act.project_id,array['owner','admin'])
    or (
      private.has_project_role(act.project_id,array['operator'])
      and exists(select 1 from public.external_audit_reviewers r where r.assessment_id=act.assessment_id and r.reviewer_user_id=auth.uid() and r.active)
    );
  if not reviewer_ok then raise insufficient_privilege using message='Authorized reviewer access is required.'; end if;
  if act.job_id is not null then
    if act.approval_request_id is distinct from target_request_key then raise exception 'Action was approved with a different request key.'; end if;
    return query select act.id,act.job_id; return;
  end if;
  if not exists(select 1 from public.external_audit_profiles p where p.assessment_id=act.assessment_id and p.revision=f.revision and p.approved_at is not null) then
    raise exception 'Approved standards profile is required.';
  end if;
  if cardinality(f.evidence_ids)=0 or exists(
    select 1 from unnest(f.evidence_ids) eid
    where not exists(select 1 from public.external_audit_sources s where s.id=eid and s.assessment_id=act.assessment_id and s.project_id=act.project_id and s.acquisition_state='captured')
  ) then raise exception 'Captured evidence is required before action approval.'; end if;

  select m.job_id into created_job
  from public.create_job_manifest_v2(
    act.project_id,target_request_key,
    'External audit optimization · '||left(act.outcome,120),
    concat('DataNest External Audit & Optimizer action ',act.id,'. Finding: ',left(f.observation,1200),'. Acceptance: ',coalesce(act.acceptance,'Reviewer verification required.')),
    act.priority,'chat',true,true
  ) m limit 1;

  select j.id into existing_job from public.jobs j where j.id=created_job and j.project_id=act.project_id;
  if existing_job is null then raise exception 'UNIFI job creation failed.'; end if;

  update public.external_audit_actions
  set status='planned',job_id=created_job,approval_request_id=target_request_key,approved_by=auth.uid(),approved_at=now()
  where id=act.id;
  insert into public.external_audit_events(assessment_id,project_id,revision,event_type,actor_user_id,payload)
  values(act.assessment_id,act.project_id,f.revision,'ACTION_APPROVED_TO_UNIFI',auth.uid(),jsonb_build_object('action_id',act.id,'job_id',created_job,'request_key',target_request_key));
  return query select act.id,created_job;
end;
$$;

create or replace function public.close_external_audit_action_v1(
  target_action uuid,
  target_verification_source uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare act public.external_audit_actions%rowtype;
declare src public.external_audit_sources%rowtype;
declare reviewer_ok boolean;
begin
  select * into act from public.external_audit_actions where id=target_action for update;
  if not found then raise exception 'Action not found.'; end if;
  reviewer_ok := private.has_project_role(act.project_id,array['owner','admin'])
    or (private.has_project_role(act.project_id,array['operator']) and exists(select 1 from public.external_audit_reviewers r where r.assessment_id=act.assessment_id and r.reviewer_user_id=auth.uid() and r.active));
  if not reviewer_ok then raise insufficient_privilege using message='Authorized reviewer access is required.'; end if;
  select * into src from public.external_audit_sources where id=target_verification_source and assessment_id=act.assessment_id and project_id=act.project_id and acquisition_state='captured';
  if not found then raise exception 'Same-assessment captured verification evidence is required.'; end if;
  update public.external_audit_actions set status='closed',verification_source_id=src.id,closed_at=now() where id=act.id;
  insert into public.external_audit_events(assessment_id,project_id,revision,event_type,actor_user_id,payload)
  values(act.assessment_id,act.project_id,src.revision,'ACTION_CLOSED',auth.uid(),jsonb_build_object('action_id',act.id,'verification_source_id',src.id,'reason',left(coalesce(target_reason,''),2000)));
  return act.id;
end;
$$;

create or replace function public.publish_external_audit_document_v1(
  target_assessment uuid,
  target_revision integer,
  target_kind text,
  target_format text,
  target_content text,
  target_storage_reference text,
  target_visibility text default 'project_restricted'
) returns uuid
language plpgsql
security definer
set search_path=public,auth,extensions
as $$
declare a public.external_audit_assessments%rowtype;
declare doc_id uuid;
declare content_hash_value text;
begin
  select * into a from public.external_audit_assessments where id=target_assessment;
  if not found then raise exception 'Assessment not found.'; end if;
  if a.revision<>target_revision then raise exception 'Assessment revision is stale.'; end if;
  if not private.has_project_role(a.project_id,array['owner','admin','operator']) then raise insufficient_privilege; end if;
  if coalesce(target_content,'')='' then raise exception 'Document content is required.'; end if;
  content_hash_value:=encode(digest(convert_to(target_content,'UTF8'),'sha256'),'hex');
  insert into public.external_audit_documents(assessment_id,project_id,revision,kind,format,content_hash,content_text,storage_reference,visibility,generated_by)
  values(a.id,a.project_id,a.revision,target_kind,target_format,content_hash_value,target_content,nullif(btrim(coalesce(target_storage_reference,'')),''),target_visibility,auth.uid())
  returning id into doc_id;
  insert into public.external_audit_events(assessment_id,project_id,revision,event_type,actor_user_id,payload)
  values(a.id,a.project_id,a.revision,'DOCUMENT_PUBLISHED',auth.uid(),jsonb_build_object('document_id',doc_id,'kind',target_kind,'format',target_format,'content_hash',content_hash_value));
  return doc_id;
end;
$$;

revoke all on function public.save_external_audit_profile_v1(uuid,integer,text[],text,jsonb,jsonb,boolean) from public,anon;
revoke all on function public.review_external_audit_finding_v1(uuid,text,text) from public,anon;
revoke all on function public.approve_external_audit_action_v1(uuid,uuid) from public,anon;
revoke all on function public.close_external_audit_action_v1(uuid,uuid,text) from public,anon;
revoke all on function public.publish_external_audit_document_v1(uuid,integer,text,text,text,text,text) from public,anon;
grant execute on function public.save_external_audit_profile_v1(uuid,integer,text[],text,jsonb,jsonb,boolean) to authenticated;
grant execute on function public.review_external_audit_finding_v1(uuid,text,text) to authenticated;
grant execute on function public.approve_external_audit_action_v1(uuid,uuid) to authenticated;
grant execute on function public.close_external_audit_action_v1(uuid,uuid,text) to authenticated;
grant execute on function public.publish_external_audit_document_v1(uuid,integer,text,text,text,text,text) to authenticated;

commit;