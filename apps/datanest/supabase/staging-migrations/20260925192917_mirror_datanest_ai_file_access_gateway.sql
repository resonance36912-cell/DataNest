create or replace function private.authorize_datanest_ai_file_access(
  target_job uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  j record;
  allowed boolean := false;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select id,project_id into j
  from public.jobs
  where id=target_job;

  if not found then
    raise exception 'Job not found.';
  end if;

  allowed :=
    exists(
      select 1
      from public.project_members pm
      where pm.project_id=j.project_id
        and pm.user_id=caller
        and pm.status='active'
        and pm.role in ('owner','admin')
    )
    or exists(
      select 1
      from public.job_collaborators jc
      where jc.job_id=j.id
        and jc.user_id=caller
        and jc.status='accepted'
    );

  if not allowed then
    raise insufficient_privilege using message='Explicit Job file access is required.';
  end if;

  return jsonb_build_object(
    'authorized',true,
    'project_id',j.project_id,
    'job_id',j.id,
    'user_id',caller
  );
end;
$$;

create or replace function public.authorize_datanest_ai_file_access(
  target_job uuid
) returns jsonb
language sql
stable
security definer
set search_path=public,private
as $$
  select private.authorize_datanest_ai_file_access(target_job);
$$;

revoke all on function private.authorize_datanest_ai_file_access(uuid) from public,anon,authenticated;
revoke all on function public.authorize_datanest_ai_file_access(uuid) from public,anon;
grant execute on function public.authorize_datanest_ai_file_access(uuid) to authenticated;
