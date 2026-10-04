begin;

alter table public.certified_memory
  add column if not exists consolidated_into_memory_id uuid
    references public.certified_memory(id) on delete restrict;

alter table public.certified_memory
  drop constraint if exists certified_memory_not_self_consolidated_check;

alter table public.certified_memory
  add constraint certified_memory_not_self_consolidated_check
  check (consolidated_into_memory_id is null or consolidated_into_memory_id<>id);

create index if not exists certified_memory_consolidated_into_idx
  on public.certified_memory(project_id,consolidated_into_memory_id)
  where consolidated_into_memory_id is not null;

create table if not exists public.certified_memory_consolidations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  canonical_memory_id uuid not null references public.certified_memory(id) on delete restrict,
  status text not null default 'proposed'
    check (status in ('proposed','executed','rejected')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  proposed_by uuid not null references auth.users(id) on delete restrict,
  proposer_role text not null check (proposer_role in ('owner','admin')),
  decided_by uuid references auth.users(id) on delete set null,
  decision_reason text,
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz
);

create table if not exists public.certified_memory_consolidation_members (
  consolidation_id uuid not null
    references public.certified_memory_consolidations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  memory_id uuid not null references public.certified_memory(id) on delete restrict,
  member_role text not null check (member_role in ('canonical','equivalent')),
  normalized_knowledge_snapshot text not null,
  content_hash_snapshot text not null,
  category_snapshot text not null,
  effective_version_snapshot bigint not null,
  active_snapshot boolean not null,
  created_at timestamptz not null default now(),
  primary key(consolidation_id,memory_id)
);

create unique index if not exists certified_memory_consolidation_one_canonical_idx
  on public.certified_memory_consolidation_members(consolidation_id)
  where member_role='canonical';

create index if not exists certified_memory_consolidations_project_status_idx
  on public.certified_memory_consolidations(project_id,status,proposed_at desc);

create index if not exists certified_memory_consolidations_canonical_idx
  on public.certified_memory_consolidations(canonical_memory_id,proposed_at desc);

create index if not exists certified_memory_consolidation_members_memory_idx
  on public.certified_memory_consolidation_members(project_id,memory_id);

alter table public.certified_memory_consolidations enable row level security;
alter table public.certified_memory_consolidation_members enable row level security;

revoke all on table public.certified_memory_consolidations from public,anon,authenticated;
revoke all on table public.certified_memory_consolidation_members from public,anon,authenticated;

grant select,insert,update on table public.certified_memory_consolidations to service_role;
grant select,insert on table public.certified_memory_consolidation_members to service_role;

create or replace function private.propose_certified_memory_consolidation_v1(
  target_project uuid,
  target_canonical_memory uuid,
  target_memory_ids uuid[],
  target_actor uuid,
  target_reason text,
  target_evidence jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_role text;
  selected_ids uuid[];
  selected_count integer;
  canonical_row public.certified_memory%rowtype;
  proposal_id uuid;
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
    raise insufficient_privilege using message='Owner or Admin authority is required to propose Certified Memory consolidation.';
  end if;

  if nullif(btrim(target_reason),'') is null then
    raise exception 'Certified Memory consolidation reason is required.';
  end if;

  if jsonb_typeof(coalesce(target_evidence,'{}'::jsonb))<>'object' then
    raise exception 'Certified Memory consolidation evidence must be a JSON object.';
  end if;

  select coalesce(array_agg(distinct memory_id order by memory_id),'{}'::uuid[])
  into selected_ids
  from unnest(coalesce(target_memory_ids,'{}'::uuid[])) memory_id;

  selected_count:=coalesce(cardinality(selected_ids),0);
  if selected_count<2 then
    raise exception 'Certified Memory consolidation requires at least two distinct memories.';
  end if;

  if not (target_canonical_memory=any(selected_ids)) then
    raise exception 'Canonical memory must be included in the consolidation member set.';
  end if;

  select * into canonical_row
  from public.certified_memory
  where id=target_canonical_memory
    and project_id=target_project
    and active=true
    and consolidated_into_memory_id is null;

  if not found then
    raise exception 'Canonical memory must be active, unconsolidated, and belong to the project.';
  end if;

  if (
    select count(*)
    from public.certified_memory m
    where m.project_id=target_project
      and m.id=any(selected_ids)
      and m.active=true
      and m.consolidated_into_memory_id is null
      and m.category=canonical_row.category
  )<>selected_count then
    raise exception 'All consolidation members must be active, unconsolidated project memories in the same category.';
  end if;

  if exists(
    select 1
    from public.certified_memory_relations r
    where r.project_id=target_project
      and r.relation_kind='contradicts'
      and r.source_memory_id=any(selected_ids)
      and r.target_memory_id=any(selected_ids)
  ) then
    raise exception 'Contradictory Certified Memory cannot be consolidated as equivalent knowledge.';
  end if;

  if exists(
    select 1
    from public.certified_memory_consolidation_members cm
    join public.certified_memory_consolidations c
      on c.id=cm.consolidation_id
    where c.project_id=target_project
      and c.status='proposed'
      and cm.memory_id=any(selected_ids)
  ) then
    raise exception 'One or more memories already belong to a pending consolidation proposal.';
  end if;

  insert into public.certified_memory_consolidations(
    project_id,canonical_memory_id,status,reason,evidence,proposed_by,proposer_role
  )
  values(
    target_project,target_canonical_memory,'proposed',btrim(target_reason),
    coalesce(target_evidence,'{}'::jsonb),target_actor,actor_role
  )
  returning id into proposal_id;

  insert into public.certified_memory_consolidation_members(
    consolidation_id,project_id,memory_id,member_role,
    normalized_knowledge_snapshot,content_hash_snapshot,category_snapshot,
    effective_version_snapshot,active_snapshot
  )
  select
    proposal_id,target_project,m.id,
    case when m.id=target_canonical_memory then 'canonical' else 'equivalent' end,
    m.normalized_knowledge,m.content_hash,m.category,m.effective_version,m.active
  from public.certified_memory m
  where m.project_id=target_project
    and m.id=any(selected_ids);

  return proposal_id;
end;
$$;

create or replace function public.service_propose_certified_memory_consolidation_v1(
  target_project uuid,
  target_canonical_memory uuid,
  target_memory_ids uuid[],
  target_actor uuid,
  target_reason text,
  target_evidence jsonb default '{}'::jsonb
) returns uuid
language sql
security definer
set search_path=''
as $$
  select private.propose_certified_memory_consolidation_v1(
    target_project,target_canonical_memory,target_memory_ids,target_actor,
    target_reason,target_evidence
  );
$$;

create or replace function private.decide_certified_memory_consolidation_v1(
  target_project uuid,
  target_consolidation uuid,
  target_actor uuid,
  target_decision text,
  target_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_role text;
  proposal_row public.certified_memory_consolidations%rowtype;
  member_ids uuid[];
  equivalent_ids uuid[];
  member_count integer;
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

  if actor_role<>'owner' then
    raise insufficient_privilege using message='Owner authority is required to execute or reject Certified Memory consolidation.';
  end if;

  if target_decision not in ('execute','reject') then
    raise exception 'Certified Memory consolidation decision must be execute or reject.';
  end if;

  if nullif(btrim(target_reason),'') is null then
    raise exception 'Certified Memory consolidation decision reason is required.';
  end if;

  select * into proposal_row
  from public.certified_memory_consolidations
  where id=target_consolidation
    and project_id=target_project
  for update;

  if not found then
    raise exception 'Certified Memory consolidation proposal not found.';
  end if;

  if proposal_row.status='executed' and target_decision='execute' then
    select coalesce(array_agg(memory_id order by memory_id),'{}'::uuid[])
    into member_ids
    from public.certified_memory_consolidation_members
    where consolidation_id=proposal_row.id;

    return jsonb_build_object(
      'consolidation_id',proposal_row.id,
      'status','executed',
      'canonical_memory_id',proposal_row.canonical_memory_id,
      'member_memory_ids',member_ids,
      'idempotent',true
    );
  end if;

  if proposal_row.status<>'proposed' then
    raise exception 'Certified Memory consolidation proposal is no longer pending.';
  end if;

  if target_decision='reject' then
    update public.certified_memory_consolidations
    set status='rejected',
        decided_by=target_actor,
        decision_reason=btrim(target_reason),
        decided_at=now()
    where id=proposal_row.id;

    return jsonb_build_object(
      'consolidation_id',proposal_row.id,
      'status','rejected',
      'canonical_memory_id',proposal_row.canonical_memory_id
    );
  end if;

  select
    coalesce(array_agg(memory_id order by memory_id),'{}'::uuid[]),
    count(*)
  into member_ids,member_count
  from public.certified_memory_consolidation_members
  where consolidation_id=proposal_row.id;

  if member_count<2 then
    raise exception 'Certified Memory consolidation proposal has fewer than two members.';
  end if;

  if (
    select count(*)
    from public.certified_memory m
    join public.certified_memory_consolidation_members cm
      on cm.memory_id=m.id
    where cm.consolidation_id=proposal_row.id
      and m.project_id=target_project
      and m.active=true
      and m.consolidated_into_memory_id is null
      and m.category=(
        select category
        from public.certified_memory
        where id=proposal_row.canonical_memory_id
          and project_id=target_project
      )
      and m.content_hash=cm.content_hash_snapshot
  )<>member_count then
    raise exception 'Certified Memory consolidation proposal is stale and must be reviewed again.';
  end if;

  if exists(
    select 1
    from public.certified_memory_relations r
    where r.project_id=target_project
      and r.relation_kind='contradicts'
      and r.source_memory_id=any(member_ids)
      and r.target_memory_id=any(member_ids)
  ) then
    raise exception 'Contradictory Certified Memory cannot be consolidated as equivalent knowledge.';
  end if;

  select coalesce(array_agg(memory_id order by memory_id),'{}'::uuid[])
  into equivalent_ids
  from public.certified_memory_consolidation_members
  where consolidation_id=proposal_row.id
    and member_role='equivalent';

  update public.certified_memory
  set active=false,
      consolidated_into_memory_id=proposal_row.canonical_memory_id
  where project_id=target_project
    and id=any(equivalent_ids)
    and active=true
    and consolidated_into_memory_id is null;

  if found then
    insert into public.certified_memory_relations(
      project_id,source_memory_id,target_memory_id,relation_kind,confidence,evidence,created_by
    )
    select
      target_project,proposal_row.canonical_memory_id,memory_id,'duplicates',1,
      jsonb_build_object(
        'source','canonical_memory_consolidation',
        'consolidation_id',proposal_row.id,
        'decision_reason',btrim(target_reason),
        'historical_source_preserved',true
      ),
      target_actor
    from public.certified_memory_consolidation_members
    where consolidation_id=proposal_row.id
      and member_role='equivalent'
    on conflict(project_id,source_memory_id,target_memory_id,relation_kind)
    do nothing;
  end if;

  update public.certified_memory_consolidations
  set status='executed',
      decided_by=target_actor,
      decision_reason=btrim(target_reason),
      decided_at=now(),
      executed_at=now()
  where id=proposal_row.id;

  return jsonb_build_object(
    'consolidation_id',proposal_row.id,
    'status','executed',
    'canonical_memory_id',proposal_row.canonical_memory_id,
    'consolidated_memory_ids',equivalent_ids,
    'historical_sources_preserved',true
  );
end;
$$;

create or replace function public.service_decide_certified_memory_consolidation_v1(
  target_project uuid,
  target_consolidation uuid,
  target_actor uuid,
  target_decision text,
  target_reason text
) returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.decide_certified_memory_consolidation_v1(
    target_project,target_consolidation,target_actor,target_decision,target_reason
  );
$$;

revoke execute on function private.propose_certified_memory_consolidation_v1(
  uuid,uuid,uuid[],uuid,text,jsonb
) from public,anon,authenticated;

revoke execute on function public.service_propose_certified_memory_consolidation_v1(
  uuid,uuid,uuid[],uuid,text,jsonb
) from public,anon,authenticated;

grant execute on function public.service_propose_certified_memory_consolidation_v1(
  uuid,uuid,uuid[],uuid,text,jsonb
) to service_role;

revoke execute on function private.decide_certified_memory_consolidation_v1(
  uuid,uuid,uuid,text,text
) from public,anon,authenticated;

revoke execute on function public.service_decide_certified_memory_consolidation_v1(
  uuid,uuid,uuid,text,text
) from public,anon,authenticated;

grant execute on function public.service_decide_certified_memory_consolidation_v1(
  uuid,uuid,uuid,text,text
) to service_role;

commit;
