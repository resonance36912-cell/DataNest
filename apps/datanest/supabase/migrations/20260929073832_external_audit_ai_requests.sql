begin;

alter table public.ai_usage_requests
  alter column job_id drop not null;

alter table public.ai_usage_requests
  add column if not exists assessment_id uuid references public.external_audit_assessments(id) on delete cascade;

alter table public.ai_usage_requests
  drop constraint if exists ai_usage_requests_subject_check;

alter table public.ai_usage_requests
  add constraint ai_usage_requests_subject_check
  check ((job_id is not null)::integer + (assessment_id is not null)::integer = 1);

create index if not exists ai_usage_requests_assessment_idx
  on public.ai_usage_requests(assessment_id,created_at desc)
  where assessment_id is not null;

create or replace function public.begin_external_audit_ai_request_v1(
  target_assessment uuid,
  target_client_request_id uuid,
  message_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid();
declare a public.external_audit_assessments%rowtype;
declare existing public.ai_usage_requests%rowtype;
declare req public.ai_usage_requests%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if target_client_request_id is null then raise exception 'client_request_id is required.'; end if;
  select * into a from public.external_audit_assessments where id=target_assessment;
  if not found then raise exception 'Assessment not found.'; end if;
  if not private.has_project_role(a.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required.';
  end if;
  select * into existing from public.ai_usage_requests where user_id=caller and client_request_id=target_client_request_id;
  if found then
    if existing.assessment_id is distinct from a.id or coalesce(existing.metadata->>'message_sha256','')<>coalesce(message_fingerprint,'') then
      raise exception 'Request key already exists with a different audit analysis payload.';
    end if;
    return jsonb_build_object('id',existing.id,'is_new',false,'status',existing.status,'provider_called',existing.provider_called);
  end if;
  insert into public.ai_usage_requests(client_request_id,project_id,job_id,assessment_id,user_id,status,provider_called,metadata)
  values(target_client_request_id,a.project_id,null,a.id,caller,'pending',false,jsonb_build_object('message_sha256',message_fingerprint,'purpose','external_audit_analysis'))
  returning * into req;
  return jsonb_build_object('id',req.id,'is_new',true,'status',req.status,'provider_called',req.provider_called);
end;
$$;

revoke all on function public.begin_external_audit_ai_request_v1(uuid,uuid,text) from public,anon;
grant execute on function public.begin_external_audit_ai_request_v1(uuid,uuid,text) to authenticated;

commit;