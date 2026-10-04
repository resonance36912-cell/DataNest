begin;

create table if not exists public.project_member_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','operator','viewer')),
  status text not null default 'invited' check (status in ('invited','accepted','revoked','expired')),
  invited_by uuid not null references auth.users(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > invited_at)
);

create unique index if not exists project_member_invites_one_pending_idx
  on public.project_member_invitations(project_id,user_id)
  where status='invited';
create index if not exists project_member_invites_project_idx
  on public.project_member_invitations(project_id,status,invited_at desc);
create index if not exists project_member_invites_user_idx
  on public.project_member_invitations(user_id,status,invited_at desc);
create index if not exists project_member_invites_invited_by_idx
  on public.project_member_invitations(invited_by,invited_at desc);
create index if not exists project_member_invites_revoked_by_idx
  on public.project_member_invitations(revoked_by)
  where revoked_by is not null;

create or replace function public.service_resolve_project_invite_user_v1(
  target_email text
) returns uuid
language sql
stable
security definer
set search_path=auth,public
as $$
  select id
  from auth.users
  where lower(email)=lower(btrim(target_email))
  order by created_at
  limit 1;
$$;

create or replace function public.service_register_project_member_invite_v1(
  target_project uuid,
  target_user uuid,
  target_email text,
  target_role text,
  invited_by_user uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  inviter_role text;
  normalized_email text := lower(btrim(coalesce(target_email,'')));
  target_auth_email text;
  current_member public.project_members%rowtype;
  invite_row public.project_member_invitations%rowtype;
begin
  if target_project is null or target_user is null or invited_by_user is null then
    raise exception 'Project, invited user and inviter are required.';
  end if;
  if target_user=invited_by_user then
    raise exception 'A stakeholder cannot invite themselves as an independent project member.';
  end if;
  if target_role not in ('admin','operator','viewer') then
    raise exception 'Project-member role must be admin, operator or viewer.';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid project-member email is required.';
  end if;

  select pm.role
  into inviter_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=invited_by_user
    and pm.status='active'
    and pm.role in ('owner','admin');

  if inviter_role is null then
    raise insufficient_privilege using message='Owner or admin access is required to invite project members.';
  end if;
  if inviter_role='admin' and target_role='admin' then
    raise insufficient_privilege using message='Only the project owner may invite another admin.';
  end if;

  select lower(email)
  into target_auth_email
  from auth.users
  where id=target_user;

  if target_auth_email is null or target_auth_email<>normalized_email then
    raise exception 'Invited Auth user does not match the requested email.';
  end if;

  select *
  into current_member
  from public.project_members
  where project_id=target_project and user_id=target_user;

  if found and current_member.status='active' then
    raise exception 'This user is already an active project member.';
  end if;
  if found and current_member.status='disabled' and inviter_role<>'owner' then
    raise insufficient_privilege using message='Only the project owner may re-invite a disabled member.';
  end if;

  update public.project_member_invitations
  set status='revoked',
      revoked_by=invited_by_user,
      revoked_at=now(),
      updated_at=now(),
      metadata=metadata||jsonb_build_object('replaced_by_new_invite',true)
  where project_id=target_project
    and user_id=target_user
    and status='invited';

  insert into public.project_member_invitations(
    project_id,user_id,email,role,status,invited_by,invited_at,expires_at,metadata
  )
  values(
    target_project,target_user,normalized_email,target_role,'invited',invited_by_user,now(),
    now()+interval '7 days',
    jsonb_build_object(
      'invite_source','DataNest Project Governance',
      'formal_voting_eligible_before_acceptance',false
    )
  )
  returning * into invite_row;

  insert into public.project_members(project_id,user_id,role,status,created_at,updated_at)
  values(target_project,target_user,target_role,'invited',now(),now())
  on conflict(project_id,user_id) do update
  set role=excluded.role,
      status='invited',
      updated_at=now();

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,
    'PROJECT_MEMBER_INVITE_SENT',
    invited_by_user::text,
    jsonb_build_object(
      'invite_id',invite_row.id,
      'user_id',target_user,
      'email',normalized_email,
      'role',target_role,
      'expires_at',invite_row.expires_at,
      'formal_voting_eligible',false
    )
  );

  return jsonb_build_object(
    'id',invite_row.id,
    'project_id',target_project,
    'user_id',target_user,
    'email',normalized_email,
    'role',target_role,
    'status','invited',
    'expires_at',invite_row.expires_at
  );
end;
$$;

create or replace function private.accept_pending_project_member_invites_v1()
returns integer
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt()->>'email',''));
  invite_row public.project_member_invitations%rowtype;
  accepted_count integer := 0;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if caller_email='' then
    raise insufficient_privilege using message='Authenticated email is required to accept project invitations.';
  end if;

  update public.project_member_invitations
  set status='expired',updated_at=now()
  where user_id=caller
    and status='invited'
    and expires_at<=now();

  for invite_row in
    select *
    from public.project_member_invitations
    where user_id=caller
      and status='invited'
      and expires_at>now()
      and lower(email)=caller_email
    order by invited_at
    for update
  loop
    update public.project_members
    set role=invite_row.role,
        status='active',
        updated_at=now()
    where project_id=invite_row.project_id
      and user_id=caller
      and status='invited';

    if not found then
      insert into public.project_members(project_id,user_id,role,status,created_at,updated_at)
      values(invite_row.project_id,caller,invite_row.role,'active',now(),now())
      on conflict(project_id,user_id) do update
      set role=excluded.role,
          status='active',
          updated_at=now();
    end if;

    update public.project_member_invitations
    set status='accepted',
        accepted_at=now(),
        updated_at=now()
    where id=invite_row.id;

    insert into public.events(project_id,event_type,actor,payload)
    values(
      invite_row.project_id,
      'PROJECT_MEMBER_INVITE_ACCEPTED',
      coalesce(auth.jwt()->>'email',caller::text),
      jsonb_build_object(
        'invite_id',invite_row.id,
        'user_id',caller,
        'role',invite_row.role,
        'formal_voting_eligible',true
      )
    );

    accepted_count := accepted_count+1;
  end loop;

  return accepted_count;
end;
$$;

create or replace function public.accept_pending_project_member_invites_v1()
returns integer
language sql
security definer
set search_path=public,private
as $$
  select private.accept_pending_project_member_invites_v1();
$$;

create or replace function public.revoke_project_member_invite_v1(
  target_invite uuid,
  target_reason text default null
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

  if not found then raise exception 'Project-member invitation not found.'; end if;
  if invite_row.status<>'invited' then
    raise exception 'Only pending project-member invitations may be revoked.';
  end if;

  select pm.role
  into caller_role
  from public.project_members pm
  where pm.project_id=invite_row.project_id
    and pm.user_id=caller
    and pm.status='active'
    and pm.role in ('owner','admin');

  if caller_role is null then
    raise insufficient_privilege using message='Owner or admin access is required to revoke project invitations.';
  end if;
  if invite_row.role='admin' and caller_role<>'owner' then
    raise insufficient_privilege using message='Only the project owner may revoke an admin invitation.';
  end if;

  update public.project_member_invitations
  set status='revoked',
      revoked_by=caller,
      revoked_at=now(),
      updated_at=now(),
      metadata=metadata||jsonb_build_object('revocation_reason',nullif(btrim(coalesce(target_reason,'')),''))
  where id=invite_row.id;

  update public.project_members
  set status='disabled',updated_at=now()
  where project_id=invite_row.project_id
    and user_id=invite_row.user_id
    and status='invited';

  insert into public.events(project_id,event_type,actor,payload)
  values(
    invite_row.project_id,
    'PROJECT_MEMBER_INVITE_REVOKED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'invite_id',invite_row.id,
      'user_id',invite_row.user_id,
      'role',invite_row.role,
      'formal_voting_eligible',false
    )
  );

  return invite_row.id;
end;
$$;

create or replace function public.get_project_membership_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  members jsonb;
  invites jsonb;
  active_voter_count integer;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select pm.role
  into caller_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',pm.user_id,
    'email',u.email,
    'role',pm.role,
    'status',pm.status,
    'created_at',pm.created_at,
    'updated_at',pm.updated_at,
    'formal_voting_eligible',(pm.status='active' and pm.role in ('owner','admin','operator','viewer'))
  ) order by case pm.role when 'owner' then 0 when 'admin' then 1 when 'operator' then 2 else 3 end,u.email),'[]'::jsonb)
  into members
  from public.project_members pm
  join auth.users u on u.id=pm.user_id
  where pm.project_id=target_project;

  if caller_role in ('owner','admin') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,
      'user_id',i.user_id,
      'email',i.email,
      'role',i.role,
      'status',case when i.status='invited' and i.expires_at<=now() then 'expired' else i.status end,
      'invited_by',i.invited_by,
      'invited_at',i.invited_at,
      'expires_at',i.expires_at,
      'accepted_at',i.accepted_at,
      'revoked_at',i.revoked_at
    ) order by i.invited_at desc),'[]'::jsonb)
    into invites
    from public.project_member_invitations i
    where i.project_id=target_project;
  else
    invites := '[]'::jsonb;
  end if;

  select count(*)::integer
  into active_voter_count
  from public.project_members pm
  where pm.project_id=target_project
    and pm.status='active'
    and pm.role in ('owner','admin','operator','viewer');

  return jsonb_build_object(
    'members',coalesce(members,'[]'::jsonb),
    'invitations',coalesce(invites,'[]'::jsonb),
    'active_formal_voter_count',active_voter_count,
    'can_invite',caller_role in ('owner','admin'),
    'can_invite_admin',caller_role='owner',
    'caller_role',caller_role,
    'boundaries',jsonb_build_object(
      'invited_member_can_vote',false,
      'active_member_can_vote',true,
      'self_invite_allowed',false,
      'owner_role_invitable',false,
      'admin_invite_requires_owner',true,
      'invite_acceptance_requires_matching_authenticated_account',true
    )
  );
end;
$$;

alter table public.project_member_invitations enable row level security;

drop policy if exists project_member_invitations_select on public.project_member_invitations;
create policy project_member_invitations_select
on public.project_member_invitations for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

revoke all on public.project_member_invitations from anon,authenticated;
grant select on public.project_member_invitations to authenticated;

revoke all on function public.service_resolve_project_invite_user_v1(text) from public,anon,authenticated;
revoke all on function public.service_register_project_member_invite_v1(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.service_resolve_project_invite_user_v1(text) to service_role;
grant execute on function public.service_register_project_member_invite_v1(uuid,uuid,text,text,uuid) to service_role;

revoke all on function private.accept_pending_project_member_invites_v1() from public,anon,authenticated;
revoke all on function public.accept_pending_project_member_invites_v1() from public,anon;
revoke all on function public.revoke_project_member_invite_v1(uuid,text) from public,anon;
revoke all on function public.get_project_membership_workspace_v1(uuid) from public,anon;

grant execute on function public.accept_pending_project_member_invites_v1() to authenticated;
grant execute on function public.revoke_project_member_invite_v1(uuid,text) to authenticated;
grant execute on function public.get_project_membership_workspace_v1(uuid) to authenticated;

commit;
