
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_context (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  context_key text not null,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(project_id, context_key)
);

create table if not exists public.tool_registry (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tool_key text not null,
  name text not null,
  role text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id, tool_key)
);

create table if not exists public.capabilities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  account_key text not null,
  connector_kind text not null,
  capability text not null,
  state text not null default 'UNKNOWN'
    check (state in ('AVAILABLE','BUSY','COOLDOWN','EXHAUSTED','UNKNOWN','OFFLINE','DISABLED')),
  observed_at timestamptz,
  next_check_at timestamptz,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  concurrency_limit integer not null default 1 check (concurrency_limit > 0),
  running integer not null default 0 check (running >= 0),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique(project_id, account_key, capability)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number bigint generated always as identity unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  priority integer not null default 50 check (priority between 0 and 100),
  status text not null default 'PLANNED'
    check (status in (
      'PLANNED','READY','QUEUED','MATCHING','RESERVED','RUNNING','VERIFYING','COMPLETED',
      'BLOCKED','BLOCKED_DEPENDENCY','PAUSED','RETRY_WAIT','FAILED','CANCELLED','MANUAL_ACTION'
    )),
  required_capabilities jsonb not null default '[]'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  acceptance jsonb not null default '{}'::jsonb,
  deadline timestamptz,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  step_key text not null,
  title text not null,
  step_type text not null default 'analysis',
  capability text not null default 'chat',
  status text not null default 'PLANNED',
  position integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  unique(job_id, step_key)
);

create table if not exists public.dependencies (
  job_id uuid not null references public.jobs(id) on delete cascade,
  depends_on_job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(job_id, depends_on_job_id),
  check (job_id <> depends_on_job_id)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED','EXPIRED','CANCELLED')),
  leased_until timestamptz not null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create unique index if not exists reservations_one_active_per_capability
  on public.reservations(capability_id)
  where status = 'ACTIVE';

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  run_number integer not null default 1,
  connector_kind text not null,
  status text not null default 'RUNNING',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error_category text,
  error_message text
);

create table if not exists public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  completed jsonb not null default '[]'::jsonb,
  remaining jsonb not null default '[]'::jsonb,
  resume_instruction text,
  created_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  run_id uuid references public.runs(id) on delete set null,
  name text not null,
  kind text not null default 'file',
  uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  event_type text not null,
  actor text not null default 'system',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduler_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  policy_key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique(project_id, policy_key)
);

create index if not exists jobs_project_status_priority_idx
  on public.jobs(project_id, status, priority desc, created_at asc);
create index if not exists events_project_created_idx
  on public.events(project_id, created_at desc);
create index if not exists runs_job_started_idx
  on public.runs(job_id, started_at desc);

alter table public.projects enable row level security;
alter table public.project_context enable row level security;
alter table public.tool_registry enable row level security;
alter table public.capabilities enable row level security;
alter table public.jobs enable row level security;
alter table public.job_steps enable row level security;
alter table public.dependencies enable row level security;
alter table public.reservations enable row level security;
alter table public.runs enable row level security;
alter table public.checkpoints enable row level security;
alter table public.artifacts enable row level security;
alter table public.events enable row level security;
alter table public.scheduler_policies enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','project_context','tool_registry','capabilities','jobs','job_steps',
    'dependencies','reservations','runs','checkpoints','artifacts','events','scheduler_policies'
  ]
  loop
    execute format('drop policy if exists authenticated_access on public.%I', t);
    execute format(
      'create policy authenticated_access on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

insert into public.projects (slug, name, description)
values (
  'resonance-datanest',
  'Resonance DataNest',
  'Project operating environment with UNIFI for orchestration and TranScheduler for capability-aware execution scheduling.'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = now();

insert into public.tool_registry (project_id, tool_key, name, role, config)
select id, 'unifi', 'UNIFI', 'Unified project orchestration, planning, manifests, context and checkpoints',
       '{"mode":"control-plane","planner":"enabled","manual_dispatch":true}'::jsonb
from public.projects where slug='resonance-datanest'
on conflict (project_id, tool_key) do update
set name=excluded.name, role=excluded.role, config=excluded.config, enabled=true;

insert into public.tool_registry (project_id, tool_key, name, role, config)
select id, 'transcheduler', 'TranScheduler', 'Temporal orchestration, capability matching, reservations, retry/backoff and fair-share queueing',
       '{"unknown_is_ineligible":true,"lease_minutes":20,"max_auto_retries":3}'::jsonb
from public.projects where slug='resonance-datanest'
on conflict (project_id, tool_key) do update
set name=excluded.name, role=excluded.role, config=excluded.config, enabled=true;

insert into public.scheduler_policies (project_id, policy_key, value)
select id, 'priority_bands',
       '{"critical":100,"high":80,"normal":50,"background":20,"maintenance":5}'::jsonb
from public.projects where slug='resonance-datanest'
on conflict (project_id, policy_key) do update set value=excluded.value, updated_at=now();

insert into public.scheduler_policies (project_id, policy_key, value)
select id, 'capability_rules',
       '{"unknown_is_permission":false,"reservation_lease_minutes":20,"prepare_while_waiting":true}'::jsonb
from public.projects where slug='resonance-datanest'
on conflict (project_id, policy_key) do update set value=excluded.value, updated_at=now();

insert into public.project_context (project_id, context_key, content)
select id, 'bootstrap',
       '{"source":"UNIFI Bootstrapper + TranScheduler","github":"DataNest-Supository/DataNest","supabase_ref":"sgqdmfgjbprsoqsmgigi","vercel_project":"Resonance DataNest"}'::jsonb
from public.projects where slug='resonance-datanest'
on conflict (project_id, context_key) do update set content=excluded.content, updated_at=now();
