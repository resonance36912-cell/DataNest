alter table public.ai_file_submissions
  add column if not exists learning_policy_outcome text not null default 'review_required',
  add column if not exists learning_policy_reason_code text not null default 'policy_unresolved',
  add column if not exists learning_reuse_state text not null default 'runtime_only',
  add column if not exists learning_policy_version text not null default 'unresolved',
  add column if not exists learning_decision_record_id uuid;

alter table public.ai_file_submissions
  drop constraint if exists ai_file_submissions_learning_policy_outcome_check;
alter table public.ai_file_submissions
  add constraint ai_file_submissions_learning_policy_outcome_check
  check (learning_policy_outcome in ('allow','deny','review_required'));

alter table public.ai_file_submissions
  drop constraint if exists ai_file_submissions_learning_reuse_state_check;
alter table public.ai_file_submissions
  add constraint ai_file_submissions_learning_reuse_state_check
  check (learning_reuse_state in (
    'runtime_only','session_context','project_learning_eligible','project_certified_memory',
    'platform_learning_eligible','datanest_certified_knowledge','publicly_reusable'
  ));
