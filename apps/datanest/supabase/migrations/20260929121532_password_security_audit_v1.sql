begin;

create table if not exists public.password_security_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'self_change',
    'self_email_reset',
    'admin_email_reset',
    'admin_set_temporary'
  )),
  actor_role text check (actor_role is null or actor_role in ('owner','admin','operator','viewer')),
  target_role text check (target_role is null or target_role in ('owner','admin','operator','viewer')),
  outcome text not null default 'succeeded' check (outcome='succeeded'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object')
    check (not (metadata ?| array['password','current_password','new_password','temporary_password'])),
  created_at timestamptz not null default now()
);

comment on table public.password_security_events is
  'Non-secret audit trail for successful password-management actions. Password material must never be stored here.';

create index if not exists password_security_events_project_created_idx
  on public.password_security_events(project_id,created_at desc);

create index if not exists password_security_events_actor_idx
  on public.password_security_events(actor_user_id,created_at desc)
  where actor_user_id is not null;

create index if not exists password_security_events_target_idx
  on public.password_security_events(target_user_id,created_at desc)
  where target_user_id is not null;

alter table public.password_security_events enable row level security;

drop policy if exists password_security_events_select on public.password_security_events;
create policy password_security_events_select
on public.password_security_events
for select
to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

revoke all on public.password_security_events from anon,authenticated;
grant select on public.password_security_events to authenticated;
grant select,insert on public.password_security_events to service_role;

commit;
