begin;

create or replace function private.certified_memory_review_interval_v1(target_category text)
returns interval
language sql
immutable
set search_path=''
as $$
  select case
    when lower(coalesce(target_category,'')) ~ '(security|authorization|authority|privacy|legal|destructive)'
      then interval '30 days'
    when lower(coalesce(target_category,'')) ~ '(governance|policy)'
      then interval '60 days'
    when lower(coalesce(target_category,'')) ~ '(architecture|infrastructure|schema|migration)'
      then interval '90 days'
    when lower(coalesce(target_category,'')) ~ '(workflow|product|ecosystem)'
      then interval '180 days'
    else interval '120 days'
  end;
$$;

create or replace function private.schedule_certified_memory_review_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.last_verified_at is null then
    new.last_verified_at:=now();
  end if;
  if new.review_after is null then
    new.review_after:=new.last_verified_at
      + private.certified_memory_review_interval_v1(new.category);
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_certified_memory_review_v1 on public.certified_memory;
create trigger schedule_certified_memory_review_v1
before insert on public.certified_memory
for each row execute function private.schedule_certified_memory_review_v1();

revoke execute on function private.certified_memory_review_interval_v1(text)
from public,anon,authenticated;

revoke execute on function private.schedule_certified_memory_review_v1()
from public,anon,authenticated;

update public.certified_memory
set review_after=coalesce(last_verified_at,promoted_at)
  + private.certified_memory_review_interval_v1(category)
where active=true
  and review_after is null;

create table if not exists public.certified_memory_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  memory_id uuid not null references public.certified_memory(id) on delete cascade,
  decision text not null check (decision in ('reaffirmed','review_required','retired')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  prior_review_after timestamptz,
  next_review_after timestamptz,
  prior_last_verified_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewer_role text not null check (reviewer_role in ('owner','admin')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.certified_memory_reviews enable row level security;
revoke all on table public.certified_memory_reviews from public,anon,authenticated;
grant select,insert on table public.certified_memory_reviews to service_role;

create index if not exists certified_memory_reviews_project_created_idx
  on public.certified_memory_reviews(project_id,created_at desc);

create index if not exists certified_memory_reviews_memory_created_idx
  on public.certified_memory_reviews(memory_id,created_at desc);

create index if not exists certified_memory_reviews_reviewer_idx
  on public.certified_memory_reviews(reviewed_by)
  where reviewed_by is not null;

create or replace function private.review_certified_memory_v1(
  target_project uuid,
  target_memory uuid,
  target_actor uuid,
  target_decision text,
  target_reason text,
  target_next_review_after timestamptz default null,
  target_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  memory_row public.certified_memory%rowtype;
  actor_role text;
  effective_next_review timestamptz;
  review_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  select pm.role into actor_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=target_actor
    and pm.status='active'
  limit 1;

  if actor_role is null or actor_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin review authority is required.';
  end if;

  if target_decision not in ('reaffirmed','review_required','retired') then
    raise exception 'Unsupported Certified Memory review decision.';
  end if;

  if target_decision='retired' and actor_role<>'owner' then
    raise insufficient_privilege using message='Owner authority is required to retire Certified Memory.';
  end if;

  if nullif(btrim(coalesce(target_reason,'')),'') is null then
    raise exception 'Certified Memory review reason is required.';
  end if;

  select * into memory_row
  from public.certified_memory m
  where m.id=target_memory
    and m.project_id=target_project
  for update;

  if not found then
    raise exception 'Certified Memory item not found.';
  end if;

  if not memory_row.active and target_decision<>'retired' then
    raise exception 'Only active Certified Memory can be reaffirmed or marked for review.';
  end if;

  effective_next_review:=case
    when target_decision='reaffirmed' then coalesce(
      target_next_review_after,
      now()+private.certified_memory_review_interval_v1(memory_row.category)
    )
    when target_decision='review_required' then least(coalesce(target_next_review_after,now()),now())
    else null
  end;

  if target_decision='reaffirmed' then
    if effective_next_review<=now() then
      raise exception 'A reaffirmed memory must have a future next review date.';
    end if;
    update public.certified_memory
    set last_verified_at=now(),
        review_after=effective_next_review
    where id=memory_row.id;
  elsif target_decision='review_required' then
    update public.certified_memory
    set review_after=effective_next_review
    where id=memory_row.id;
  else
    update public.certified_memory
    set active=false,
        review_after=null
    where id=memory_row.id;
  end if;

  insert into public.certified_memory_reviews(
    project_id,memory_id,decision,reason,prior_review_after,next_review_after,
    prior_last_verified_at,reviewed_by,reviewer_role,evidence
  )
  values(
    target_project,memory_row.id,target_decision,btrim(target_reason),
    memory_row.review_after,effective_next_review,memory_row.last_verified_at,
    target_actor,actor_role,coalesce(target_evidence,'{}'::jsonb)
  )
  returning id into review_id;

  return jsonb_build_object(
    'review_id',review_id,
    'memory_id',memory_row.id,
    'decision',target_decision,
    'reviewer_role',actor_role,
    'next_review_after',effective_next_review,
    'active',target_decision<>'retired'
  );
end;
$$;

create or replace function public.service_review_certified_memory_v1(
  target_project uuid,
  target_memory uuid,
  target_actor uuid,
  target_decision text,
  target_reason text,
  target_next_review_after timestamptz default null,
  target_evidence jsonb default '{}'::jsonb
) returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.review_certified_memory_v1(
    target_project,target_memory,target_actor,target_decision,target_reason,
    target_next_review_after,target_evidence
  );
$$;

revoke execute on function private.review_certified_memory_v1(
  uuid,uuid,uuid,text,text,timestamptz,jsonb
) from public,anon,authenticated;

revoke execute on function public.service_review_certified_memory_v1(
  uuid,uuid,uuid,text,text,timestamptz,jsonb
) from public,anon,authenticated;

grant execute on function public.service_review_certified_memory_v1(
  uuid,uuid,uuid,text,text,timestamptz,jsonb
) to service_role;

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
        when q.query_ts is null then 0.5
        else coalesce(
          ts_rank_cd(
            to_tsvector('simple',coalesce(a.category,'') || ' ' || a.normalized_knowledge),
            q.query_ts,
            32
          ),
          0
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
    limit greatest(1,least(coalesce(target_limit,24),50))
  )
  select jsonb_build_object(
    'authorized',true,
    'strategy','verified-memory-ranked-v2',
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

commit;
