begin;

create or replace function public.get_datanest_release_attestation_v1()
returns jsonb
language sql
security definer
set search_path = pg_catalog, supabase_migrations, public
as $$
  select jsonb_build_object(
    'schema_version','release-attestation-v1',
    'project','Resonance DataNest',
    'supabase_project','sgqdmfgjbprsoqsmgigi',
    'database_migration_head',
      (select version from supabase_migrations.schema_migrations order by version desc limit 1),
    'database_migration_name',
      (select name from supabase_migrations.schema_migrations order by version desc limit 1)
  );
$$;

revoke execute on function public.get_datanest_release_attestation_v1()
  from public, authenticated;

grant execute on function public.get_datanest_release_attestation_v1()
  to anon;

commit;
