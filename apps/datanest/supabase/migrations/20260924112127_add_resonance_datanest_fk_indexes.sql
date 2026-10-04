
create index if not exists artifacts_project_id_idx on public.artifacts(project_id);
create index if not exists artifacts_job_id_idx on public.artifacts(job_id);
create index if not exists artifacts_run_id_idx on public.artifacts(run_id);
create index if not exists checkpoints_job_id_idx on public.checkpoints(job_id);
create index if not exists checkpoints_run_id_idx on public.checkpoints(run_id);
create index if not exists dependencies_depends_on_job_id_idx on public.dependencies(depends_on_job_id);
create index if not exists events_job_id_idx on public.events(job_id);
create index if not exists reservations_job_id_idx on public.reservations(job_id);
create index if not exists runs_reservation_id_idx on public.runs(reservation_id);
