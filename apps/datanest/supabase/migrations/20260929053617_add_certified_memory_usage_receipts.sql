begin;

create table if not exists public.certified_memory_usage_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  ai_usage_request_id uuid references public.ai_usage_requests(id) on delete set null,
  trace_id text not null check (char_length(btrim(trace_id)) between 8 and 220),
  strategy text not null check (char_length(btrim(strategy)) between 1 and 120),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 120),
  product_scope text,
  visibility_class text not null,
  query_hash text not null check (query_hash ~ '^[0-9a-f]{64}$'),
  active_count integer not null default 0 check (active_count>=0),
  applicable_count integer not null default 0 check (applicable_count>=0),
  selected_count integer not null default 0 check (selected_count>=0),
  review_due_count integer not null default 0 check (review_due_count>=0),
  selected_memory_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(project_id,trace_id)
);

alter table public.certified_memory_usage_receipts enable row level security;
revoke all on table public.certified_memory_usage_receipts from public,anon,authenticated;
grant select,insert on table public.certified_memory_usage_receipts to service_role;

create index if not exists certified_memory_usage_receipts_project_idx
  on public.certified_memory_usage_receipts(project_id,created_at desc);

create index if not exists certified_memory_usage_receipts_job_idx
  on public.certified_memory_usage_receipts(job_id,created_at desc);

create or replace function private.record_certified_memory_usage_v1(
  target_project uuid,
  target_job uuid,
  target_ai_usage_request uuid,
  target_trace_id text,
  target_strategy text,
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
set search_path=public,private,auth
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

  if target_ai_usage_request is not null and not exists(
    select 1
    from public.ai_usage_requests r
    where r.id=target_ai_usage_request
      and r.project_id=target_project
      and r.job_id=target_job
  ) then
    raise exception 'Memory receipt request does not belong to project and Job.';
  end if;

  if nullif(btrim(coalesce(target_trace_id,'')),'') is null
     or nullif(btrim(coalesce(target_strategy,'')),'') is null
     or nullif(btrim(coalesce(target_purpose,'')),'') is null
     or nullif(btrim(coalesce(target_visibility_class,'')),'') is null
     or coalesce(target_query_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Memory receipt identity and query hash are required.';
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
    project_id,job_id,ai_usage_request_id,trace_id,strategy,purpose,
    product_scope,visibility_class,query_hash,active_count,applicable_count,
    selected_count,review_due_count,selected_memory_ids
  )
  values(
    target_project,target_job,target_ai_usage_request,btrim(target_trace_id),
    btrim(target_strategy),btrim(target_purpose),nullif(btrim(coalesce(target_product_scope,'')),''),
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

create or replace function public.service_record_certified_memory_usage_v1(
  target_project uuid,
  target_job uuid,
  target_ai_usage_request uuid,
  target_trace_id text,
  target_strategy text,
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
set search_path=public,private
as $$
  select private.record_certified_memory_usage_v1(
    target_project,target_job,target_ai_usage_request,target_trace_id,
    target_strategy,target_purpose,target_product_scope,target_visibility_class,
    target_query_hash,target_active_count,target_applicable_count,target_selected_count,
    target_review_due_count,target_selected_memory_ids
  );
$$;

revoke execute on function private.record_certified_memory_usage_v1(
  uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,uuid[]
) from public,anon,authenticated;

revoke execute on function public.service_record_certified_memory_usage_v1(
  uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,uuid[]
) from public,anon,authenticated;

grant execute on function public.service_record_certified_memory_usage_v1(
  uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,integer,uuid[]
) to service_role;

create or replace function public.get_intelligence_fabric_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active'
  limit 1;

  return jsonb_build_object(
    'profiles',coalesce((
      select jsonb_agg(to_jsonb(p) order by
        case p.status when 'active' then 0 when 'draft' then 1 when 'suspended' then 2 else 3 end,
        p.profile_key,p.version desc)
      from public.ilm_profiles p
      where p.project_id=target_project
    ),'[]'::jsonb),
    'routes',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select *
        from public.intelligence_route_decisions
        where project_id=target_project
        order by created_at desc
        limit 100
      ) r
    ),'[]'::jsonb),
    'evaluations',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.evaluated_at desc)
      from (
        select *
        from public.intelligence_evaluation_runs
        where project_id=target_project
        order by evaluated_at desc
        limit 100
      ) e
    ),'[]'::jsonb),
    'capability_evidence',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.observed_at desc)
      from (
        select *
        from public.intelligence_capability_evidence
        where project_id=target_project
        order by observed_at desc
        limit 100
      ) c
    ),'[]'::jsonb),
    'memory_receipts',coalesce((
      select jsonb_agg(to_jsonb(mr) order by mr.created_at desc)
      from (
        select *
        from public.certified_memory_usage_receipts
        where project_id=target_project
        order by created_at desc
        limit 100
      ) mr
    ),'[]'::jsonb),
    'certified_memory',jsonb_build_object(
      'active_count',(select count(*) from public.certified_memory m where m.project_id=target_project and m.active=true),
      'review_due_count',(
        select count(*)
        from public.certified_memory m
        where m.project_id=target_project
          and m.active=true
          and m.review_after is not null
          and m.review_after<=now()
      ),
      'usage_receipt_count',(
        select count(*)
        from public.certified_memory_usage_receipts mr
        where mr.project_id=target_project
      ),
      'latest_ids',coalesce((
        select jsonb_agg(id order by promoted_at desc)
        from (
          select id,promoted_at
          from public.certified_memory
          where project_id=target_project and active=true
          order by promoted_at desc
          limit 20
        ) memory_rows
      ),'[]'::jsonb)
    ),
    'resource_fabric',jsonb_build_object(
      'active_resource_count',(
        select count(*)
        from public.resource_project_bindings b
        where b.project_id=target_project and b.status='active'
      ),
      'linked_capability_count',(
        select count(*)
        from public.capabilities c
        where c.project_id=target_project and c.resource_id is not null
      )
    ),
    'caller_role',caller_role,
    'can_manage',caller_role in ('owner','admin'),
    'boundaries',jsonb_build_object(
      'ilm_is_trained_foundation_model',false,
      'routing_is_authorization',false,
      'evaluation_mutable_in_browser',false,
      'certified_memory_promotion_separate',true,
      'memory_receipts_are_audit_evidence',true,
      'memory_receipts_exclude_raw_prompt',true,
      'phase_c_policy_separate',true,
      'phase_d_authority_separate',true,
      'phase_e_health_separate',true
    )
  );
end;
$$;

commit;
