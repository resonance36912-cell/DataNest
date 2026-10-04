\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.project_member_invitations') is null then
    raise exception 'project_member_invitations table is missing.';
  end if;
end $$;

do $$
declare
  rls_enabled boolean;
begin
  select c.relrowsecurity
  into rls_enabled
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='project_member_invitations';

  if not coalesce(rls_enabled,false) then
    raise exception 'RLS must be enabled on project_member_invitations.';
  end if;
end $$;

do $$
declare
  direct_write boolean;
begin
  select
    has_table_privilege('authenticated','public.project_member_invitations','INSERT')
    or has_table_privilege('authenticated','public.project_member_invitations','UPDATE')
    or has_table_privilege('authenticated','public.project_member_invitations','DELETE')
  into direct_write;

  if direct_write then
    raise exception 'Authenticated users must not write project invitations directly.';
  end if;
end $$;

do $$
declare
  gateway_count integer;
begin
  select count(*)
  into gateway_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.oid in (
      'public.service_resolve_project_invite_user_v1(text)'::regprocedure,
      'public.service_register_project_member_invite_v1(uuid,uuid,text,text,uuid)'::regprocedure,
      'public.accept_pending_project_member_invites_v1()'::regprocedure,
      'public.revoke_project_member_invite_v1(uuid,text)'::regprocedure,
      'public.get_project_membership_workspace_v1(uuid)'::regprocedure
    );

  if gateway_count<>5 then
    raise exception 'Project-member invitation RPC coverage incomplete: %/5',gateway_count;
  end if;
end $$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.service_resolve_project_invite_user_v1(text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users must not resolve arbitrary Auth users by email.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.service_register_project_member_invite_v1(uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users must not call the service registration gateway directly.';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.service_resolve_project_invite_user_v1(text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.service_register_project_member_invite_v1(uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Service-role project invitation gateways are not correctly granted.';
  end if;
end $$;

do $$
declare
  register_def text;
  accept_def text;
  revoke_def text;
  workspace_def text;
  member_def text;
begin
  select pg_get_functiondef(
    'public.service_register_project_member_invite_v1(uuid,uuid,text,text,uuid)'::regprocedure
  ) into register_def;

  if register_def not ilike '%cannot invite themselves%'
     or register_def not ilike '%target_role not in (''admin'',''operator'',''viewer'')%'
     or register_def not ilike '%Only the project owner may invite another admin%'
     or register_def not ilike '%already an active project member%'
     or register_def not ilike '%formal_voting_eligible_before_acceptance'',false%'
     or register_def not ilike '%''invited''%' then
    raise exception 'Project invitation registration safeguards are incomplete.';
  end if;

  select pg_get_functiondef(
    'private.accept_pending_project_member_invites_v1()'::regprocedure
  ) into accept_def;

  if accept_def not ilike '%caller_email%'
     or accept_def not ilike '%lower(email)=caller_email%'
     or accept_def not ilike '%expires_at>now()%'
     or accept_def not ilike '%status=''active''%'
     or accept_def not ilike '%formal_voting_eligible'',true%' then
    raise exception 'Project invitation acceptance must require the matching authenticated account and activate membership only after acceptance.';
  end if;

  select pg_get_functiondef(
    'public.revoke_project_member_invite_v1(uuid,text)'::regprocedure
  ) into revoke_def;

  if revoke_def not ilike '%Only pending project-member invitations may be revoked%'
     or revoke_def not ilike '%Only the project owner may revoke an admin invitation%'
     or revoke_def not ilike '%status=''disabled''%'
     or revoke_def not ilike '%formal_voting_eligible'',false%' then
    raise exception 'Project invitation revocation safeguards are incomplete.';
  end if;

  select pg_get_functiondef(
    'public.get_project_membership_workspace_v1(uuid)'::regprocedure
  ) into workspace_def;

  if workspace_def not ilike '%active_formal_voter_count%'
     or workspace_def not ilike '%''invited_member_can_vote'',false%'
     or workspace_def not ilike '%''active_member_can_vote'',true%'
     or workspace_def not ilike '%''self_invite_allowed'',false%'
     or workspace_def not ilike '%''owner_role_invitable'',false%'
     or workspace_def not ilike '%''admin_invite_requires_owner'',true%'
     or workspace_def not ilike '%''invite_acceptance_requires_matching_authenticated_account'',true%' then
    raise exception 'Project membership workspace boundaries are incomplete.';
  end if;

  select pg_get_functiondef(
    'private.is_project_member(uuid)'::regprocedure
  ) into member_def;

  if member_def not ilike '%pm.status = ''active''%' then
    raise exception 'Pending project members must not receive general project access.';
  end if;
end $$;

do $$
declare
  governance_vote_def text;
begin
  select pg_get_functiondef(
    'public.cast_governance_vote_v1(uuid,text,text)'::regprocedure
  ) into governance_vote_def;

  if governance_vote_def not ilike '%pm.status=''active''%'
     or governance_vote_def not ilike '%Formal voting requires active project membership%' then
    raise exception 'Formal governance voting must remain restricted to active project members.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1
    from supabase_migrations.schema_migrations
    where name='datanest_project_member_invitations_v1'
  ) then
    raise exception 'Project-member invitation migration is not registered.';
  end if;
end $$;
