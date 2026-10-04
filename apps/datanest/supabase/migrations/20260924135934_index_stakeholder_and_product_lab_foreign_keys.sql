
create index if not exists ai_provider_connections_user_id_idx on public.ai_provider_connections(user_id);
create index if not exists contribution_ledger_job_id_idx on public.contribution_ledger(job_id);
create index if not exists contribution_ledger_user_id_idx on public.contribution_ledger(user_id);
create index if not exists product_surfaces_created_by_idx on public.product_surfaces(created_by);
create index if not exists product_surfaces_updated_by_idx on public.product_surfaces(updated_by);
create index if not exists product_test_cases_created_by_idx on public.product_test_cases(created_by);
create index if not exists product_test_cases_surface_id_idx on public.product_test_cases(surface_id);
create index if not exists product_test_runs_job_id_idx on public.product_test_runs(job_id);
create index if not exists product_test_runs_surface_id_idx on public.product_test_runs(surface_id);
create index if not exists product_test_runs_test_case_id_idx on public.product_test_runs(test_case_id);
create index if not exists product_test_runs_tester_user_id_idx on public.product_test_runs(tester_user_id);
create index if not exists stake_policies_updated_by_idx on public.stake_policies(updated_by);
