begin;

create table if not exists public.rnd_devices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  device_key text not null check (length(btrim(device_key)) between 3 and 160),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  device_class text not null check (device_class in ('workstation','server','lab_node','mobile','other')),
  environment text not null check (environment in ('lab','staging','production')),
  status text not null default 'active' check (status in ('active','revoked','retired')),
  enrolled_by uuid not null references auth.users(id),
  enrolled_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, device_key)
);

create index if not exists rnd_devices_project_status_idx
  on public.rnd_devices(project_id,status,updated_at desc);

create table if not exists public.rnd_device_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  device_id uuid not null references public.rnd_devices(id) on delete cascade,
  report_type text not null check (length(btrim(report_type)) between 1 and 80),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null check (length(btrim(title)) between 1 and 200),
  summary text not null check (length(btrim(summary)) between 1 and 4000),
  evidence_reference text,
  observed_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rnd_device_reports_device_observed_idx
  on public.rnd_device_reports(device_id,observed_at desc);
create index if not exists rnd_device_reports_project_observed_idx
  on public.rnd_device_reports(project_id,observed_at desc);

create table if not exists public.rnd_device_grants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  device_id uuid not null references public.rnd_devices(id) on delete cascade,
  capabilities text[] not null check (
    cardinality(capabilities) > 0
    and capabilities <@ array[
      'inventory.read',
      'report.read',
      'report.submit',
      'named_task.request'
    ]::text[]
  ),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz not null,
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text,
  check (expires_at > issued_at),
  check (expires_at <= issued_at + interval '30 days')
);

create index if not exists rnd_device_grants_device_status_idx
  on public.rnd_device_grants(device_id,status,expires_at desc);
create index if not exists rnd_device_grants_project_status_idx
  on public.rnd_device_grants(project_id,status,expires_at desc);

create table if not exists public.rnd_device_audit_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  device_id uuid references public.rnd_devices(id) on delete set null,
  grant_id uuid references public.rnd_device_grants(id) on delete set null,
  event_type text not null check (length(btrim(event_type)) between 1 and 100),
  detail text not null check (length(btrim(detail)) between 1 and 2000),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rnd_device_audit_project_created_idx
  on public.rnd_device_audit_events(project_id,created_at desc);

alter table public.rnd_devices enable row level security;
alter table public.rnd_device_reports enable row level security;
alter table public.rnd_device_grants enable row level security;
alter table public.rnd_device_audit_events enable row level security;

drop policy if exists rnd_devices_admin_select on public.rnd_devices;
create policy rnd_devices_admin_select
on public.rnd_devices for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

drop policy if exists rnd_device_reports_admin_select on public.rnd_device_reports;
create policy rnd_device_reports_admin_select
on public.rnd_device_reports for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

drop policy if exists rnd_device_grants_admin_select on public.rnd_device_grants;
create policy rnd_device_grants_admin_select
on public.rnd_device_grants for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

drop policy if exists rnd_device_audit_admin_select on public.rnd_device_audit_events;
create policy rnd_device_audit_admin_select
on public.rnd_device_audit_events for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

revoke all on table public.rnd_devices from public,anon,authenticated;
revoke all on table public.rnd_device_reports from public,anon,authenticated;
revoke all on table public.rnd_device_grants from public,anon,authenticated;
revoke all on table public.rnd_device_audit_events from public,anon,authenticated;

grant select on table public.rnd_devices to authenticated;
grant select on table public.rnd_device_reports to authenticated;
grant select on table public.rnd_device_grants to authenticated;
grant select on table public.rnd_device_audit_events to authenticated;

grant select,insert,update,delete on table public.rnd_devices to service_role;
grant select,insert,update,delete on table public.rnd_device_reports to service_role;
grant select,insert,update,delete on table public.rnd_device_grants to service_role;
grant select,insert on table public.rnd_device_audit_events to service_role;

create or replace function private.assert_rnd_admin_v1(target_project uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  actor_role text;
begin
  select pm.role
  into actor_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=auth.uid()
    and pm.status='active'
    and pm.role in ('owner','admin');

  if actor_role is null then
    raise exception 'R&D device administration requires an active owner or admin role.'
      using errcode='42501';
  end if;

  return actor_role;
end;
$$;

revoke all on function private.assert_rnd_admin_v1(uuid) from public,anon,authenticated;

create or replace function private.write_rnd_device_audit_v1(
  target_project uuid,
  target_device uuid,
  target_grant uuid,
  target_event_type text,
  target_detail text
)
returns void
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
begin
  insert into public.rnd_device_audit_events(
    project_id,device_id,grant_id,event_type,detail,actor_user_id
  )
  values(
    target_project,target_device,target_grant,btrim(target_event_type),btrim(target_detail),auth.uid()
  );
end;
$$;

revoke all on function private.write_rnd_device_audit_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.get_rnd_device_admin_workspace_v1(target_project uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  actor_role text;
begin
  actor_role := private.assert_rnd_admin_v1(target_project);

  return jsonb_build_object(
    'role', actor_role,
    'can_manage', true,
    'mutation_policy', jsonb_build_object(
      'direct_remote_execution', false,
      'named_task_approval_required', true,
      'isolated_workspace_required', true,
      'allowed_grant_capabilities', jsonb_build_array(
        'inventory.read','report.read','report.submit','named_task.request'
      )
    ),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,
        'device_key',d.device_key,
        'display_name',d.display_name,
        'device_class',d.device_class,
        'environment',d.environment,
        'status',d.status,
        'enrolled_at',d.enrolled_at,
        'last_seen_at',d.last_seen_at,
        'revoked_at',d.revoked_at,
        'revocation_reason',d.revocation_reason,
        'updated_at',d.updated_at
      ) order by d.updated_at desc)
      from public.rnd_devices d
      where d.project_id=target_project
    ),'[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,
        'device_id',r.device_id,
        'report_type',r.report_type,
        'severity',r.severity,
        'title',r.title,
        'summary',r.summary,
        'evidence_reference',r.evidence_reference,
        'observed_at',r.observed_at,
        'created_at',r.created_at
      ) order by r.observed_at desc)
      from (
        select *
        from public.rnd_device_reports
        where project_id=target_project
        order by observed_at desc
        limit 100
      ) r
    ),'[]'::jsonb),
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,
        'device_id',g.device_id,
        'capabilities',g.capabilities,
        'reason',g.reason,
        'status',case when g.status='active' and g.expires_at<=now() then 'expired' else g.status end,
        'expires_at',g.expires_at,
        'issued_at',g.issued_at,
        'revoked_at',g.revoked_at,
        'revocation_reason',g.revocation_reason
      ) order by g.issued_at desc)
      from public.rnd_device_grants g
      where g.project_id=target_project
    ),'[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,
        'device_id',a.device_id,
        'grant_id',a.grant_id,
        'event_type',a.event_type,
        'detail',a.detail,
        'created_at',a.created_at
      ) order by a.created_at desc)
      from (
        select *
        from public.rnd_device_audit_events
        where project_id=target_project
        order by created_at desc
        limit 200
      ) a
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.enroll_rnd_device_v1(
  target_project uuid,
  target_device_key text,
  target_display_name text,
  target_device_class text,
  target_environment text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  device_id uuid;
begin
  perform private.assert_rnd_admin_v1(target_project);

  if length(btrim(coalesce(target_device_key,''))) not between 3 and 160 then
    raise exception 'Device key must be between 3 and 160 characters.';
  end if;
  if length(btrim(coalesce(target_display_name,''))) not between 1 and 160 then
    raise exception 'Display name is required.';
  end if;
  if target_device_class not in ('workstation','server','lab_node','mobile','other') then
    raise exception 'Unsupported device class.';
  end if;
  if target_environment not in ('lab','staging','production') then
    raise exception 'Unsupported device environment.';
  end if;

  insert into public.rnd_devices(
    project_id,device_key,display_name,device_class,environment,status,enrolled_by,enrolled_at,updated_at,
    revoked_by,revoked_at,revocation_reason
  )
  values(
    target_project,btrim(target_device_key),btrim(target_display_name),target_device_class,target_environment,
    'active',auth.uid(),now(),now(),null,null,null
  )
  on conflict(project_id,device_key) do update
  set display_name=excluded.display_name,
      device_class=excluded.device_class,
      environment=excluded.environment,
      status='active',
      enrolled_by=auth.uid(),
      enrolled_at=now(),
      updated_at=now(),
      revoked_by=null,
      revoked_at=null,
      revocation_reason=null
  returning id into device_id;

  perform private.write_rnd_device_audit_v1(
    target_project,device_id,null,'device_enrolled',
    'Device inventory enrollment recorded by an authorized administrator.'
  );

  return device_id;
end;
$$;

create or replace function public.record_rnd_device_report_v1(
  target_project uuid,
  target_device uuid,
  target_report_type text,
  target_severity text,
  target_title text,
  target_summary text,
  target_evidence_reference text default null,
  target_observed_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  report_id uuid;
begin
  perform private.assert_rnd_admin_v1(target_project);

  if not exists(
    select 1 from public.rnd_devices d
    where d.id=target_device and d.project_id=target_project
  ) then
    raise exception 'Device is not part of this project.';
  end if;
  if target_severity not in ('info','warning','critical') then
    raise exception 'Unsupported report severity.';
  end if;
  if length(btrim(coalesce(target_report_type,''))) not between 1 and 80 then
    raise exception 'Report type is required.';
  end if;
  if length(btrim(coalesce(target_title,''))) not between 1 and 200 then
    raise exception 'Report title is required.';
  end if;
  if length(btrim(coalesce(target_summary,''))) not between 1 and 4000 then
    raise exception 'Report summary is required.';
  end if;

  insert into public.rnd_device_reports(
    project_id,device_id,report_type,severity,title,summary,evidence_reference,observed_at,recorded_by
  )
  values(
    target_project,target_device,btrim(target_report_type),target_severity,btrim(target_title),
    btrim(target_summary),nullif(btrim(coalesce(target_evidence_reference,'')),''),target_observed_at,auth.uid()
  )
  returning id into report_id;

  perform private.write_rnd_device_audit_v1(
    target_project,target_device,null,'device_report_recorded',
    'A sanitized device report summary was recorded for administrative inspection.'
  );

  return report_id;
end;
$$;

create or replace function public.grant_rnd_device_capabilities_v1(
  target_project uuid,
  target_device uuid,
  target_capabilities text[],
  target_reason text,
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  grant_id uuid;
begin
  perform private.assert_rnd_admin_v1(target_project);

  if not exists(
    select 1 from public.rnd_devices d
    where d.id=target_device and d.project_id=target_project and d.status='active'
  ) then
    raise exception 'Only an active project device can receive a grant.';
  end if;
  if coalesce(cardinality(target_capabilities),0)=0
     or not target_capabilities <@ array[
       'inventory.read','report.read','report.submit','named_task.request'
     ]::text[] then
    raise exception 'Grant contains an unsupported capability.';
  end if;
  if length(btrim(coalesce(target_reason,''))) not between 1 and 1000 then
    raise exception 'Grant reason is required.';
  end if;
  if target_expires_at<=now() or target_expires_at>now()+interval '30 days' then
    raise exception 'Grant expiry must be within the next 30 days.';
  end if;

  insert into public.rnd_device_grants(
    project_id,device_id,capabilities,reason,status,expires_at,issued_by
  )
  values(
    target_project,target_device,target_capabilities,btrim(target_reason),'active',target_expires_at,auth.uid()
  )
  returning id into grant_id;

  perform private.write_rnd_device_audit_v1(
    target_project,target_device,grant_id,'device_grant_issued',
    'A bounded device capability grant was issued. Direct remote execution is not part of this grant.'
  );

  return grant_id;
end;
$$;

create or replace function public.revoke_rnd_device_grant_v1(
  target_project uuid,
  target_grant uuid,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  device_id uuid;
begin
  perform private.assert_rnd_admin_v1(target_project);

  if length(btrim(coalesce(target_reason,''))) not between 1 and 1000 then
    raise exception 'Revocation reason is required.';
  end if;

  update public.rnd_device_grants
  set status='revoked',
      revoked_by=auth.uid(),
      revoked_at=now(),
      revocation_reason=btrim(target_reason)
  where id=target_grant
    and project_id=target_project
    and status='active'
  returning device_id into device_id;

  if device_id is null then
    raise exception 'Active device grant was not found.';
  end if;

  perform private.write_rnd_device_audit_v1(
    target_project,device_id,target_grant,'device_grant_revoked',
    'Device capability grant revoked: '||btrim(target_reason)
  );
end;
$$;

create or replace function public.revoke_rnd_device_v1(
  target_project uuid,
  target_device uuid,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  revoked_count integer;
begin
  perform private.assert_rnd_admin_v1(target_project);

  if length(btrim(coalesce(target_reason,''))) not between 1 and 1000 then
    raise exception 'Revocation reason is required.';
  end if;

  update public.rnd_devices
  set status='revoked',
      revoked_by=auth.uid(),
      revoked_at=now(),
      revocation_reason=btrim(target_reason),
      updated_at=now()
  where id=target_device
    and project_id=target_project
    and status<>'revoked';

  if not found then
    raise exception 'Active or retired device was not found.';
  end if;

  update public.rnd_device_grants
  set status='revoked',
      revoked_by=auth.uid(),
      revoked_at=now(),
      revocation_reason='Device revoked: '||btrim(target_reason)
  where project_id=target_project
    and device_id=target_device
    and status='active';

  get diagnostics revoked_count = row_count;

  perform private.write_rnd_device_audit_v1(
    target_project,target_device,null,'device_revoked',
    'Device revoked with '||revoked_count||' active grant(s) closed: '||btrim(target_reason)
  );
end;
$$;

revoke all on function public.get_rnd_device_admin_workspace_v1(uuid) from public,anon;
revoke all on function public.enroll_rnd_device_v1(uuid,text,text,text,text) from public,anon;
revoke all on function public.record_rnd_device_report_v1(uuid,uuid,text,text,text,text,text,timestamptz) from public,anon;
revoke all on function public.grant_rnd_device_capabilities_v1(uuid,uuid,text[],text,timestamptz) from public,anon;
revoke all on function public.revoke_rnd_device_grant_v1(uuid,uuid,text) from public,anon;
revoke all on function public.revoke_rnd_device_v1(uuid,uuid,text) from public,anon;

grant execute on function public.get_rnd_device_admin_workspace_v1(uuid) to authenticated,service_role;
grant execute on function public.enroll_rnd_device_v1(uuid,text,text,text,text) to authenticated,service_role;
grant execute on function public.record_rnd_device_report_v1(uuid,uuid,text,text,text,text,text,timestamptz) to authenticated,service_role;
grant execute on function public.grant_rnd_device_capabilities_v1(uuid,uuid,text[],text,timestamptz) to authenticated,service_role;
grant execute on function public.revoke_rnd_device_grant_v1(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.revoke_rnd_device_v1(uuid,uuid,text) to authenticated,service_role;

commit;
