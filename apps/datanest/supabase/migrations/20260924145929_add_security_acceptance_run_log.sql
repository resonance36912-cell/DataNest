
create table if not exists public.security_acceptance_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  release_label text not null,
  passed boolean not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.security_acceptance_runs enable row level security;

create policy security_acceptance_runs_select on public.security_acceptance_runs
for select to authenticated
using (private.has_project_role(project_id,array['owner','admin']));

grant select on public.security_acceptance_runs to authenticated;
grant select,insert,update,delete on public.security_acceptance_runs to service_role;

create index if not exists security_acceptance_runs_project_created_idx
  on public.security_acceptance_runs(project_id,created_at desc);
