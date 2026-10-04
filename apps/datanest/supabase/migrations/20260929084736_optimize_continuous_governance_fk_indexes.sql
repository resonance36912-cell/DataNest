begin;

-- Advisor-driven performance hardening for Continuous Governance Optimization v1.
-- Cover foreign-key lookup paths without changing governance semantics, authority,
-- RLS, grants, evidence state, or historical records.

create index if not exists governance_standards_created_by_idx
  on public.governance_standards_register(created_by);
create index if not exists governance_standards_reviewed_by_idx
  on public.governance_standards_register(reviewed_by);

create index if not exists governance_observations_recorded_by_idx
  on public.governance_observations(recorded_by);

create index if not exists governance_improvement_candidates_created_by_idx
  on public.governance_improvement_candidates(created_by);
create index if not exists governance_improvement_candidates_reviewed_by_idx
  on public.governance_improvement_candidates(reviewed_by);

create index if not exists governance_improvement_reviews_reviewed_by_idx
  on public.governance_improvement_reviews(reviewed_by);

create index if not exists governance_improvement_cycles_created_by_idx
  on public.governance_improvement_cycles(created_by);
create index if not exists governance_improvement_cycles_previous_cycle_idx
  on public.governance_improvement_cycles(previous_cycle_id);

commit;
