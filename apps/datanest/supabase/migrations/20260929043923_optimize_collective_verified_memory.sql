begin;

alter table public.certified_memory
  add column if not exists applicability jsonb not null default '{}'::jsonb,
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists review_after timestamptz,
  add column if not exists last_verified_at timestamptz;

update public.certified_memory
set last_verified_at=coalesce(last_verified_at,promoted_at)
where last_verified_at is null;

alter table public.certified_memory
  drop constraint if exists certified_memory_validity_window_check;

alter table public.certified_memory
  add constraint certified_memory_validity_window_check
  check (valid_until is null or valid_from is null or valid_until > valid_from);

create index if not exists certified_memory_review_idx
  on public.certified_memory(project_id,active,review_after)
  where active=true;

create table if not exists public.certified_memory_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_memory_id uuid not null references public.certified_memory(id) on delete cascade,
  target_memory_id uuid not null references public.certified_memory(id) on delete cascade,
  relation_kind text not null check (
    relation_kind in ('supports','extends','duplicates','narrows','contradicts','supersedes')
  ),
  confidence numeric not null default 1 check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id,source_memory_id,target_memory_id,relation_kind),
  check(source_memory_id<>target_memory_id)
);

alter table public.certified_memory_relations enable row level security;
revoke all on table public.certified_memory_relations from public,anon,authenticated;
grant select on table public.certified_memory to service_role;
grant select,insert on table public.certified_memory_relations to service_role;

create index if not exists certified_memory_relations_source_idx
  on public.certified_memory_relations(project_id,source_memory_id,relation_kind);

create index if not exists certified_memory_relations_target_idx
  on public.certified_memory_relations(project_id,target_memory_id,relation_kind);

create or replace function private.get_ranked_certified_memory_context_v2(
  target_project uuid,
  target_job uuid,
  target_query text,
  target_purpose text default 'job_execution',
  target_product_scope text default null,
  target_jurisdiction text default null,
  target_visibility_class text default 'project_restricted',
  target_limit integer default 24
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  authorized boolean;
  payload jsonb;
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

  with active_memory as (
    select m.*
    from public.certified_memory m
    where m.project_id=target_project
      and m.active=true
      and (m.valid_from is null or m.valid_from<=now())
      and (m.valid_until is null or m.valid_until>now())
  ),
  applicable as (
    select m.*,
      (
        case when m.applicability ? 'product_scopes' then 0.125 else 0 end +
        case when m.applicability ? 'purposes' then 0.125 else 0 end +
        case when m.applicability ? 'jurisdictions' then 0.125 else 0 end +
        case when m.applicability ? 'visibility_classes' then 0.125 else 0 end
      ) + 0.5 as scope_score
    from active_memory m
    where (
      not (m.applicability ? 'product_scopes')
      or (
        jsonb_typeof(m.applicability->'product_scopes')='array'
        and target_product_scope is not null
        and exists(
          select 1 from jsonb_array_elements_text(m.applicability->'product_scopes') scope(value)
          where lower(scope.value) in (lower(target_product_scope),'*')
        )
      )
    )
    and (
      not (m.applicability ? 'purposes')
      or (
        jsonb_typeof(m.applicability->'purposes')='array'
        and exists(
          select 1 from jsonb_array_elements_text(m.applicability->'purposes') purpose(value)
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
          select 1 from jsonb_array_elements_text(m.applicability->'jurisdictions') jurisdiction(value)
          where lower(jurisdiction.value) in (lower(target_jurisdiction),'global','*')
        )
      )
    )
    and (
      not (m.applicability ? 'visibility_classes')
      or (
        jsonb_typeof(m.applicability->'visibility_classes')='array'
        and exists(
          select 1 from jsonb_array_elements_text(m.applicability->'visibility_classes') visibility(value)
          where lower(visibility.value) in (lower(coalesce(target_visibility_class,'project_restricted')),'*')
        )
      )
    )
  ),
  scored as (
    select a.*,
      case
        when nullif(btrim(coalesce(target_query,'')),'') is null then 0.5
        else ts_rank_cd(
          to_tsvector('simple',coalesce(a.category,'') || ' ' || a.normalized_knowledge),
          plainto_tsquery('simple',target_query),
          32
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
      ) as freshness_score
    from applicable a
  ),
  ranked as (
    select s.*,
      (
        s.relevance_score*0.55 +
        s.trust_score*0.25 +
        least(1,s.scope_score)*0.15 +
        s.freshness_score*0.05
      ) as memory_score
    from scored s
  ),
  selected as (
    select *
    from ranked
    order by memory_score desc,effective_version desc,promoted_at desc
    limit greatest(1,least(coalesce(target_limit,24),50))
  )
  select jsonb_build_object(
    'authorized',true,
    'strategy','verified-memory-ranked-v1',
    'summary',jsonb_build_object(
      'active_count',(select count(*) from active_memory),
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
          'freshness_score',round(freshness_score::numeric,6)
        )
        order by memory_score desc,effective_version desc,promoted_at desc
      )
      from selected
    ),'[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

create or replace function public.get_ranked_certified_memory_context_v2(
  target_project uuid,
  target_job uuid,
  target_query text,
  target_purpose text default 'job_execution',
  target_product_scope text default null,
  target_jurisdiction text default null,
  target_visibility_class text default 'project_restricted',
  target_limit integer default 24
) returns jsonb
language sql
stable
security definer
set search_path=public,private
as $$
  select private.get_ranked_certified_memory_context_v2(
    target_project,target_job,target_query,target_purpose,target_product_scope,
    target_jurisdiction,target_visibility_class,target_limit
  );
$$;

create or replace function private.promote_certified_memory_v2(
  target_project uuid,
  target_knowledge text,
  target_category text,
  target_certification_id uuid,
  target_source_job_ids uuid[],
  target_source_trace_ids text[],
  target_certification_class text,
  target_confidence numeric,
  target_policy_version text,
  target_content_hash text,
  target_applicability jsonb default '{}'::jsonb,
  target_valid_from timestamptz default null,
  target_valid_until timestamptz default null,
  target_review_after timestamptz default null,
  target_supersedes uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  next_version bigint;
  existing_id uuid;
  new_id uuid;
  invalid_key text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if nullif(btrim(target_knowledge),'') is null
     or nullif(btrim(target_content_hash),'') is null
     or target_certification_id is null then
    raise exception 'Certified knowledge, content hash and certification id are required.';
  end if;
  if jsonb_typeof(coalesce(target_applicability,'{}'::jsonb))<>'object' then
    raise exception 'Certified memory applicability must be a JSON object.';
  end if;

  select k into invalid_key
  from jsonb_object_keys(coalesce(target_applicability,'{}'::jsonb)) as keys(k)
  where k not in ('product_scopes','purposes','jurisdictions','visibility_classes')
  limit 1;
  if invalid_key is not null then
    raise exception 'Unsupported certified memory applicability key: %',invalid_key;
  end if;

  if (
    (target_applicability ? 'product_scopes' and jsonb_typeof(target_applicability->'product_scopes')<>'array')
    or (target_applicability ? 'purposes' and jsonb_typeof(target_applicability->'purposes')<>'array')
    or (target_applicability ? 'jurisdictions' and jsonb_typeof(target_applicability->'jurisdictions')<>'array')
    or (target_applicability ? 'visibility_classes' and jsonb_typeof(target_applicability->'visibility_classes')<>'array')
  ) then
    raise exception 'Certified memory applicability values must be arrays.';
  end if;

  if target_valid_from is not null and target_valid_until is not null
     and target_valid_until<=target_valid_from then
    raise exception 'Certified memory valid_until must be later than valid_from.';
  end if;

  select id into existing_id
  from public.certified_memory
  where project_id=target_project
    and content_hash=target_content_hash
    and active=true
  order by effective_version desc
  limit 1;
  if found then return existing_id; end if;

  select coalesce(max(effective_version),0)+1 into next_version
  from public.certified_memory
  where project_id=target_project;

  if target_supersedes is not null then
    update public.certified_memory
    set active=false
    where id=target_supersedes
      and project_id=target_project
      and active=true;
    if not found then
      raise exception 'Superseded memory is not active in this project.';
    end if;
  end if;

  insert into public.certified_memory(
    project_id,normalized_knowledge,category,effective_version,certification_id,
    source_job_ids,source_trace_ids,certification_class,confidence,policy_version,
    content_hash,supersedes_memory_id,applicability,valid_from,valid_until,
    review_after,last_verified_at
  )
  values(
    target_project,btrim(target_knowledge),target_category,next_version,target_certification_id,
    coalesce(target_source_job_ids,'{}'),coalesce(target_source_trace_ids,'{}'),
    target_certification_class,target_confidence,target_policy_version,target_content_hash,
    target_supersedes,coalesce(target_applicability,'{}'::jsonb),target_valid_from,
    target_valid_until,target_review_after,now()
  )
  returning id into new_id;

  if target_supersedes is not null then
    insert into public.certified_memory_relations(
      project_id,source_memory_id,target_memory_id,relation_kind,confidence,evidence
    )
    values(
      target_project,new_id,target_supersedes,'supersedes',1,
      jsonb_build_object(
        'source','certification_promotion',
        'certification_id',target_certification_id,
        'policy_version',target_policy_version
      )
    )
    on conflict(project_id,source_memory_id,target_memory_id,relation_kind)
    do nothing;
  end if;

  return new_id;
end;
$$;

create or replace function public.service_promote_certified_memory_v2(
  target_project uuid,
  target_knowledge text,
  target_category text,
  target_certification_id uuid,
  target_source_job_ids uuid[],
  target_source_trace_ids text[],
  target_certification_class text,
  target_confidence numeric,
  target_policy_version text,
  target_content_hash text,
  target_applicability jsonb default '{}'::jsonb,
  target_valid_from timestamptz default null,
  target_valid_until timestamptz default null,
  target_review_after timestamptz default null,
  target_supersedes uuid default null
) returns uuid
language sql
security definer
set search_path=public,private
as $$
  select private.promote_certified_memory_v2(
    target_project,target_knowledge,target_category,target_certification_id,
    target_source_job_ids,target_source_trace_ids,target_certification_class,
    target_confidence,target_policy_version,target_content_hash,target_applicability,
    target_valid_from,target_valid_until,target_review_after,target_supersedes
  );
$$;

revoke execute on function private.get_ranked_certified_memory_context_v2(
  uuid,uuid,text,text,text,text,text,integer
) from public,anon,authenticated;

revoke execute on function public.get_ranked_certified_memory_context_v2(
  uuid,uuid,text,text,text,text,text,integer
) from public,anon;

grant execute on function public.get_ranked_certified_memory_context_v2(
  uuid,uuid,text,text,text,text,text,integer
) to authenticated;

revoke execute on function private.promote_certified_memory_v2(
  uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,jsonb,timestamptz,timestamptz,timestamptz,uuid
) from public,anon,authenticated;

revoke execute on function public.service_promote_certified_memory_v2(
  uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,jsonb,timestamptz,timestamptz,timestamptz,uuid
) from public,anon,authenticated;

grant execute on function public.service_promote_certified_memory_v2(
  uuid,text,text,uuid,uuid[],text[],text,numeric,text,text,jsonb,timestamptz,timestamptz,timestamptz,uuid
) to service_role;

commit;
