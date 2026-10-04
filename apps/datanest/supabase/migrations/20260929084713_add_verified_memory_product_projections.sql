begin;

create table if not exists public.certified_memory_projection_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  projection_key text not null check (char_length(btrim(projection_key)) between 1 and 120),
  version bigint not null check (version>0),
  status text not null check (status in ('active','draft','superseded')),
  product_scope text not null check (char_length(btrim(product_scope)) between 1 and 120),
  include_unscoped boolean not null default true,
  allowed_categories text[] not null default '{}',
  excluded_categories text[] not null default '{}',
  min_confidence numeric not null default 0 check (min_confidence between 0 and 1),
  max_items integer not null default 24 check (max_items between 1 and 50),
  require_jurisdiction boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id,projection_key,version)
);

alter table public.certified_memory_projection_profiles enable row level security;
revoke all on table public.certified_memory_projection_profiles from public,anon,authenticated;
grant select on table public.certified_memory_projection_profiles to service_role;

create unique index if not exists certified_memory_projection_active_idx
  on public.certified_memory_projection_profiles(project_id,projection_key)
  where status='active';

create index if not exists certified_memory_projection_scope_idx
  on public.certified_memory_projection_profiles(project_id,product_scope,status);

insert into public.certified_memory_projection_profiles(
  project_id,projection_key,version,status,product_scope,include_unscoped,
  allowed_categories,excluded_categories,min_confidence,max_items,
  require_jurisdiction,metadata
)
select p.id,'datanest_ai',1,'active','datanest_ai',true,
  '{}'::text[],'{}'::text[],0,24,false,
  jsonb_build_object(
    'policy','project-wide governed baseline',
    'purpose','General DataNest AI retrieval'
  )
from public.projects p
on conflict(project_id,projection_key,version) do nothing;

insert into public.certified_memory_projection_profiles(
  project_id,projection_key,version,status,product_scope,include_unscoped,
  allowed_categories,excluded_categories,min_confidence,max_items,
  require_jurisdiction,metadata
)
select p.id,'development_command',1,'active','development_command',true,
  '{}'::text[],'{}'::text[],0.50,24,false,
  jsonb_build_object(
    'policy','certified baseline plus separate Development Command working memory',
    'purpose','Development reasoning'
  )
from public.projects p
on conflict(project_id,projection_key,version) do nothing;

insert into public.certified_memory_projection_profiles(
  project_id,projection_key,version,status,product_scope,include_unscoped,
  allowed_categories,excluded_categories,min_confidence,max_items,
  require_jurisdiction,metadata
)
select p.id,'legal_eagle',1,'active','legal_eagle',true,
  '{}'::text[],'{}'::text[],0.70,16,true,
  jsonb_build_object(
    'policy','matter-scoped legal information with governed Certified Memory baseline',
    'purpose','Legal Eagle retrieval',
    'automatic_project_learning',false
  )
from public.projects p
on conflict(project_id,projection_key,version) do nothing;

create or replace function private.seed_verified_memory_projection_profiles_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $fn$
begin
  insert into public.certified_memory_projection_profiles(
    project_id,projection_key,version,status,product_scope,include_unscoped,
    allowed_categories,excluded_categories,min_confidence,max_items,
    require_jurisdiction,metadata
  )
  values
    (
      new.id,'datanest_ai',1,'active','datanest_ai',true,
      '{}'::text[],'{}'::text[],0,24,false,
      jsonb_build_object(
        'policy','project-wide governed baseline',
        'purpose','General DataNest AI retrieval'
      )
    ),
    (
      new.id,'development_command',1,'active','development_command',true,
      '{}'::text[],'{}'::text[],0.50,24,false,
      jsonb_build_object(
        'policy','certified baseline plus separate Development Command working memory',
        'purpose','Development reasoning'
      )
    ),
    (
      new.id,'legal_eagle',1,'active','legal_eagle',true,
      '{}'::text[],'{}'::text[],0.70,16,true,
      jsonb_build_object(
        'policy','matter-scoped legal information with governed Certified Memory baseline',
        'purpose','Legal Eagle retrieval',
        'automatic_project_learning',false
      )
    )
  on conflict(project_id,projection_key,version) do nothing;

  return new;
end;
$fn$;

drop trigger if exists seed_verified_memory_projection_profiles on public.projects;
create trigger seed_verified_memory_projection_profiles
after insert on public.projects
for each row
execute function private.seed_verified_memory_projection_profiles_v1();

create or replace function private.upsert_certified_memory_projection_profile_v1(
  target_project uuid,
  target_projection_key text,
  target_product_scope text,
  target_include_unscoped boolean,
  target_allowed_categories text[],
  target_excluded_categories text[],
  target_min_confidence numeric,
  target_max_items integer,
  target_require_jurisdiction boolean,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $fn$
declare
  caller uuid:=auth.uid();
  caller_role text;
  expected_scope text;
  next_version bigint;
  new_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active'
  limit 1;

  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin memory-projection authority is required.';
  end if;

  expected_scope:=case btrim(target_projection_key)
    when 'datanest_ai' then 'datanest_ai'
    when 'development_command' then 'development_command'
    when 'legal_eagle' then 'legal_eagle'
    else null
  end;

  if expected_scope is null then
    raise exception 'Unsupported Verified Memory projection key.';
  end if;

  if btrim(coalesce(target_product_scope,''))<>expected_scope then
    raise exception 'Verified Memory projection key and product scope do not match.';
  end if;

  if target_min_confidence<0 or target_min_confidence>1 then
    raise exception 'Verified Memory projection confidence must be between 0 and 1.';
  end if;

  if target_max_items<1 or target_max_items>50 then
    raise exception 'Verified Memory projection max_items must be between 1 and 50.';
  end if;

  if exists(
    select 1
    from unnest(coalesce(target_allowed_categories,'{}'::text[])) as allowed(category)
    where allowed.category=any(coalesce(target_excluded_categories,'{}'::text[]))
  ) then
    raise exception 'Verified Memory projection cannot both allow and exclude the same category.';
  end if;

  select coalesce(max(p.version),0)+1 into next_version
  from public.certified_memory_projection_profiles p
  where p.project_id=target_project
    and p.projection_key=btrim(target_projection_key);

  update public.certified_memory_projection_profiles
  set status='superseded'
  where project_id=target_project
    and projection_key=btrim(target_projection_key)
    and status='active';

  insert into public.certified_memory_projection_profiles(
    project_id,projection_key,version,status,product_scope,include_unscoped,
    allowed_categories,excluded_categories,min_confidence,max_items,
    require_jurisdiction,metadata
  )
  values(
    target_project,btrim(target_projection_key),next_version,'active',
    btrim(target_product_scope),coalesce(target_include_unscoped,true),
    coalesce(target_allowed_categories,'{}'::text[]),
    coalesce(target_excluded_categories,'{}'::text[]),
    coalesce(target_min_confidence,0),
    coalesce(target_max_items,24),
    coalesce(target_require_jurisdiction,false),
    coalesce(target_metadata,'{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$fn$;

create or replace function public.upsert_certified_memory_projection_profile_v1(
  target_project uuid,
  target_projection_key text,
  target_product_scope text,
  target_include_unscoped boolean,
  target_allowed_categories text[],
  target_excluded_categories text[],
  target_min_confidence numeric,
  target_max_items integer,
  target_require_jurisdiction boolean,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language sql
security definer
set search_path=''
as $fn$
  select private.upsert_certified_memory_projection_profile_v1(
    target_project,target_projection_key,target_product_scope,target_include_unscoped,
    target_allowed_categories,target_excluded_categories,target_min_confidence,
    target_max_items,target_require_jurisdiction,target_metadata
  );
$fn$;

revoke execute on function private.upsert_certified_memory_projection_profile_v1(
  uuid,text,text,boolean,text[],text[],numeric,integer,boolean,jsonb
) from public,anon,authenticated;

revoke execute on function public.upsert_certified_memory_projection_profile_v1(
  uuid,text,text,boolean,text[],text[],numeric,integer,boolean,jsonb
) from public,anon;

grant execute on function public.upsert_certified_memory_projection_profile_v1(
  uuid,text,text,boolean,text[],text[],numeric,integer,boolean,jsonb
) to authenticated;

alter table public.certified_memory_usage_receipts
  add column if not exists projection_key text,
  add column if not exists projection_version bigint;

create or replace function private.get_ranked_certified_memory_context_v3(
  target_project uuid,
  target_job uuid,
  target_query text,
  target_purpose text default 'job_execution',
  target_product_scope text default null,
  target_projection_key text default null,
  target_jurisdiction text default null,
  target_visibility_class text default 'project_restricted',
  target_limit integer default 24
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  authorized boolean;
  payload jsonb;
  projection public.certified_memory_projection_profiles%rowtype;
begin
  authorized :=
    private.is_project_member(target_project)
    or (
      private.is_job_collaborator(target_job)
      and exists(
        select 1 from public.jobs j
        where j.id=target_job and j.project_id=target_project
      )
    );

  if not authorized then
    raise insufficient_privilege using message='Project or Job collaboration access is required.';
  end if;

  select p.* into projection
  from public.certified_memory_projection_profiles p
  where p.project_id=target_project
    and p.projection_key=coalesce(nullif(btrim(target_projection_key),''),'datanest_ai')
    and p.status='active'
  order by p.version desc
  limit 1;

  if not found then
    raise exception 'Active Verified Memory projection was not found.';
  end if;

  if target_product_scope is distinct from projection.product_scope then
    raise exception 'Verified Memory projection does not match requested product scope.';
  end if;

  if projection.require_jurisdiction
     and nullif(btrim(coalesce(target_jurisdiction,'')),'') is null then
    raise exception 'Verified Memory projection requires jurisdiction context.';
  end if;

  with query_terms as (
    select case
      when count(*)=0 then null::tsquery
      else to_tsquery('simple',string_agg(token,' | ' order by token))
    end as query_ts
    from (
      select distinct token
      from (
        select regexp_replace(raw_token,'[^a-z0-9_]+','','g') as token
        from regexp_split_to_table(lower(coalesce(target_query,'')), E'\\s+') raw(raw_token)
      ) cleaned
      where length(token)>=3
        and token not in (
          'the','and','for','with','that','this','from','into','your','you',
          'are','was','were','have','has','had','can','should','would','could'
        )
      order by token
      limit 24
    ) bounded
  ),
  active_memory as (
    select m.*
    from public.certified_memory m
    where m.project_id=target_project
      and m.active=true
      and (m.valid_from is null or m.valid_from<=now())
      and (m.valid_until is null or m.valid_until>now())
  ),
  projected as (
    select m.*
    from active_memory m
    where (
      cardinality(projection.allowed_categories)=0
      or m.category=any(projection.allowed_categories)
    )
    and not (m.category=any(projection.excluded_categories))
    and coalesce(m.confidence,0.75)>=projection.min_confidence
    and (
      projection.include_unscoped
      or m.applicability ? 'product_scopes'
    )
  ),
  applicable as (
    select m.*,
      (
        case when m.applicability ? 'product_scopes' then 0.125 else 0 end +
        case when m.applicability ? 'purposes' then 0.125 else 0 end +
        case when m.applicability ? 'jurisdictions' then 0.125 else 0 end +
        case when m.applicability ? 'visibility_classes' then 0.125 else 0 end
      ) + 0.5 as scope_score
    from projected m
    where (
      not (m.applicability ? 'product_scopes')
      or (
        jsonb_typeof(m.applicability->'product_scopes')='array'
        and exists(
          select 1
          from jsonb_array_elements_text(m.applicability->'product_scopes') scope(value)
          where lower(scope.value) in (lower(target_product_scope),'*')
        )
      )
    )
    and (
      not (m.applicability ? 'purposes')
      or (
        jsonb_typeof(m.applicability->'purposes')='array'
        and exists(
          select 1
          from jsonb_array_elements_text(m.applicability->'purposes') purpose(value)
          where lower(purpose.value) in (lower(coalesce(target_purpose,'job_execution')),'*')
        )
      )
    )
    and (
      not (m.applicability ? 'jurisdictions')
      or (
        jsonb_typeof(m.applicability->'jurisdictions')='array'
        and target_jurisdiction is not null
        and exists(
          select 1
          from jsonb_array_elements_text(m.applicability->'jurisdictions') jurisdiction(value)
          where lower(jurisdiction.value) in (lower(target_jurisdiction),'global','*')
        )
      )
    )
    and (
      not (m.applicability ? 'visibility_classes')
      or (
        jsonb_typeof(m.applicability->'visibility_classes')='array'
        and exists(
          select 1
          from jsonb_array_elements_text(m.applicability->'visibility_classes') visibility(value)
          where lower(visibility.value) in (lower(coalesce(target_visibility_class,'project_restricted')),'*')
        )
      )
    )
  ),
  scored as (
    select a.*,
      case
        when q.query_ts is null then 0.35
        else greatest(
          ts_rank_cd(
            to_tsvector('simple',coalesce(a.category,'') || ' ' || a.normalized_knowledge),
            q.query_ts,
            32
          ),
          case
            when lower(coalesce(a.category,''))=any(
              regexp_split_to_array(lower(coalesce(target_query,'')), E'\\s+')
            ) then 0.18
            else 0
          end
        )
      end as relevance_score,
      greatest(0,least(1,coalesce(a.confidence,0.75))) as trust_score,
      (
        1.0 /
        (
          1.0 +
          greatest(
            extract(epoch from (now()-coalesce(a.last_verified_at,a.promoted_at)))/86400.0,
            0
          ) / 365.0
        )
      ) as freshness_score,
      case
        when a.review_after is not null and a.review_after<=now() then 0.65
        else 1.0
      end as review_factor
    from applicable a
    cross join query_terms q
  ),
  ranked as (
    select s.*,
      (
        s.relevance_score*0.55 +
        s.trust_score*0.25 +
        least(1,s.scope_score)*0.15 +
        s.freshness_score*0.05
      ) * s.review_factor as memory_score
    from scored s
  ),
  selected as (
    select *
    from ranked
    order by memory_score desc,effective_version desc,promoted_at desc
    limit greatest(
      1,
      least(
        coalesce(target_limit,projection.max_items),
        projection.max_items,
        50
      )
    )
  )
  select jsonb_build_object(
    'authorized',true,
    'strategy','verified-memory-ranked-v3',
    'projection',jsonb_build_object(
      'key',projection.projection_key,
      'version',projection.version,
      'product_scope',projection.product_scope,
      'include_unscoped',projection.include_unscoped,
      'min_confidence',projection.min_confidence,
      'max_items',projection.max_items,
      'require_jurisdiction',projection.require_jurisdiction
    ),
    'summary',jsonb_build_object(
      'active_count',(select count(*) from active_memory),
      'projected_count',(select count(*) from projected),
      'applicable_count',(select count(*) from applicable),
      'selected_count',(select count(*) from selected),
      'review_due_count',(
        select count(*) from applicable
        where review_after is not null and review_after<=now()
      )
    ),
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',id,
          'normalized_knowledge',normalized_knowledge,
          'category',category,
          'effective_version',effective_version,
          'certification_id',certification_id,
          'source_job_ids',source_job_ids,
          'source_trace_ids',source_trace_ids,
          'certification_class',certification_class,
          'confidence',confidence,
          'policy_version',policy_version,
          'content_hash',content_hash,
          'supersedes_memory_id',supersedes_memory_id,
          'promoted_at',promoted_at,
          'applicability',applicability,
          'valid_from',valid_from,
          'valid_until',valid_until,
          'review_after',review_after,
          'last_verified_at',last_verified_at,
          'review_due',(review_after is not null and review_after<=now()),
          'memory_score',round(memory_score::numeric,6),
          'relevance_score',round(relevance_score::numeric,6),
          'trust_score',round(trust_score::numeric,6),
          'scope_score',round(least(1,scope_score)::numeric,6),
          'freshness_score',round(freshness_score::numeric,6),
          'review_factor',round(review_factor::numeric,6)
        )
        order by memory_score desc,effective_version desc,promoted_at desc
      )
      from selected
    ),'[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

create or replace function public.get_ranked_certified_memory_context_v3(
  target_project uuid,
  target_job uuid,
  target_query text,
  target_purpose text default 'job_execution',
  target_product_scope text default null,
  target_projection_key text default null,
  target_jurisdiction text default null,
  target_visibility_class text default 'project_restricted',
  target_limit integer default 24
) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select private.get_ranked_certified_memory_context_v3(
    target_project,target_job,target_query,target_purpose,target_product_scope,
    target_projection_key,target_jurisdiction,target_visibility_class,target_limit
  );
$$;

create or replace function private.record_certified_memory_usage_v2(
  target_project uuid,
  target_job uuid,
  target_ai_usage_request uuid,
  target_trace_id text,
  target_strategy text,
  target_projection_key text,
  target_projection_version bigint,
  target_purpose text,
  target_product_scope text,
  target_visibility_class text,
  target_query_hash text,
  target_active_count integer,
  target_applicable_count integer,
  target_selected_count integer,
  target_review_due_count integer,
  target_selected_memory_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  receipt_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if not exists(
    select 1
    from public.jobs j
    where j.id=target_job and j.project_id=target_project
  ) then
    raise exception 'Memory receipt Job does not belong to project.';
  end if;

  if not exists(
    select 1
    from public.certified_memory_projection_profiles p
    where p.project_id=target_project
      and p.projection_key=target_projection_key
      and p.version=target_projection_version
  ) then
    raise exception 'Memory receipt projection identity is invalid.';
  end if;

  if target_ai_usage_request is not null and not exists(
    select 1 from public.ai_usage_requests r
    where r.id=target_ai_usage_request
      and r.project_id=target_project
      and r.job_id=target_job
  ) then
    raise exception 'Memory receipt request does not belong to project and Job.';
  end if;

  if nullif(btrim(coalesce(target_trace_id,'')),'') is null
     or nullif(btrim(coalesce(target_strategy,'')),'') is null
     or nullif(btrim(coalesce(target_projection_key,'')),'') is null
     or nullif(btrim(coalesce(target_purpose,'')),'') is null
     or nullif(btrim(coalesce(target_visibility_class,'')),'') is null
     or coalesce(target_query_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Memory receipt identity, projection and query hash are required.';
  end if;

  if target_active_count<0
     or target_applicable_count<0
     or target_selected_count<0
     or target_review_due_count<0 then
    raise exception 'Memory receipt counts cannot be negative.';
  end if;

  if target_selected_count<>cardinality(coalesce(target_selected_memory_ids,'{}'::uuid[])) then
    raise exception 'Memory receipt selected count must match selected memory ids.';
  end if;

  if target_applicable_count>target_active_count
     or target_selected_count>target_applicable_count
     or target_review_due_count>target_applicable_count then
    raise exception 'Memory receipt counts are internally inconsistent.';
  end if;

  if exists(
    select 1
    from unnest(coalesce(target_selected_memory_ids,'{}'::uuid[])) selected_id
    where not exists(
      select 1
      from public.certified_memory m
      where m.id=selected_id
        and m.project_id=target_project
    )
  ) then
    raise exception 'Memory receipt contains memory outside the project.';
  end if;

  insert into public.certified_memory_usage_receipts(
    project_id,job_id,ai_usage_request_id,trace_id,strategy,projection_key,
    projection_version,purpose,product_scope,visibility_class,query_hash,
    active_count,applicable_count,selected_count,review_due_count,selected_memory_ids
  )
  values(
    target_project,target_job,target_ai_usage_request,btrim(target_trace_id),
    btrim(target_strategy),btrim(target_projection_key),target_projection_version,
    btrim(target_purpose),nullif(btrim(coalesce(target_product_scope,'')),''),
    btrim(target_visibility_class),target_query_hash,target_active_count,
    target_applicable_count,target_selected_count,target_review_due_count,
    coalesce(target_selected_memory_ids,'{}'::uuid[])
  )
  on conflict(project_id,trace_id) do nothing
  returning id into receipt_id;

  if receipt_id is null then
    select id into receipt_id
    from public.certified_memory_usage_receipts
    where project_id=target_project and trace_id=btrim(target_trace_id);
  end if;

  return receipt_id;
end;
$$;

create or replace function public.service_record_certified_memory_usage_v2(
  target_project uuid,
  target_job uuid,
  target_ai_usage_request uuid,
  target_trace_id text,
  target_strategy text,
  target_projection_key text,
  target_projection_version bigint,
  target_purpose text,
  target_product_scope text,
  target_visibility_class text,
  target_query_hash text,
  target_active_count integer,
  target_applicable_count integer,
  target_selected_count integer,
  target_review_due_count integer,
  target_selected_memory_ids uuid[]
) returns uuid
language sql
security definer
set search_path=''
as $$
  select private.record_certified_memory_usage_v2(
    target_project,target_job,target_ai_usage_request,target_trace_id,target_strategy,
    target_projection_key,target_projection_version,target_purpose,target_product_scope,
    target_visibility_class,target_query_hash,target_active_count,target_applicable_count,
    target_selected_count,target_review_due_count,target_selected_memory_ids
  );
$$;

revoke execute on function private.get_ranked_certified_memory_context_v3(
  uuid,uuid,text,text,text,text,text,text,integer
) from public,anon,authenticated;

revoke execute on function public.get_ranked_certified_memory_context_v3(
  uuid,uuid,text,text,text,text,text,text,integer
) from public,anon;

grant execute on function public.get_ranked_certified_memory_context_v3(
  uuid,uuid,text,text,text,text,text,text,integer
) to authenticated;

revoke execute on function private.record_certified_memory_usage_v2(
  uuid,uuid,uuid,text,text,text,bigint,text,text,text,text,integer,integer,integer,integer,uuid[]
) from public,anon,authenticated;

revoke execute on function public.service_record_certified_memory_usage_v2(
  uuid,uuid,uuid,text,text,text,bigint,text,text,text,text,integer,integer,integer,integer,uuid[]
) from public,anon,authenticated;

grant execute on function public.service_record_certified_memory_usage_v2(
  uuid,uuid,uuid,text,text,text,bigint,text,text,text,text,integer,integer,integer,integer,uuid[]
) to service_role;

commit;
