alter table public.ai_file_submissions
  add column if not exists certified_memory_snapshot jsonb not null default '[]'::jsonb;

alter table public.ai_file_submissions
  drop constraint if exists ai_file_submissions_certified_memory_snapshot_array_check;

alter table public.ai_file_submissions
  add constraint ai_file_submissions_certified_memory_snapshot_array_check
  check (jsonb_typeof(certified_memory_snapshot)='array');
