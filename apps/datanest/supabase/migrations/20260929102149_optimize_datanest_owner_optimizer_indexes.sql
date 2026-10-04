begin;
create index if not exists optimizer_runs_provider_request_idx
  on public.optimizer_runs(provider_request_id)
  where provider_request_id is not null;
create index if not exists optimizer_settings_updated_by_idx
  on public.optimizer_settings(updated_by)
  where updated_by is not null;
commit;