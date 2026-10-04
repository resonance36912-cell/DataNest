create extension if not exists pgmq;

create table if not exists public.ai_file_submissions (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  session_id uuid not null references public.ai_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  instruction text,
  certified_memory_ids uuid[] not null default '{}',
  status text not null default 'UPLOADING'
    check (status in ('UPLOADING','QUEUED','PROCESSING','ANALYZING','RESPONDED','RESPONDED_WITH_WARNINGS','FAILED')),
  file_count integer not null check (file_count between 1 and 10),
  response_event_id uuid references public.ai_intake_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,client_request_id)
);

create table if not exists public.ai_file_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.ai_file_submissions(id) on delete cascade,
  trace_id text not null unique,
  original_name text not null check (length(btrim(original_name)) > 0),
  declared_mime text,
  detected_mime text,
  byte_size bigint not null check (byte_size >= 0 and byte_size <= 26214400),
  client_sha256 text check (client_sha256 is null or client_sha256 ~ '^[a-f0-9]{64}$'),
  verified_sha256 text check (verified_sha256 is null or verified_sha256 ~ '^[a-f0-9]{64}$'),
  storage_object_path text,
  artifact_id uuid references public.datanest_artifacts(id),
  status text not null default 'UPLOADING'
    check (status in ('UPLOADING','QUEUED','VALIDATING','EXTRACTING','OCR','CHUNKING','READY','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_error_message text,
  extraction_method text,
  extraction_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_file_submissions_job_created_idx
  on public.ai_file_submissions(job_id,created_at desc);
create index if not exists ai_file_submissions_session_created_idx
  on public.ai_file_submissions(session_id,created_at desc);
create index if not exists ai_file_submission_items_submission_idx
  on public.ai_file_submission_items(submission_id,created_at);
create index if not exists ai_file_submission_items_verified_sha_idx
  on public.ai_file_submission_items(verified_sha256)
  where verified_sha256 is not null;

alter table public.ai_file_submissions enable row level security;
alter table public.ai_file_submission_items enable row level security;
revoke all on public.ai_file_submissions from anon,authenticated;
revoke all on public.ai_file_submission_items from anon,authenticated;

alter table public.ai_intake_events
  drop constraint if exists ai_intake_events_source_type_check;
alter table public.ai_intake_events
  add constraint ai_intake_events_source_type_check
  check (source_type in ('human','ai_companion','datanest_ai','legacy_import','file_upload','document_evidence'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'datanest-ai-staging-files','datanest-ai-staging-files',false,26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','text/csv','application/csv','application/json','text/json'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name='datanest_file_ingestion') then
    perform pgmq.create('datanest_file_ingestion');
  end if;
  if not exists (select 1 from pgmq.list_queues() where queue_name='datanest_file_analysis') then
    perform pgmq.create('datanest_file_analysis');
  end if;
end $$;

revoke all on schema pgmq from anon,authenticated;
