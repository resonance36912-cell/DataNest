begin;

create or replace function public.delete_revoked_project_member_invite_v1(
  target_invite uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  invite_row public.project_member_invitations%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select *
  into invite_row
  from public.project_member_invitations
  where id=target_invite
  for update;

  if not found then
    raise exception 'Project-member invitation not found.';
  end if;
  if invite_row.status<>'revoked' then
    raise exception 'Only revoked project-member invitations may be deleted.';
  end if;

  select pm.role
  into caller_role
  from public.project_members pm
  where pm.project_id=invite_row.project_id
    and pm.user_id=caller
    and pm.status='active'
    and pm.role in ('owner','admin');

  if caller_role is null then
    raise insufficient_privilege using message='Owner or admin access is required to delete revoked project invitations.';
  end if;
  if invite_row.role='admin' and caller_role<>'owner' then
    raise insufficient_privilege using message='Only the project owner may delete a revoked admin invitation.';
  end if;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    invite_row.project_id,
    'PROJECT_MEMBER_REVOKED_INVITE_DELETED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'invite_id',invite_row.id,
      'user_id',invite_row.user_id,
      'email',invite_row.email,
      'role',invite_row.role,
      'status',invite_row.status,
      'invited_by',invite_row.invited_by,
      'invited_at',invite_row.invited_at,
      'expires_at',invite_row.expires_at,
      'revoked_by',invite_row.revoked_by,
      'revoked_at',invite_row.revoked_at,
      'deletion_reason','Removed from the Governance invitation history by a privileged project member.'
    )
  );

  delete from public.project_member_invitations
  where id=invite_row.id;

  return invite_row.id;
end;
$$;

revoke all on function public.delete_revoked_project_member_invite_v1(uuid) from public,anon,authenticated;
grant execute on function public.delete_revoked_project_member_invite_v1(uuid) to authenticated;

commit;
