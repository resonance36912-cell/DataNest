begin;

create table if not exists public.certified_memory_outcome_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  memory_id uuid not null references public.certified_memory(id) on delete cascade,
  usage_receipt_id uuid not null references public.certified_memory_usage_receipts(id) on delete cascade,
  signal text not null check (
    signal in ('supported','neutral','challenged','contradicted','unknown')
  ),
  outcome_kind text not null check (
    outcome_kind in ('human_review','external_audit','test_result','job_result','operator_observation')
  ),
  summary text not null check (char_length(btrim(summary)) between 1 and 2000),
  evidence jsonb not null default '{}'::jsonb,
  recorded_by uuid references auth.users(id) on delete set null,
  recorder_role text not null check (recorder_role in ('owner','admin')),
  review_triggered boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.certified_memory_outcome_evidence enable row level security;
revoke all on table public.certified_memory_outcome_evidence from public,anon,authenticated;
grant select,insert on table public.certified_memory_outcome_evidence to service_role;

create index if not exists certified_memory_outcome_project_idx
  on public.certified_memory_outcome_evidence(project_id,created_at desc);

create index if not exists certified_memory_outcome_memory_idx
  on public.certified_memory_outcome_evidence(memory_id,created_at desc);

create index if not exists certified_memory_outcome_receipt_idx
  on public.certified_memory_outcome_evidence(usage_receipt_id,created_at desc);

create or replace function private.record_certified_memory_outcome_v1(
  target_project uuid,
  target_memory uuid,
  target_usage_receipt uuid,
  target_actor uuid,
  target_signal text,
  target_outcome_kind text,
  target_summary text,
  target_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_role text;
  receipt_row public.certified_memory_usage_receipts%rowtype;
  memory_row public.certified_memory%rowtype;
  outcome_id uuid;
  triggered boolean:=false;
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
    raise insufficient_privilege using message='Owner or Admin outcome-review authority is required.';
  end if;

  if target_signal not in ('supported','neutral','challenged','contradicted','unknown') then
    raise exception 'Unsupported Certified Memory outcome signal.';
  end if;

  if target_outcome_kind not in (
    'human_review','external_audit','test_result','job_result','operator_observation'
  ) then
    raise exception 'Unsupported Certified Memory outcome kind.';
  end if;

  if nullif(btrim(coalesce(target_summary,'')),'') is null then
    raise exception 'Certified Memory outcome summary is required.';
  end if;

  select * into memory_row
  from public.certified_memory m
  where m.id=target_memory
    and m.project_id=target_project;

  if not found then
    raise exception 'Certified Memory item not found.';
  end if;

  select * into receipt_row
  from public.certified_memory_usage_receipts r
  where r.id=target_usage_receipt
    and r.project_id=target_project;

  if not found then
    raise exception 'Verified Memory usage receipt not found.';
  end if;

  if not (target_memory=any(coalesce(receipt_row.selected_memory_ids,'{}'::uuid[]))) then
    raise exception 'Outcome evidence memory was not selected by the referenced usage receipt.';
  end if;

  if target_signal in ('challenged','contradicted') and memory_row.active then
    update public.certified_memory
    set review_after=least(coalesce(review_after,now()),now())
    where id=memory_row.id;
    triggered:=true;
  end if;

  insert into public.certified_memory_outcome_evidence(
    project_id,memory_id,usage_receipt_id,signal,outcome_kind,summary,evidence,
    recorded_by,recorder_role,review_triggered
  )
  values(
    target_project,target_memory,target_usage_receipt,target_signal,target_outcome_kind,
    btrim(target_summary),coalesce(target_evidence,'{}'::jsonb),target_actor,actor_role,triggered
  )
  returning id into outcome_id;

  return jsonb_build_object(
    'outcome_id',outcome_id,
    'memory_id',target_memory,
    'usage_receipt_id',target_usage_receipt,
    'signal',target_signal,
    'outcome_kind',target_outcome_kind,
    'review_triggered',triggered,
    'certification_changed',false,
    'confidence_changed',false
  );
end;
$$;

create or replace function public.service_record_certified_memory_outcome_v1(
  target_project uuid,
  target_memory uuid,
  target_usage_receipt uuid,
  target_actor uuid,
  target_signal text,
  target_outcome_kind text,
  target_summary text,
  target_evidence jsonb default '{}'::jsonb
) returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.record_certified_memory_outcome_v1(
    target_project,target_memory,target_usage_receipt,target_actor,target_signal,
    target_outcome_kind,target_summary,target_evidence
  );
$$;

revoke execute on function private.record_certified_memory_outcome_v1(
  uuid,uuid,uuid,uuid,text,text,text,jsonb
) from public,anon,authenticated;

revoke execute on function public.service_record_certified_memory_outcome_v1(
  uuid,uuid,uuid,uuid,text,text,text,jsonb
) from public,anon,authenticated;

grant execute on function public.service_record_certified_memory_outcome_v1(
  uuid,uuid,uuid,uuid,text,text,text,jsonb
) to service_role;

commit;
