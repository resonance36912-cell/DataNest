-- Owner-only development and integration analytics for the DataNest Control Center.
-- The public RPC is an invoker wrapper; the private function performs the owner
-- authorization check before reading project, schema, and development telemetry.

create or replace function private.get_owner_development_analytics_v1(target_project uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_catalog, auth
as $$
  select case
    when not private.has_project_role(target_project, array['owner']::text[]) then
      jsonb_build_object('authorized', false)
    else
      jsonb_build_object(
        'authorized', true,
        'generated_at', now(),
        'database',
        jsonb_build_object(
          'database_version', current_setting('server_version'),
          'public_table_count', (
            select count(*)
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
          ),
          'public_view_count', (
            select count(*)
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'v'
          ),
          'function_count', (
            select count(*)
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public','private')
          ),
          'migration_count', (
            select count(*) from supabase_migrations.schema_migrations
          ),
          'auth_user_count', (
            select count(*) from auth.users
          ),
          'active_member_count', (
            select count(*) from public.project_members
            where project_id = target_project and status = 'active'
          )
        ),
        'project',
        jsonb_build_object(
          'total_jobs', (select count(*) from public.jobs where project_id = target_project),
          'active_jobs', (select count(*) from public.jobs where project_id = target_project and status not in ('COMPLETED','FAILED','CANCELLED')),
          'running_jobs', (select count(*) from public.jobs where project_id = target_project and status = 'RUNNING'),
          'blocked_jobs', (select count(*) from public.jobs where project_id = target_project and status in ('BLOCKED','BLOCKED_DEPENDENCY','MANUAL_ACTION')),
          'completed_jobs', (select count(*) from public.jobs where project_id = target_project and status = 'COMPLETED'),
          'run_count', (
            select count(*)
            from public.runs r
            join public.jobs j on j.id = r.job_id
            where j.project_id = target_project
          ),
          'audit_event_count', (select count(*) from public.events where project_id = target_project),
          'development_update_count', (select count(*) from public.ai_development_updates where project_id = target_project),
          'optimizer_run_count', (select count(*) from public.optimizer_runs where project_id = target_project),
          'optimizer_suggestion_count', (select count(*) from public.optimizer_suggestions where project_id = target_project),
          'control_event_count', (select count(*) from public.governance_control_runtime_events where project_id = target_project),
          'control_run_count', (select count(*) from public.governance_control_monitor_runs where project_id = target_project)
        ),
        'trend',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'day', to_char(d.day::date, 'YYYY-MM-DD'),
              'events', d.events,
              'runs', d.runs,
              'development_updates', d.development_updates
            )
            order by d.day
          )
          from (
            select
              gs::date as day,
              (
                select count(*)
                from public.events e
                where e.project_id = target_project
                  and e.created_at >= gs
                  and e.created_at < gs + interval '1 day'
              ) as events,
              (
                select count(*)
                from public.runs r
                join public.jobs j on j.id = r.job_id
                where j.project_id = target_project
                  and r.started_at >= gs
                  and r.started_at < gs + interval '1 day'
              ) as runs,
              (
                select count(*)
                from public.ai_development_updates u
                where u.project_id = target_project
                  and u.created_at >= gs
                  and u.created_at < gs + interval '1 day'
              ) as development_updates
            from generate_series(
              current_date - interval '29 days',
              current_date,
              interval '1 day'
            ) gs
          ) d
        ), '[]'::jsonb)
      )
  end;
$$;

create or replace function public.get_owner_development_analytics_v1(target_project uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select private.get_owner_development_analytics_v1(target_project);
$$;

revoke all on function private.get_owner_development_analytics_v1(uuid) from public;
grant execute on function private.get_owner_development_analytics_v1(uuid) to authenticated;

revoke all on function public.get_owner_development_analytics_v1(uuid) from public;
revoke all on function public.get_owner_development_analytics_v1(uuid) from anon;
grant execute on function public.get_owner_development_analytics_v1(uuid) to authenticated;
