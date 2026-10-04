begin;

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
      ) as freshness_score
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

commit;
