begin;

alter table public.certified_memory_usage_receipts
  alter column job_id drop not null;

alter table public.certified_memory_usage_receipts
  add column if not exists assessment_id uuid references public.external_audit_assessments(id) on delete cascade;

alter table public.certified_memory_usage_receipts
  drop constraint if exists certified_memory_usage_receipts_subject_check;

alter table public.certified_memory_usage_receipts
  add constraint certified_memory_usage_receipts_subject_check
  check ((job_id is not null)::integer + (assessment_id is not null)::integer = 1);

create index if not exists certified_memory_usage_receipts_assessment_idx
  on public.certified_memory_usage_receipts(assessment_id,created_at desc)
  where assessment_id is not null;

create or replace function public.service_record_external_audit_memory_usage_v1(
  target_project uuid,
  target_assessment uuid,
  target_trace_id text,
  target_strategy text,
  target_purpose text,
  target_product_scope text,
  target_visibility_class text,
  target_query_hash text,
  target_active_count integer,
  target_applicable_count integer,
  target_selected_count integer,
  target_review_due_count integer,
  target_selected_memory_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare receipt_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if not exists(select 1 from public.external_audit_assessments a where a.id=target_assessment and a.project_id=target_project) then
    raise exception 'Assessment does not belong to project.';
  end if;
  if exists(
    select 1 from unnest(coalesce(target_selected_memory_ids,'{}'::uuid[])) selected_id
    where not exists(select 1 from public.certified_memory m where m.id=selected_id and m.project_id=target_project)
  ) then
    raise exception 'Memory receipt contains memory outside the project.';
  end if;

  insert into public.certified_memory_usage_receipts(
    project_id,job_id,assessment_id,ai_usage_request_id,trace_id,strategy,purpose,
    product_scope,visibility_class,query_hash,active_count,applicable_count,
    selected_count,review_due_count,selected_memory_ids
  ) values (
    target_project,null,target_assessment,null,btrim(target_trace_id),btrim(target_strategy),
    btrim(target_purpose),nullif(btrim(coalesce(target_product_scope,'')),''),
    btrim(target_visibility_class),target_query_hash,greatest(target_active_count,0),
    greatest(target_applicable_count,0),greatest(target_selected_count,0),
    greatest(target_review_due_count,0),coalesce(target_selected_memory_ids,'{}'::uuid[])
  )
  on conflict(project_id,trace_id) do nothing
  returning id into receipt_id;

  if receipt_id is null then
    select id into receipt_id
    from public.certified_memory_usage_receipts
    where project_id=target_project and trace_id=btrim(target_trace_id) and assessment_id=target_assessment;
    if receipt_id is null then raise exception 'Trace identity belongs to another subject.'; end if;
  end if;
  return receipt_id;
end;
$$;

revoke all on function public.service_record_external_audit_memory_usage_v1(uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.service_record_external_audit_memory_usage_v1(uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,uuid[]) to service_role;

commit;