\set ON_ERROR_STOP on

do $$
declare
  index_def text;
begin
  select indexdef into index_def
  from pg_indexes
  where schemaname='public'
    and tablename='product_test_runs'
    and indexname='product_test_runs_user_request_idx';

  if index_def is null
     or index_def not ilike '%unique%'
     or index_def not ilike '%tester_user_id%'
     or index_def not ilike '%request_id%'
     or index_def not ilike '%where (request_id is not null)%' then
    raise exception 'Product Lab request identity uniqueness contract is incomplete.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='product_test_runs'
      and policyname='product_test_runs_select'
      and cmd='SELECT'
      and qual ilike '%private.is_project_%'
  ) then
    raise exception 'Product Lab test-run reconciliation requires authenticated project-scoped read-back.';
  end if;

  if not exists(
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='product_test_runs'
      and policyname='product_test_runs_insert'
      and cmd='INSERT'
      and with_check ilike '%tester_user_id%'
      and with_check ilike '%auth.uid%'
  ) then
    raise exception 'Product Lab test-run writes must remain bound to the authenticated tester.';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1
    from supabase_migrations.schema_migrations
    where version='20260924145008'
      and name='version_product_lab_evidence_and_dedupe_test_credit'
  ) then
    raise exception 'Product Lab evidence-versioning migration history is missing.';
  end if;
end $$;
