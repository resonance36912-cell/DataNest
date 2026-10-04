begin;

alter table public.ai_validation_runs
  drop constraint if exists ai_validation_runs_gate_check;

alter table public.ai_validation_runs
  add constraint ai_validation_runs_gate_check
  check (gate in ('AUDIT','VERIFY','VALIDATE','STRESS_TEST','LANGUAGE_REVIEW'));

commit;
