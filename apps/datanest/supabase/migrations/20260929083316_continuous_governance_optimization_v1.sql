begin;

-- Resonance DataNest Continuous Governance Optimization v1
-- Evidence may trigger review and proposals, but this layer cannot vote, decide,
-- ratify, grant authority, amend contracts, or rewrite sovereign governance history.

create table if not exists public.governance_standards_register (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  standard_key text not null check (char_length(btrim(standard_key)) between 3 and 160),
  version bigint not null check (version > 0),
  title text not null check (char_length(btrim(title)) between 3 and 500),
  authority text not null check (char_length(btrim(authority)) between 2 and 160),
  edition text not null check (char_length(btrim(edition)) between 1 and 120),
  applicability_state text not null default 'reference'
    check (applicability_state in ('reference','applicable','monitor','not_applicable')),
  rationale text not null default 'Pending project-specific applicability assessment.',
  source_url text,
  review_after timestamptz not null,
  last_reviewed_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  supersedes_id uuid references public.governance_standards_register(id) on delete set null,
  unique(project_id,standard_key,version)
);

create unique index if not exists governance_standards_one_active_idx
  on public.governance_standards_register(project_id,standard_key)
  where active=true;
create index if not exists governance_standards_review_idx
  on public.governance_standards_register(project_id,active,review_after);
create index if not exists governance_standards_supersedes_idx
  on public.governance_standards_register(supersedes_id)
  where supersedes_id is not null;

create table if not exists public.governance_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trace_key text not null unique,
  source_kind text not null check (source_kind in (
    'audit','incident','metric','dispute','decision_outcome','stakeholder_feedback',
    'standards_change','certified_memory_review','external_audit','manual'
  )),
  source_ref text,
  summary text not null check (char_length(btrim(summary)) between 3 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  severity text not null default 'info'
    check (severity in ('info','low','moderate','high','critical')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  observed_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorder_role text not null check (recorder_role in ('owner','admin','operator','viewer')),
  authoritative_change boolean not null default false check (authoritative_change=false),
  created_at timestamptz not null default now()
);

create index if not exists governance_observations_project_idx
  on public.governance_observations(project_id,observed_at desc);
create index if not exists governance_observations_severity_idx
  on public.governance_observations(project_id,severity,observed_at desc);

create table if not exists public.governance_improvement_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trace_key text not null unique,
  title text not null check (char_length(btrim(title)) between 3 and 300),
  problem_statement text not null check (char_length(btrim(problem_statement)) between 3 and 4000),
  hypothesis text not null check (char_length(btrim(hypothesis)) between 3 and 4000),
  desired_outcome text not null check (char_length(btrim(desired_outcome)) between 3 and 4000),
  source_observation_ids uuid[] not null default '{}',
  standard_refs text[] not null default '{}',
  risk_class text not null default 'moderate'
    check (risk_class in ('low','moderate','high','critical')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  proposed_change jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed','needs_evidence','ready_for_governance','converted_to_proposal','dismissed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  linked_governance_proposal_id uuid references public.governance_proposals(id) on delete set null,
  governance_effect boolean not null default false check (governance_effect=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists governance_improvement_candidates_project_idx
  on public.governance_improvement_candidates(project_id,status,updated_at desc);
create index if not exists governance_improvement_candidate_proposal_idx
  on public.governance_improvement_candidates(linked_governance_proposal_id)
  where linked_governance_proposal_id is not null;

create table if not exists public.governance_improvement_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  candidate_id uuid not null references public.governance_improvement_candidates(id) on delete restrict,
  previous_status text not null,
  decision text not null check (decision in ('needs_evidence','ready_for_governance','dismissed')),
  rationale text not null check (char_length(btrim(rationale)) between 3 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewer_role text not null check (reviewer_role in ('owner','admin')),
  created_at timestamptz not null default now()
);

create index if not exists governance_improvement_reviews_project_idx
  on public.governance_improvement_reviews(project_id,created_at desc);
create index if not exists governance_improvement_reviews_candidate_idx
  on public.governance_improvement_reviews(candidate_id,created_at desc);

create table if not exists public.governance_improvement_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trace_key text not null unique,
  window_start timestamptz not null,
  window_end timestamptz not null,
  previous_cycle_id uuid references public.governance_improvement_cycles(id) on delete set null,
  metrics jsonb not null default '{}'::jsonb,
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals)='array'),
  standards_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  governance_effect boolean not null default false check (governance_effect=false),
  created_at timestamptz not null default now(),
  check (window_end > window_start)
);

create index if not exists governance_improvement_cycles_project_idx
  on public.governance_improvement_cycles(project_id,created_at desc);

create or replace function private.seed_continuous_governance_standards_v1(target_project uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.governance_standards_register(
    project_id,standard_key,version,title,authority,edition,applicability_state,
    rationale,source_url,review_after,metadata
  )
  select
    target_project,
    seed.standard_key,
    1,
    seed.title,
    seed.authority,
    seed.edition,
    'reference',
    'Recognized governance/management reference. Project-specific applicability and conformity have not been assessed.',
    seed.source_url,
    now()+interval '90 days',
    jsonb_build_object(
      'baseline','continuous-governance-v1',
      'operational_review_cadence_days',90,
      'conformity_claim',false,
      'applicability_assessment_required',true
    )
  from (
    values
      ('iso-iec-42001-2023','ISO/IEC 42001 — AI management systems','ISO/IEC','2023','https://www.iso.org/standard/42001'),
      ('iso-iec-42005-2025','ISO/IEC 42005 — AI system impact assessment','ISO/IEC','2025',null),
      ('iso-iec-23894-2023','ISO/IEC 23894 — AI risk management','ISO/IEC','2023','https://www.iso.org/standard/77304.html'),
      ('iso-30401-2018','ISO 30401 — Knowledge management systems','ISO','2018 + applicable amendments','https://www.iso.org/standard/68683.html'),
      ('iso-31000-2018','ISO 31000 — Risk management — Guidelines','ISO','2018','https://www.iso.org/iso-31000-risk-management.html'),
      ('iso-37301-2021','ISO 37301 — Compliance management systems','ISO','2021','https://www.iso.org/standard/75080.html'),
      ('iso-iec-38500-2024','ISO/IEC 38500 — Governance of IT for the organization','ISO/IEC','2024','https://www.iso.org/standard/81684.html'),
      ('iso-iec-38507-2022','ISO/IEC 38507 — Governance implications of AI use by organizations','ISO/IEC','2022','https://www.iso.org/standard/56641.html'),
      ('iso-iec-38505-1-2026','ISO/IEC 38505-1 — Governance of data','ISO/IEC','2026','https://www.iso.org/standard/87195.html'),
      ('iso-iec-27001-2022','ISO/IEC 27001 — Information security management systems','ISO/IEC','2022 + Amd 1:2024',null),
      ('iso-iec-27701-2025','ISO/IEC 27701 — Privacy information management systems','ISO/IEC','2025',null),
      ('iso-iec-5338-2023','ISO/IEC 5338 — AI system life cycle processes','ISO/IEC','2023','https://www.iso.org/standard/81118.html'),
      ('iso-iec-5259-series','ISO/IEC 5259 series — Data quality for analytics and machine learning','ISO/IEC','current applicable parts','https://www.iso.org/publication/PUB200525.html'),
      ('nist-ai-rmf-1-0','NIST AI Risk Management Framework 1.0','NIST','1.0','https://www.nist.gov/itl/ai-risk-management-framework'),
      ('nist-csf-2-0','NIST Cybersecurity Framework 2.0','NIST','2.0','https://www.nist.gov/cyberframework'),
      ('oecd-ai-principles-2024','OECD AI Principles','OECD','2024 update','https://oecd.ai/en/ai-principles')
  ) as seed(standard_key,title,authority,edition,source_url)
  on conflict(project_id,standard_key,version) do nothing;
end;
$$;

create or replace function private.seed_continuous_governance_for_project_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.seed_continuous_governance_standards_v1(new.id);
  return new;
end;
$$;

drop trigger if exists seed_continuous_governance_for_project_v1 on public.projects;
create trigger seed_continuous_governance_for_project_v1
after insert on public.projects
for each row execute function private.seed_continuous_governance_for_project_v1();

do $$
declare
  p record;
begin
  for p in select id from public.projects loop
    perform private.seed_continuous_governance_standards_v1(p.id);
  end loop;
end;
$$;

create or replace function private.review_governance_standard_v1(
  target_standard uuid,
  target_applicability_state text,
  target_rationale text,
  target_review_days integer default 90,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  current_row public.governance_standards_register%rowtype;
  caller_role text;
  next_version bigint;
  new_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into current_row
  from public.governance_standards_register
  where id=target_standard and active=true
  for update;

  if not found then raise exception 'Active governance standard record not found.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=current_row.project_id
    and pm.user_id=caller
    and pm.status='active'
  limit 1;

  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin standards-review authority is required.';
  end if;

  if target_applicability_state not in ('reference','applicable','monitor','not_applicable') then
    raise exception 'Unsupported standards applicability state.';
  end if;
  if target_review_days < 30 or target_review_days > 365 then
    raise exception 'Standards review interval must be between 30 and 365 days.';
  end if;
  if nullif(btrim(coalesce(target_rationale,'')),'') is null then
    raise exception 'Standards review rationale is required.';
  end if;

  select coalesce(max(s.version),0)+1 into next_version
  from public.governance_standards_register s
  where s.project_id=current_row.project_id
    and s.standard_key=current_row.standard_key;

  update public.governance_standards_register
  set active=false
  where id=current_row.id;

  insert into public.governance_standards_register(
    project_id,standard_key,version,title,authority,edition,applicability_state,
    rationale,source_url,review_after,last_reviewed_at,active,metadata,
    reviewed_by,created_by,supersedes_id
  )
  values(
    current_row.project_id,current_row.standard_key,next_version,current_row.title,
    current_row.authority,current_row.edition,target_applicability_state,
    btrim(target_rationale),current_row.source_url,
    now()+make_interval(days=>target_review_days),now(),true,
    coalesce(current_row.metadata,'{}'::jsonb)||coalesce(target_metadata,'{}'::jsonb),
    caller,caller,current_row.id
  )
  returning id into new_id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    current_row.project_id,
    'GOVERNANCE_STANDARD_REVIEWED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'standard_key',current_row.standard_key,
      'prior_version',current_row.version,
      'new_version',next_version,
      'applicability_state',target_applicability_state,
      'conformity_claim',false,
      'review_days',target_review_days
    )
  );

  return new_id;
end;
$$;

create or replace function private.record_governance_observation_v1(
  target_project uuid,
  target_source_kind text,
  target_summary text,
  target_severity text default 'info',
  target_confidence numeric default null,
  target_source_ref text default null,
  target_evidence jsonb default '{}'::jsonb,
  target_observed_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  observation_id uuid:=gen_random_uuid();
  trace text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project and pm.user_id=caller and pm.status='active'
    and pm.role in ('owner','admin','operator','viewer')
  limit 1;

  if caller_role is null then
    raise insufficient_privilege using message='Active project membership is required to record governance evidence.';
  end if;

  if target_source_kind not in (
    'audit','incident','metric','dispute','decision_outcome','stakeholder_feedback',
    'standards_change','certified_memory_review','external_audit','manual'
  ) then raise exception 'Unsupported governance observation source.'; end if;

  if caller_role not in ('owner','admin')
     and target_source_kind not in ('manual','stakeholder_feedback') then
    raise insufficient_privilege using message='Owner or Admin authority is required for structured governance evidence sources.';
  end if;

  if target_severity not in ('info','low','moderate','high','critical') then
    raise exception 'Unsupported governance observation severity.';
  end if;
  if target_confidence is not null and (target_confidence<0 or target_confidence>1) then
    raise exception 'Governance observation confidence must be between 0 and 1.';
  end if;
  if nullif(btrim(coalesce(target_summary,'')),'') is null then
    raise exception 'Governance observation summary is required.';
  end if;

  trace:='DN-GOV-OBS-'||upper(substr(replace(observation_id::text,'-',''),1,16));

  insert into public.governance_observations(
    id,project_id,trace_key,source_kind,source_ref,summary,evidence,severity,
    confidence,observed_at,recorded_by,recorder_role
  )
  values(
    observation_id,target_project,trace,target_source_kind,
    nullif(btrim(coalesce(target_source_ref,'')),''),
    btrim(target_summary),coalesce(target_evidence,'{}'::jsonb),target_severity,
    target_confidence,coalesce(target_observed_at,now()),caller,caller_role
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'GOVERNANCE_OBSERVATION_RECORDED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'observation_id',observation_id,'trace_key',trace,'source_kind',target_source_kind,
      'severity',target_severity,'authoritative_change',false
    )
  );

  return observation_id;
end;
$$;

create or replace function private.create_governance_improvement_candidate_v1(
  target_project uuid,
  target_title text,
  target_problem_statement text,
  target_hypothesis text,
  target_desired_outcome text,
  target_source_observation_ids uuid[] default '{}',
  target_standard_refs text[] default '{}',
  target_risk_class text default 'moderate',
  target_confidence numeric default null,
  target_proposed_change jsonb default '{}'::jsonb,
  target_guardrails jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  candidate_id uuid:=gen_random_uuid();
  trace text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project and pm.user_id=caller and pm.status='active'
    and pm.role in ('owner','admin','operator','viewer')
  limit 1;
  if caller_role is null then
    raise insufficient_privilege using message='Active project membership is required to create an improvement candidate.';
  end if;

  if target_risk_class not in ('low','moderate','high','critical') then
    raise exception 'Unsupported governance improvement risk class.';
  end if;
  if target_confidence is not null and (target_confidence<0 or target_confidence>1) then
    raise exception 'Governance improvement confidence must be between 0 and 1.';
  end if;
  if nullif(btrim(coalesce(target_title,'')),'') is null
     or nullif(btrim(coalesce(target_problem_statement,'')),'') is null
     or nullif(btrim(coalesce(target_hypothesis,'')),'') is null
     or nullif(btrim(coalesce(target_desired_outcome,'')),'') is null then
    raise exception 'Title, problem statement, hypothesis and desired outcome are required.';
  end if;
  if cardinality(coalesce(target_source_observation_ids,'{}'::uuid[]))=0
     and cardinality(coalesce(target_standard_refs,'{}'::text[]))=0 then
    raise exception 'An improvement candidate requires observation evidence or a standards reference.';
  end if;

  if exists(
    select 1 from unnest(coalesce(target_source_observation_ids,'{}'::uuid[])) o(id)
    where not exists(
      select 1 from public.governance_observations go
      where go.id=o.id and go.project_id=target_project
    )
  ) then
    raise exception 'Improvement candidate references governance evidence outside the project.';
  end if;

  if exists(
    select 1 from unnest(coalesce(target_standard_refs,'{}'::text[])) s(key)
    where not exists(
      select 1 from public.governance_standards_register gsr
      where gsr.project_id=target_project and gsr.standard_key=s.key and gsr.active=true
    )
  ) then
    raise exception 'Improvement candidate contains an unknown active standards reference.';
  end if;

  trace:='DN-GOV-IMP-'||upper(substr(replace(candidate_id::text,'-',''),1,16));

  insert into public.governance_improvement_candidates(
    id,project_id,trace_key,title,problem_statement,hypothesis,desired_outcome,
    source_observation_ids,standard_refs,risk_class,confidence,proposed_change,
    guardrails,status,created_by
  )
  values(
    candidate_id,target_project,trace,btrim(target_title),btrim(target_problem_statement),
    btrim(target_hypothesis),btrim(target_desired_outcome),
    coalesce(target_source_observation_ids,'{}'::uuid[]),
    coalesce(target_standard_refs,'{}'::text[]),target_risk_class,target_confidence,
    coalesce(target_proposed_change,'{}'::jsonb),
    coalesce(target_guardrails,'{}'::jsonb)||jsonb_build_object(
      'no_automatic_vote',true,
      'no_automatic_ratification',true,
      'no_direct_authority_change',true,
      'evidence_does_not_equal_truth',true
    ),
    'proposed',caller
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'GOVERNANCE_IMPROVEMENT_CANDIDATE_CREATED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'candidate_id',candidate_id,'trace_key',trace,'risk_class',target_risk_class,
      'governance_effect',false,'requires_human_review',true
    )
  );

  return candidate_id;
end;
$$;

create or replace function private.review_governance_improvement_candidate_v1(
  target_candidate uuid,
  target_decision text,
  target_rationale text,
  target_evidence jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  candidate public.governance_improvement_candidates%rowtype;
  caller_role text;
  review_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into candidate
  from public.governance_improvement_candidates
  where id=target_candidate
  for update;
  if not found then raise exception 'Governance improvement candidate not found.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=candidate.project_id and pm.user_id=caller and pm.status='active'
  limit 1;
  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin improvement-review authority is required.';
  end if;

  if candidate.status in ('converted_to_proposal','dismissed') then
    raise exception 'Finalized governance improvement candidates cannot be reviewed again.';
  end if;
  if target_decision not in ('needs_evidence','ready_for_governance','dismissed') then
    raise exception 'Unsupported governance improvement review decision.';
  end if;
  if nullif(btrim(coalesce(target_rationale,'')),'') is null then
    raise exception 'Governance improvement review rationale is required.';
  end if;

  insert into public.governance_improvement_reviews(
    project_id,candidate_id,previous_status,decision,rationale,evidence,
    reviewed_by,reviewer_role
  )
  values(
    candidate.project_id,candidate.id,candidate.status,target_decision,
    btrim(target_rationale),coalesce(target_evidence,'{}'::jsonb),caller,caller_role
  )
  returning id into review_id;

  update public.governance_improvement_candidates
  set status=target_decision,reviewed_by=caller,updated_at=now()
  where id=candidate.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    candidate.project_id,'GOVERNANCE_IMPROVEMENT_REVIEWED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'candidate_id',candidate.id,'candidate_trace_key',candidate.trace_key,
      'decision',target_decision,'governance_effect',false
    )
  );

  return review_id;
end;
$$;

create or replace function private.convert_governance_improvement_to_proposal_v1(
  target_candidate uuid,
  target_proposal_type text default 'process_change'
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  candidate public.governance_improvement_candidates%rowtype;
  caller_role text;
  proposal_id uuid;
  proposal_body text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into candidate
  from public.governance_improvement_candidates
  where id=target_candidate
  for update;
  if not found then raise exception 'Governance improvement candidate not found.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=candidate.project_id and pm.user_id=caller and pm.status='active'
  limit 1;
  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin authority is required to route an improvement into formal governance.';
  end if;

  if candidate.status='converted_to_proposal' and candidate.linked_governance_proposal_id is not null then
    return candidate.linked_governance_proposal_id;
  end if;
  if candidate.status<>'ready_for_governance' then
    raise exception 'Improvement candidate must be human-reviewed as ready_for_governance first.';
  end if;
  if target_proposal_type not in ('process_change','operational_rule','advisory') then
    raise exception 'Improvement candidates may only route to process_change, operational_rule or advisory proposals.';
  end if;

  proposal_body :=
    'Continuous governance improvement candidate '||candidate.trace_key||E'\n\n'||
    'Problem: '||candidate.problem_statement||E'\n\n'||
    'Hypothesis: '||candidate.hypothesis||E'\n\n'||
    'Desired outcome: '||candidate.desired_outcome||E'\n\n'||
    'Observation evidence: '||coalesce(array_to_string(candidate.source_observation_ids,', '),'none')||E'\n'||
    'Standards references: '||coalesce(array_to_string(candidate.standard_refs,', '),'none')||E'\n\n'||
    'Boundary: this proposal remains subject to the existing one-member-one-vote decision process. '||
    'The learning layer cannot vote, close, ratify or change authority.';

  proposal_id:=public.create_governance_proposal_v1(
    candidate.project_id,
    target_proposal_type,
    candidate.title,
    left(candidate.problem_statement,2000),
    proposal_body,
    null,
    null
  );

  update public.governance_improvement_candidates
  set status='converted_to_proposal',
      linked_governance_proposal_id=proposal_id,
      updated_at=now()
  where id=candidate.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    candidate.project_id,'GOVERNANCE_IMPROVEMENT_ROUTED_TO_PROPOSAL',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'candidate_id',candidate.id,'candidate_trace_key',candidate.trace_key,
      'proposal_id',proposal_id,'proposal_type',target_proposal_type,
      'automatic_vote',false,'automatic_decision',false,'automatic_ratification',false
    )
  );

  return proposal_id;
end;
$$;

create or replace function private.run_governance_improvement_cycle_v1(
  target_project uuid,
  target_window_days integer default 90
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  cycle_id uuid:=gen_random_uuid();
  trace text;
  window_end timestamptz:=now();
  window_start timestamptz;
  previous_id uuid;
  eligible_members integer:=0;
  proposal_count integer:=0;
  decision_count integer:=0;
  accepted_count integer:=0;
  distinct_voters integer:=0;
  open_disputes integer:=0;
  resolved_disputes integer:=0;
  high_risk_observations integer:=0;
  open_candidates integer:=0;
  standards_due integer:=0;
  avg_decision_hours numeric;
  avg_resolution_hours numeric;
  metrics jsonb;
  signals jsonb:='[]'::jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project and pm.user_id=caller and pm.status='active'
  limit 1;
  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin authority is required to record a governance review cycle.';
  end if;
  if target_window_days < 7 or target_window_days > 365 then
    raise exception 'Governance review window must be between 7 and 365 days.';
  end if;

  window_start:=window_end-make_interval(days=>target_window_days);

  select id into previous_id
  from public.governance_improvement_cycles
  where project_id=target_project
  order by created_at desc
  limit 1;

  select count(*)::integer into eligible_members
  from public.project_members
  where project_id=target_project and status='active'
    and role in ('owner','admin','operator','viewer');

  select count(*)::integer into proposal_count
  from public.governance_proposals
  where project_id=target_project and created_at>=window_start and created_at<=window_end;

  select
    count(*)::integer,
    count(*) filter(where d.outcome='accepted')::integer,
    avg(extract(epoch from (d.decided_at-p.opens_at))/3600.0)
  into decision_count,accepted_count,avg_decision_hours
  from public.governance_decisions d
  join public.governance_proposals p on p.id=d.proposal_id
  where d.project_id=target_project and d.decided_at>=window_start and d.decided_at<=window_end;

  select count(distinct v.user_id)::integer into distinct_voters
  from public.governance_vote_events v
  where v.project_id=target_project and v.created_at>=window_start and v.created_at<=window_end;

  select count(*)::integer into open_disputes
  from public.governance_disputes
  where project_id=target_project and status='open';

  select
    count(*)::integer,
    avg(extract(epoch from (r.resolved_at-d.filed_at))/3600.0)
  into resolved_disputes,avg_resolution_hours
  from public.governance_dispute_resolutions r
  join public.governance_disputes d on d.id=r.dispute_id
  where r.project_id=target_project and r.resolved_at>=window_start and r.resolved_at<=window_end;

  select count(*)::integer into high_risk_observations
  from public.governance_observations
  where project_id=target_project
    and severity in ('high','critical')
    and observed_at>=window_start and observed_at<=window_end;

  select count(*)::integer into open_candidates
  from public.governance_improvement_candidates
  where project_id=target_project
    and status in ('proposed','needs_evidence','ready_for_governance');

  select count(*)::integer into standards_due
  from public.governance_standards_register
  where project_id=target_project and active=true and review_after<=window_end;

  metrics:=jsonb_build_object(
    'window_days',target_window_days,
    'eligible_member_count',eligible_members,
    'proposal_count',proposal_count,
    'decision_count',decision_count,
    'accepted_decision_count',accepted_count,
    'distinct_voter_count',distinct_voters,
    'open_dispute_count',open_disputes,
    'resolved_dispute_count',resolved_disputes,
    'high_or_critical_observation_count',high_risk_observations,
    'open_improvement_candidate_count',open_candidates,
    'standards_review_due_count',standards_due,
    'average_decision_cycle_hours',case when avg_decision_hours is null then null else round(avg_decision_hours,2) end,
    'average_dispute_resolution_hours',case when avg_resolution_hours is null then null else round(avg_resolution_hours,2) end
  );

  if standards_due>0 then
    signals:=signals||jsonb_build_array(jsonb_build_object(
      'signal','standards_review_due','count',standards_due,
      'meaning','Operational review cadence reached; this is not a standards nonconformity finding.'
    ));
  end if;
  if high_risk_observations>0 then
    signals:=signals||jsonb_build_array(jsonb_build_object(
      'signal','high_risk_observations_present','count',high_risk_observations,
      'meaning','High/critical observations require human evaluation; severity is not proof of a defect.'
    ));
  end if;
  if open_disputes>0 then
    signals:=signals||jsonb_build_array(jsonb_build_object(
      'signal','open_governance_disputes','count',open_disputes,
      'meaning','Open disputes remain unresolved; source records remain unchanged.'
    ));
  end if;

  trace:='DN-GOV-CYCLE-'||upper(substr(replace(cycle_id::text,'-',''),1,16));

  insert into public.governance_improvement_cycles(
    id,project_id,trace_key,window_start,window_end,previous_cycle_id,
    metrics,signals,standards_snapshot,created_by
  )
  values(
    cycle_id,target_project,trace,window_start,window_end,previous_id,
    metrics,signals,
    jsonb_build_object(
      'active_count',(select count(*) from public.governance_standards_register where project_id=target_project and active=true),
      'review_due_count',standards_due,
      'conformity_claim',false
    ),
    caller
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'GOVERNANCE_IMPROVEMENT_CYCLE_RECORDED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'cycle_id',cycle_id,'trace_key',trace,'window_days',target_window_days,
      'signal_count',jsonb_array_length(signals),'governance_effect',false
    )
  );

  return cycle_id;
end;
$$;

create or replace function private.get_governance_improvement_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  standards jsonb;
  observations jsonb;
  candidates jsonb;
  reviews jsonb;
  cycles jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project and pm.user_id=caller and pm.status='active'
  limit 1;

  select coalesce(jsonb_agg(
    to_jsonb(s)||jsonb_build_object('review_due',s.review_after<=now())
    order by s.review_after asc,s.standard_key
  ),'[]'::jsonb)
  into standards
  from (
    select id,standard_key,version,title,authority,edition,applicability_state,
           rationale,source_url,review_after,last_reviewed_at,metadata
    from public.governance_standards_register
    where project_id=target_project and active=true
  ) s;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.observed_at desc),'[]'::jsonb)
  into observations
  from (
    select id,trace_key,source_kind,source_ref,summary,severity,confidence,
           observed_at,recorded_by,recorder_role,authoritative_change,created_at
    from public.governance_observations
    where project_id=target_project
    order by observed_at desc
    limit 100
  ) o;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.updated_at desc),'[]'::jsonb)
  into candidates
  from (
    select id,trace_key,title,problem_statement,hypothesis,desired_outcome,
           source_observation_ids,standard_refs,risk_class,confidence,proposed_change,
           guardrails,status,created_by,reviewed_by,linked_governance_proposal_id,
           governance_effect,created_at,updated_at
    from public.governance_improvement_candidates
    where project_id=target_project
    order by updated_at desc
    limit 100
  ) c;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
  into reviews
  from (
    select id,candidate_id,previous_status,decision,rationale,reviewed_by,
           reviewer_role,created_at
    from public.governance_improvement_reviews
    where project_id=target_project
    order by created_at desc
    limit 200
  ) r;

  select coalesce(jsonb_agg(to_jsonb(cy) order by cy.created_at desc),'[]'::jsonb)
  into cycles
  from (
    select id,trace_key,window_start,window_end,previous_cycle_id,metrics,signals,
           standards_snapshot,created_by,governance_effect,created_at
    from public.governance_improvement_cycles
    where project_id=target_project
    order by created_at desc
    limit 20
  ) cy;

  return jsonb_build_object(
    'role',caller_role,
    'can_manage',caller_role in ('owner','admin'),
    'standards',coalesce(standards,'[]'::jsonb),
    'observations',coalesce(observations,'[]'::jsonb),
    'candidates',coalesce(candidates,'[]'::jsonb),
    'reviews',coalesce(reviews,'[]'::jsonb),
    'cycles',coalesce(cycles,'[]'::jsonb),
    'boundaries',jsonb_build_object(
      'learning_can_vote',false,
      'learning_can_close_proposals',false,
      'learning_can_ratify_protocols',false,
      'learning_can_grant_roles',false,
      'learning_can_change_financial_authority',false,
      'learning_can_amend_contracts',false,
      'evidence_frequency_increases_truth_status',false,
      'formal_governance_route','human_review_then_existing_proposal_vote_ratification'
    )
  );
end;
$$;


-- Exposed RPCs remain SECURITY INVOKER. Privileged mutation lives in the non-exposed
-- private schema, where each function performs its own auth.uid()/project-role checks.
create or replace function public.review_governance_standard_v1(
  target_standard uuid,
  target_applicability_state text,
  target_rationale text,
  target_review_days integer default 90,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.review_governance_standard_v1(
    target_standard,target_applicability_state,target_rationale,target_review_days,target_metadata
  );
$rpc$;

create or replace function public.record_governance_observation_v1(
  target_project uuid,
  target_source_kind text,
  target_summary text,
  target_severity text default 'info',
  target_confidence numeric default null,
  target_source_ref text default null,
  target_evidence jsonb default '{}'::jsonb,
  target_observed_at timestamptz default now()
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.record_governance_observation_v1(
    target_project,target_source_kind,target_summary,target_severity,target_confidence,
    target_source_ref,target_evidence,target_observed_at
  );
$rpc$;

create or replace function public.create_governance_improvement_candidate_v1(
  target_project uuid,
  target_title text,
  target_problem_statement text,
  target_hypothesis text,
  target_desired_outcome text,
  target_source_observation_ids uuid[] default '{}',
  target_standard_refs text[] default '{}',
  target_risk_class text default 'moderate',
  target_confidence numeric default null,
  target_proposed_change jsonb default '{}'::jsonb,
  target_guardrails jsonb default '{}'::jsonb
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.create_governance_improvement_candidate_v1(
    target_project,target_title,target_problem_statement,target_hypothesis,target_desired_outcome,
    target_source_observation_ids,target_standard_refs,target_risk_class,target_confidence,
    target_proposed_change,target_guardrails
  );
$rpc$;

create or replace function public.review_governance_improvement_candidate_v1(
  target_candidate uuid,
  target_decision text,
  target_rationale text,
  target_evidence jsonb default '{}'::jsonb
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.review_governance_improvement_candidate_v1(
    target_candidate,target_decision,target_rationale,target_evidence
  );
$rpc$;

create or replace function public.convert_governance_improvement_to_proposal_v1(
  target_candidate uuid,
  target_proposal_type text default 'process_change'
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.convert_governance_improvement_to_proposal_v1(
    target_candidate,target_proposal_type
  );
$rpc$;

create or replace function public.run_governance_improvement_cycle_v1(
  target_project uuid,
  target_window_days integer default 90
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.run_governance_improvement_cycle_v1(target_project,target_window_days);
$rpc$;

create or replace function public.get_governance_improvement_workspace_v1(
  target_project uuid
) returns jsonb
language sql
stable
security invoker
set search_path=''
as $rpc$
  select private.get_governance_improvement_workspace_v1(target_project);
$rpc$;

alter table public.governance_standards_register enable row level security;
alter table public.governance_observations enable row level security;
alter table public.governance_improvement_candidates enable row level security;
alter table public.governance_improvement_reviews enable row level security;
alter table public.governance_improvement_cycles enable row level security;

drop policy if exists governance_standards_register_select on public.governance_standards_register;
create policy governance_standards_register_select
on public.governance_standards_register for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_observations_select on public.governance_observations;
create policy governance_observations_select
on public.governance_observations for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_improvement_candidates_select on public.governance_improvement_candidates;
create policy governance_improvement_candidates_select
on public.governance_improvement_candidates for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_improvement_reviews_select on public.governance_improvement_reviews;
create policy governance_improvement_reviews_select
on public.governance_improvement_reviews for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_improvement_cycles_select on public.governance_improvement_cycles;
create policy governance_improvement_cycles_select
on public.governance_improvement_cycles for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.governance_standards_register from public,anon,authenticated;
revoke all on table public.governance_observations from public,anon,authenticated;
revoke all on table public.governance_improvement_candidates from public,anon,authenticated;
revoke all on table public.governance_improvement_reviews from public,anon,authenticated;
revoke all on table public.governance_improvement_cycles from public,anon,authenticated;

grant select on table public.governance_standards_register to authenticated;
grant select on table public.governance_observations to authenticated;
grant select on table public.governance_improvement_candidates to authenticated;
grant select on table public.governance_improvement_reviews to authenticated;
grant select on table public.governance_improvement_cycles to authenticated;

revoke execute on function private.seed_continuous_governance_standards_v1(uuid)
  from public,anon,authenticated;
revoke execute on function private.seed_continuous_governance_for_project_v1()
  from public,anon,authenticated;


grant usage on schema private to authenticated;

revoke execute on function private.review_governance_standard_v1(uuid,text,text,integer,jsonb)
  from public,anon;
revoke execute on function private.record_governance_observation_v1(uuid,text,text,text,numeric,text,jsonb,timestamptz)
  from public,anon;
revoke execute on function private.create_governance_improvement_candidate_v1(uuid,text,text,text,text,uuid[],text[],text,numeric,jsonb,jsonb)
  from public,anon;
revoke execute on function private.review_governance_improvement_candidate_v1(uuid,text,text,jsonb)
  from public,anon;
revoke execute on function private.convert_governance_improvement_to_proposal_v1(uuid,text)
  from public,anon;
revoke execute on function private.run_governance_improvement_cycle_v1(uuid,integer)
  from public,anon;
revoke execute on function private.get_governance_improvement_workspace_v1(uuid)
  from public,anon;

grant execute on function private.review_governance_standard_v1(uuid,text,text,integer,jsonb)
  to authenticated;
grant execute on function private.record_governance_observation_v1(uuid,text,text,text,numeric,text,jsonb,timestamptz)
  to authenticated;
grant execute on function private.create_governance_improvement_candidate_v1(uuid,text,text,text,text,uuid[],text[],text,numeric,jsonb,jsonb)
  to authenticated;
grant execute on function private.review_governance_improvement_candidate_v1(uuid,text,text,jsonb)
  to authenticated;
grant execute on function private.convert_governance_improvement_to_proposal_v1(uuid,text)
  to authenticated;
grant execute on function private.run_governance_improvement_cycle_v1(uuid,integer)
  to authenticated;
grant execute on function private.get_governance_improvement_workspace_v1(uuid)
  to authenticated;

revoke execute on function public.review_governance_standard_v1(uuid,text,text,integer,jsonb)
  from public,anon;
revoke execute on function public.record_governance_observation_v1(uuid,text,text,text,numeric,text,jsonb,timestamptz)
  from public,anon;
revoke execute on function public.create_governance_improvement_candidate_v1(uuid,text,text,text,text,uuid[],text[],text,numeric,jsonb,jsonb)
  from public,anon;
revoke execute on function public.review_governance_improvement_candidate_v1(uuid,text,text,jsonb)
  from public,anon;
revoke execute on function public.convert_governance_improvement_to_proposal_v1(uuid,text)
  from public,anon;
revoke execute on function public.run_governance_improvement_cycle_v1(uuid,integer)
  from public,anon;
revoke execute on function public.get_governance_improvement_workspace_v1(uuid)
  from public,anon;

grant execute on function public.review_governance_standard_v1(uuid,text,text,integer,jsonb)
  to authenticated;
grant execute on function public.record_governance_observation_v1(uuid,text,text,text,numeric,text,jsonb,timestamptz)
  to authenticated;
grant execute on function public.create_governance_improvement_candidate_v1(uuid,text,text,text,text,uuid[],text[],text,numeric,jsonb,jsonb)
  to authenticated;
grant execute on function public.review_governance_improvement_candidate_v1(uuid,text,text,jsonb)
  to authenticated;
grant execute on function public.convert_governance_improvement_to_proposal_v1(uuid,text)
  to authenticated;
grant execute on function public.run_governance_improvement_cycle_v1(uuid,integer)
  to authenticated;
grant execute on function public.get_governance_improvement_workspace_v1(uuid)
  to authenticated;

commit;
