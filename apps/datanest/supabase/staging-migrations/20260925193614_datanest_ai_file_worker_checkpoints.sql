alter table public.ai_file_submission_items
  add column if not exists client_hash_matches boolean,
  add column if not exists extracted_chunks jsonb,
  add column if not exists extraction_warnings jsonb not null default '[]'::jsonb;

alter table public.ai_file_submission_items
  drop constraint if exists ai_file_submission_items_extracted_chunks_array_check;
alter table public.ai_file_submission_items
  add constraint ai_file_submission_items_extracted_chunks_array_check
  check (extracted_chunks is null or jsonb_typeof(extracted_chunks)='array');

alter table public.ai_file_submission_items
  drop constraint if exists ai_file_submission_items_extraction_warnings_array_check;
alter table public.ai_file_submission_items
  add constraint ai_file_submission_items_extraction_warnings_array_check
  check (jsonb_typeof(extraction_warnings)='array');
