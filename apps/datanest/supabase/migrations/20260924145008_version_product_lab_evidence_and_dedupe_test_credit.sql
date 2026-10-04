
alter table public.product_surfaces
  add column if not exists build_commit text,
  add column if not exists release_id text,
  add column if not exists build_label text;

alter table public.product_test_cases
  add column if not exists version integer not null default 1;

alter table public.product_test_runs
  add column if not exists request_id uuid,
  add column if not exists test_case_version integer,
  add column if not exists surface_url_snapshot text,
  add column if not exists environment_snapshot text,
  add column if not exists build_commit text,
  add column if not exists release_id text,
  add column if not exists browser_user_agent text,
  add column if not exists viewport jsonb not null default '{}'::jsonb;

create unique index if not exists product_test_runs_user_request_idx
  on public.product_test_runs(tester_user_id,request_id)
  where request_id is not null;

create index if not exists product_test_runs_build_idx
  on public.product_test_runs(project_id,build_commit,test_case_id,tester_user_id);

create or replace function private.bump_product_test_case_version()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.expected_result is distinct from old.expected_result
     or new.surface_id is distinct from old.surface_id then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bump_product_test_case_version on public.product_test_cases;
create trigger bump_product_test_case_version
before update on public.product_test_cases
for each row execute function private.bump_product_test_case_version();

create or replace function private.snapshot_product_test_run()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  tc public.product_test_cases%rowtype;
  ps public.product_surfaces%rowtype;
begin
  select * into tc from public.product_test_cases where id=new.test_case_id;
  if not found then raise exception 'Product test case not found.'; end if;

  if tc.project_id <> new.project_id then
    raise exception 'Test case project mismatch.';
  end if;

  new.test_case_version := tc.version;

  if new.surface_id is null then
    new.surface_id := tc.surface_id;
  end if;

  if new.surface_id is not null then
    select * into ps from public.product_surfaces where id=new.surface_id;
    if not found then raise exception 'Product surface not found.'; end if;
    if ps.project_id <> new.project_id then raise exception 'Product surface project mismatch.'; end if;

    new.surface_url_snapshot := ps.url;
    new.environment_snapshot := ps.environment;
    new.build_commit := ps.build_commit;
    new.release_id := ps.release_id;
  end if;

  return new;
end;
$$;

drop trigger if exists snapshot_product_test_run on public.product_test_runs;
create trigger snapshot_product_test_run
before insert on public.product_test_runs
for each row execute function private.snapshot_product_test_run();

create or replace function private.track_product_test_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  pts numeric;
  stable_ref text;
begin
  pts := private.contribution_weight(new.project_id,'test_run');

  stable_ref := concat_ws(
    ':',
    'product-test',
    new.test_case_id::text,
    'v'||coalesce(new.test_case_version,1)::text,
    coalesce(nullif(new.build_commit,''),'unversioned'),
    new.tester_user_id::text
  );

  perform private.insert_contribution(
    new.project_id,new.job_id,new.tester_user_id,'test_run',1,'test',
    pts,true,stable_ref,
    jsonb_build_object(
      'result',new.result,
      'test_run_id',new.id,
      'test_case_id',new.test_case_id,
      'test_case_version',new.test_case_version,
      'surface_id',new.surface_id,
      'build_commit',new.build_commit,
      'release_id',new.release_id,
      'environment',new.environment_snapshot,
      'dedupe_scope','tester+test_case_version+build_commit'
    ),
    null,null,'system_event'
  );

  return new;
end;
$$;

drop trigger if exists track_product_test_contribution on public.product_test_runs;
create trigger track_product_test_contribution
after insert on public.product_test_runs
for each row execute function private.track_product_test_contribution();

update public.product_test_runs r
set
  test_case_version=coalesce(
    r.test_case_version,
    (select tc.version from public.product_test_cases tc where tc.id=r.test_case_id)
  ),
  surface_url_snapshot=coalesce(
    r.surface_url_snapshot,
    (select ps.url from public.product_surfaces ps where ps.id=r.surface_id)
  ),
  environment_snapshot=coalesce(
    r.environment_snapshot,
    (select ps.environment from public.product_surfaces ps where ps.id=r.surface_id)
  ),
  build_commit=coalesce(
    r.build_commit,
    (select ps.build_commit from public.product_surfaces ps where ps.id=r.surface_id)
  ),
  release_id=coalesce(
    r.release_id,
    (select ps.release_id from public.product_surfaces ps where ps.id=r.surface_id)
  )
where
  r.test_case_version is null
  or r.surface_url_snapshot is null
  or r.environment_snapshot is null;
