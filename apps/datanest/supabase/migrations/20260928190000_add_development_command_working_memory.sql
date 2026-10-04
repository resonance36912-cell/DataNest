begin;

create table if not exists public.development_command_working_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  memory_kind text not null check (memory_kind in ('founder_baseline','development_command','assistant_synthesis')),
  normalized_knowledge text not null check (char_length(btrim(normalized_knowledge)) between 1 and 12000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  source_trace_id text,
  source_label text,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,memory_kind,content_hash)
);

create index if not exists development_command_working_memory_project_idx
  on public.development_command_working_memory(project_id,active,created_at desc);

alter table public.development_command_working_memory enable row level security;
revoke all on table public.development_command_working_memory from anon, authenticated;

create table if not exists public.development_command_turns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  client_request_id uuid not null,
  trace_id text not null,
  command_text text not null,
  angels_advocate text not null,
  devils_advocate text not null,
  synthesis text not null,
  provider_label text,
  model_label text,
  memory_item_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  unique(project_id,user_id,client_request_id),
  unique(trace_id)
);

create index if not exists development_command_turns_project_job_idx
  on public.development_command_turns(project_id,job_id,created_at desc);

alter table public.development_command_turns enable row level security;
revoke all on table public.development_command_turns from anon, authenticated;

insert into public.development_command_working_memory(
  project_id,job_id,user_id,memory_kind,normalized_knowledge,content_hash,
  source_label,metadata,active,created_at,updated_at
)
select
  cm.project_id,
  null,
  null,
  'founder_baseline',
  cm.normalized_knowledge,
  cm.content_hash,
  'certified_memory_baseline_mirror',
  jsonb_build_object(
    'source_certified_memory_id',cm.id,
    'source_category',cm.category,
    'source_certification_class',cm.certification_class,
    'source_effective_version',cm.effective_version,
    'working_memory_scope','development_command'
  ),
  true,
  cm.promoted_at,
  now()
from public.certified_memory cm
where cm.active=true
on conflict(project_id,memory_kind,content_hash)
do update set
  active=true,
  normalized_knowledge=excluded.normalized_knowledge,
  source_label=excluded.source_label,
  metadata=excluded.metadata,
  updated_at=now();

commit;
