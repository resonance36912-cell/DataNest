begin;

create or replace function public.create_external_audit_v1(
  target_project uuid,
  target_request_key uuid,
  target_name text,
  target_kind text,
  target_goal text default null,
  target_reference text default null
) returns table(assessment_id uuid,revision integer)
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid();
declare existing public.external_audit_assessments%rowtype;
declare created public.external_audit_assessments%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_request_key is null then raise exception 'Request key is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required.';
  end if;

  select * into existing
  from public.external_audit_assessments
  where project_id=target_project and client_request_id=target_request_key;

  if found then
    if existing.target_name is distinct from btrim(target_name)
       or existing.target_kind is distinct from btrim(target_kind)
       or existing.target_goal is distinct from nullif(btrim(coalesce(target_goal,'')),'')
       or existing.target_reference is distinct from nullif(btrim(coalesce(target_reference,'')),'') then
      raise exception 'Request key already exists with different assessment payload.';
    end if;
    return query select existing.id,existing.revision;
    return;
  end if;

  insert into public.external_audit_assessments(
    project_id,client_request_id,target_name,target_kind,target_goal,target_reference,created_by
  ) values (
    target_project,target_request_key,btrim(target_name),btrim(target_kind),
    nullif(btrim(coalesce(target_goal,'')),''),nullif(btrim(coalesce(target_reference,'')),''),caller
  ) returning * into created;

  insert into public.external_audit_events(
    assessment_id,project_id,revision,event_type,actor_user_id,payload
  ) values (
    created.id,created.project_id,created.revision,'ASSESSMENT_CREATED',caller,
    jsonb_build_object('target_kind',created.target_kind,'target_reference',created.target_reference)
  );

  return query select created.id,created.revision;
end;
$$;

revoke all on function public.create_external_audit_v1(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.create_external_audit_v1(uuid,uuid,text,text,text,text) to authenticated;

create or replace function private.external_audit_assessment_identity_guard()
returns trigger
language plpgsql
set search_path=public,private
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.client_request_id is distinct from old.client_request_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'External audit assessment identity is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists external_audit_assessment_identity_guard
  on public.external_audit_assessments;
create trigger external_audit_assessment_identity_guard
before update on public.external_audit_assessments
for each row execute function private.external_audit_assessment_identity_guard();

commit;
