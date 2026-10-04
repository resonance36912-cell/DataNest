begin;

create index if not exists contribution_evidence_submitted_by_idx
  on public.contribution_evidence(submitted_by);
create index if not exists contribution_evidence_verified_by_idx
  on public.contribution_evidence(verified_by)
  where verified_by is not null;
create index if not exists contribution_ledger_certified_by_idx
  on public.contribution_ledger(certified_by)
  where certified_by is not null;
create index if not exists contribution_reviews_reviewer_idx
  on public.contribution_reviews(reviewer_id);
create index if not exists contribution_scores_model_idx
  on public.contribution_scores(model_id);
create index if not exists contribution_scores_scorer_idx
  on public.contribution_scores(scorer_id);
create index if not exists contribution_scores_supersedes_idx
  on public.contribution_scores(supersedes_score_id)
  where supersedes_score_id is not null;
create index if not exists contribution_scoring_models_created_by_idx
  on public.contribution_scoring_models(created_by)
  where created_by is not null;
create index if not exists spark_accounts_project_idx
  on public.spark_accounts(project_id)
  where project_id is not null;
create index if not exists spark_ledger_contribution_idx
  on public.spark_ledger_entries(contribution_id)
  where contribution_id is not null;
create index if not exists spark_ledger_created_by_idx
  on public.spark_ledger_entries(created_by)
  where created_by is not null;

commit;
