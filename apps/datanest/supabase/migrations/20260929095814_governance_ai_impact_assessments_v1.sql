begin;

-- Resonance DataNest Continuous Governance Optimization v1.2
-- Versioned AI impact assessments aligned to the project's ISO/IEC 42005 reference.
-- Assessment evidence informs human governance review; it cannot itself authorize
-- deployment, vote, ratify, change authority, or claim standards conformity.

create table if not exists public.governance_ai_impact_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  assessment_key text not null check (char_length(btrim(assessment_key)) between 3 and 120),
  version bigint not null check (version > 0),
  subject_kind text not null check (subject_kind in (
    'platform','ai_system','model','provider','workflow','product','feature','use_case','release'
  )),
  subject_ref text not null check (char_length(btrim(subject_ref)) between 1 and 500),
  title text not null check (char_length(btrim(title)) between 3 and 300),
  scope text not null check (char_length(btrim(scope)) between 3 and 6000),
  lifecycle_stage text not null check (lifecycle_stage in (
    'design','development','testing','deployment','operation','retirement'
  )),
  trigger_kind text not null check (trigger_kind in (
    'baseline','material_change','new_use_case','provider_change','model_change',
    'data_change','policy_change','incident','periodic_review','other'
  )),
  materiality text not null check (materiality in ('low','moderate','high','critical')),
  affected_parties text[] not null default '{}',
  intended_benefits jsonb not null default '[]'::jsonb,
  potential_harms jsonb not null default '[]'::jsonb,
  mitigations jsonb not null default '[]'::jsonb,
  residual_risk text not null default 'unknown'
    check (residual_risk in ('unknown','low','moderate','high','critical')),
  evidence_refs text[] not null default '{}',
  standard_refs text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','needs_evidence','needs_action','monitor','closed')),
  review_after timestamptz not null default (now()+interval '90 days'),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  creator_role text not null check (creator_role in ('owner','admin','operator')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewer_role text check (reviewer_role is null or reviewer_role in ('owner','admin')),
  reviewed_at timestamptz,
  linked_improvement_candidate_id uuid references public.governance_improvement_candidates(id) on delete set null,
  supersedes_id uuid references public.governance_ai_impact_assessments(id) on delete set null,
  governance_effect boolean not null default false check (governance_effect=false),
  deployment_authority boolean not null default false check (deployment_authority=false),
  conformity_claim boolean not null default false check (conformity_claim=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,assessment_key,version)
);

create unique index if not exists governance_ai_impact_one_active_idx
  on public.governance_ai_impact_assessments(project_id,assessment_key)
  where active=true;
create index if not exists governance_ai_impact_project_idx
  on public.governance_ai_impact_assessments(project_id,active,updated_at desc);
create index if not exists governance_ai_impact_created_by_idx
  on public.governance_ai_impact_assessments(created_by);
create index if not exists governance_ai_impact_reviewed_by_idx
  on public.governance_ai_impact_assessments(reviewed_by)
  where reviewed_by is not null;
create index if not exists governance_ai_impact_candidate_idx
  on public.governance_ai_impact_assessments(linked_improvement_candidate_id)
  where linked_improvement_candidate_id is not null;
create index if not exists governance_ai_impact_supersedes_idx
  on public.governance_ai_impact_assessments(supersedes_id)
  where supersedes_id is not null;

create table if not exists public.governance_ai_impact_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  assessment_id uuid not null references public.governance_ai_impact_assessments(id) on delete restrict,
  assessment_key text not null,
  assessment_version bigint not null,
  previous_status text not null,
  decision text not null check (decision in ('needs_evidence','needs_action','monitor','closed')),
  rationale text not null check (char_length(btrim(rationale)) between 3 and 6000),
  evidence jsonb not null default '{}'::jsonb,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewer_role text not null check (reviewer_role in ('owner','admin')),
  governance_effect boolean not null default false check (governance_effect=false),
  deployment_authority boolean not null default false check (deployment_authority=false),
  created_at timestamptz not null default now()
);

create index if not exists governance_ai_impact_reviews_project_idx
  on public.governance_ai_impact_reviews(project_id,created_at desc);
create index if not exists governance_ai_impact_reviews_assessment_idx
  on public.governance_ai_impact_reviews(assessment_id,created_at desc);
create index if not exists governance_ai_impact_reviews_reviewed_by_idx
  on public.governance_ai_impact_reviews(reviewed_by);

create or replace function private.seed_ai_impact_control_v1(target_project uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_control_id uuid;
begin
  insert into public.governance_control_catalog(
    project_id,control_key,version,title,purpose,control_kind,standard_refs,
    implementation_refs,rationale,metadata,created_by_kind
  )
  values(
    target_project,'CGO-IMP-001',1,'Versioned AI impact assessment lifecycle',
    'Document intended benefits, foreseeable harms, affected parties, mitigations and residual risk across AI lifecycle changes before human governance determines any action.',
    'risk',
    array['iso-iec-42005-2025','iso-iec-23894-2023','iso-iec-42001-2023','nist-ai-rmf-1-0'],
    array['docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md','supabase/migrations/20260929235000_governance_ai_impact_assessments_v1.sql'],
    'Impact assessments are decision-support evidence, not deployment approval, governance authority or a conformity claim.',
    jsonb_build_object(
      'conformity_claim',false,
      'deployment_authority',false,
      'automatic_governance_effect',false
    ),
    'release'
  )
  on conflict(project_id,control_key,version) do nothing;

  select id into v_control_id
  from public.governance_control_catalog
  where project_id=target_project and control_key='CGO-IMP-001' and active=true
  limit 1;

  if v_control_id is not null and not exists(
    select 1 from public.governance_control_evidence e
    where e.project_id=target_project
      and e.control_id=v_control_id
      and e.evidence_kind='migration'
      and e.evidence_ref='supabase/migrations/20260929235000_governance_ai_impact_assessments_v1.sql'
  ) then
    insert into public.governance_control_evidence(
      project_id,control_id,trace_key,evidence_kind,evidence_ref,summary,
      evidence_state,provenance,recorder_role
    )
    values(
      target_project,v_control_id,
      'DN-GOV-EVD-'||upper(substr(md5(target_project::text||':CGO-IMP-001:migration'),1,16)),
      'migration','supabase/migrations/20260929235000_governance_ai_impact_assessments_v1.sql',
      'Source migration implements versioned AI impact assessments and human review routing.',
      'observed',
      jsonb_build_object(
        'claim_scope','source-artifact-present',
        'runtime_pass_claim',false,
        'conformity_claim',false
      ),
      'release'
    );
  end if;
end;
$$;

create or replace function private.seed_ai_impact_control_for_project_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.seed_ai_impact_control_v1(new.id);
  return new;
end;
$$;

drop trigger if exists seed_ai_impact_control_for_project_v1 on public.projects;
create trigger seed_ai_impact_control_for_project_v1
after insert on public.projects
for each row execute function private.seed_ai_impact_control_for_project_v1();

do $$
declare
  p record;
begin
  for p in select id from public.projects loop
    perform private.seed_ai_impact_control_v1(p.id);
  end loop;
end;
$$;

create or replace function private.version_governance_ai_impact_assessment_v1(
  target_project uuid,
  target_assessment_key text,
  target_subject_kind text,
  target_subject_ref text,
  target_title text,
  target_scope text,
  target_lifecycle_stage text,
  target_trigger_kind text,
  target_materiality text,
  target_affected_parties text[] default '{}',
  target_intended_benefits jsonb default '[]'::jsonb,
  target_potential_harms jsonb default '[]'::jsonb,
  target_mitigations jsonb default '[]'::jsonb,
  target_residual_risk text default 'unknown',
  target_evidence_refs text[] default '{}',
  target_standard_refs text[] default array['iso-iec-42005-2025','iso-iec-23894-2023','nist-ai-rmf-1-0'],
  target_review_days integer default 90,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  current_id uuid;
  current_version bigint;
  next_version bigint;
  new_id uuid:=gen_random_uuid();
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=target_project and pm.user_id=caller and pm.status='active'
  limit 1;

  if caller_role is null or caller_role not in ('owner','admin','operator') then
    raise insufficient_privilege using message='Owner, Admin or Operator impact-assessment authoring authority is required.';
  end if;

  if target_subject_kind not in (
    'platform','ai_system','model','provider','workflow','product','feature','use_case','release'
  ) then raise exception 'Unsupported impact-assessment subject kind.'; end if;
  if target_lifecycle_stage not in (
    'design','development','testing','deployment','operation','retirement'
  ) then raise exception 'Unsupported impact-assessment lifecycle stage.'; end if;
  if target_trigger_kind not in (
    'baseline','material_change','new_use_case','provider_change','model_change',
    'data_change','policy_change','incident','periodic_review','other'
  ) then raise exception 'Unsupported impact-assessment trigger.'; end if;
  if target_materiality not in ('low','moderate','high','critical') then
    raise exception 'Unsupported impact-assessment materiality.';
  end if;
  if target_residual_risk not in ('unknown','low','moderate','high','critical') then
    raise exception 'Unsupported impact-assessment residual risk.';
  end if;
  if target_review_days < 30 or target_review_days > 365 then
    raise exception 'Impact-assessment review interval must be between 30 and 365 days.';
  end if;
  if nullif(btrim(coalesce(target_assessment_key,'')),'') is null
     or nullif(btrim(coalesce(target_subject_ref,'')),'') is null
     or nullif(btrim(coalesce(target_title,'')),'') is null
     or nullif(btrim(coalesce(target_scope,'')),'') is null then
    raise exception 'Assessment key, subject reference, title and scope are required.';
  end if;

  if exists(
    select 1 from unnest(coalesce(target_standard_refs,'{}'::text[])) s(key)
    where not exists(
      select 1 from public.governance_standards_register gsr
      where gsr.project_id=target_project and gsr.standard_key=s.key and gsr.active=true
    )
  ) then raise exception 'Impact assessment contains an unknown active standards reference.'; end if;

  select id,version into current_id,current_version
  from public.governance_ai_impact_assessments
  where project_id=target_project and assessment_key=btrim(target_assessment_key) and active=true
  for update;

  next_version:=coalesce(current_version,0)+1;

  if current_id is not null then
    update public.governance_ai_impact_assessments
    set active=false,status='closed',updated_at=now()
    where id=current_id;
  end if;

  insert into public.governance_ai_impact_assessments(
    id,project_id,assessment_key,version,subject_kind,subject_ref,title,scope,
    lifecycle_stage,trigger_kind,materiality,affected_parties,intended_benefits,
    potential_harms,mitigations,residual_risk,evidence_refs,standard_refs,status,
    review_after,metadata,created_by,creator_role,supersedes_id
  )
  values(
    new_id,target_project,btrim(target_assessment_key),next_version,target_subject_kind,
    btrim(target_subject_ref),btrim(target_title),btrim(target_scope),
    target_lifecycle_stage,target_trigger_kind,target_materiality,
    coalesce(target_affected_parties,'{}'::text[]),
    coalesce(target_intended_benefits,'[]'::jsonb),
    coalesce(target_potential_harms,'[]'::jsonb),
    coalesce(target_mitigations,'[]'::jsonb),
    target_residual_risk,
    coalesce(target_evidence_refs,'{}'::text[]),
    coalesce(target_standard_refs,'{}'::text[]),
    'draft',now()+make_interval(days=>target_review_days),
    coalesce(target_metadata,'{}'::jsonb)||jsonb_build_object(
      'conformity_claim',false,
      'deployment_authority',false,
      'automatic_governance_effect',false,
      'assessment_is_decision_support',true
    ),
    caller,caller_role,current_id
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'GOVERNANCE_AI_IMPACT_ASSESSMENT_VERSIONED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'assessment_id',new_id,'assessment_key',btrim(target_assessment_key),
      'version',next_version,'materiality',target_materiality,
      'trigger_kind',target_trigger_kind,'supersedes_id',current_id,
      'governance_effect',false,'deployment_authority',false,'conformity_claim',false
    )
  );

  return new_id;
end;
$$;

create or replace function private.review_governance_ai_impact_assessment_v1(
  target_assessment uuid,
  target_decision text,
  target_rationale text,
  target_evidence jsonb default '{}'::jsonb,
  target_review_days integer default 90
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  assessment public.governance_ai_impact_assessments%rowtype;
  review_id uuid:=gen_random_uuid();
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into assessment
  from public.governance_ai_impact_assessments
  where id=target_assessment and active=true
  for update;

  if not found then raise exception 'Active AI impact assessment not found.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=assessment.project_id and pm.user_id=caller and pm.status='active'
  limit 1;

  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin impact-assessment review authority is required.';
  end if;
  if target_decision not in ('needs_evidence','needs_action','monitor','closed') then
    raise exception 'Unsupported impact-assessment review decision.';
  end if;
  if target_review_days < 30 or target_review_days > 365 then
    raise exception 'Impact-assessment review interval must be between 30 and 365 days.';
  end if;
  if nullif(btrim(coalesce(target_rationale,'')),'') is null then
    raise exception 'Impact-assessment review rationale is required.';
  end if;

  insert into public.governance_ai_impact_reviews(
    id,project_id,assessment_id,assessment_key,assessment_version,previous_status,
    decision,rationale,evidence,reviewed_by,reviewer_role
  )
  values(
    review_id,assessment.project_id,assessment.id,assessment.assessment_key,
    assessment.version,assessment.status,target_decision,btrim(target_rationale),
    coalesce(target_evidence,'{}'::jsonb)||jsonb_build_object(
      'conformity_claim',false,
      'deployment_authority',false,
      'automatic_governance_effect',false
    ),
    caller,caller_role
  );

  update public.governance_ai_impact_assessments
  set status=target_decision,
      reviewed_by=caller,
      reviewer_role=caller_role,
      reviewed_at=now(),
      review_after=now()+make_interval(days=>target_review_days),
      updated_at=now()
  where id=assessment.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    assessment.project_id,'GOVERNANCE_AI_IMPACT_ASSESSMENT_REVIEWED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'assessment_id',assessment.id,'assessment_key',assessment.assessment_key,
      'version',assessment.version,'decision',target_decision,
      'materiality',assessment.materiality,'residual_risk',assessment.residual_risk,
      'governance_effect',false,'deployment_authority',false
    )
  );

  return review_id;
end;
$$;

create or replace function private.route_governance_ai_impact_to_improvement_v1(
  target_assessment uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  assessment public.governance_ai_impact_assessments%rowtype;
  candidate_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into assessment
  from public.governance_ai_impact_assessments
  where id=target_assessment and active=true
  for update;

  if not found then raise exception 'Active AI impact assessment not found.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=assessment.project_id and pm.user_id=caller and pm.status='active'
  limit 1;

  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin impact-routing authority is required.';
  end if;
  if assessment.status<>'needs_action' then
    raise exception 'Impact assessment must be human-reviewed as needs_action before governance routing.';
  end if;
  if assessment.linked_improvement_candidate_id is not null then
    return assessment.linked_improvement_candidate_id;
  end if;

  candidate_id:=private.create_governance_improvement_candidate_v1(
    assessment.project_id,
    'Impact response · '||assessment.title,
    'A reviewed AI impact assessment requires action for '||assessment.subject_kind||' '||assessment.subject_ref||'.',
    'A governed response to the documented impacts and residual risk can reduce or better control the assessed harm without bypassing Sovereign Governance.',
    'Document and govern a proportionate response while preserving affected-party, evidence, risk and rollback requirements.',
    '{}'::uuid[],
    assessment.standard_refs,
    case when assessment.materiality in ('high','critical') then assessment.materiality else 'moderate' end,
    null,
    jsonb_build_object(
      'source','ai_impact_assessment',
      'assessment_id',assessment.id,
      'assessment_key',assessment.assessment_key,
      'assessment_version',assessment.version,
      'subject_kind',assessment.subject_kind,
      'subject_ref',assessment.subject_ref,
      'materiality',assessment.materiality,
      'residual_risk',assessment.residual_risk
    ),
    jsonb_build_object(
      'preserve_sovereign_governance',true,
      'no_automatic_deployment',true,
      'no_automatic_vote',true,
      'no_automatic_ratification',true
    )
  );

  update public.governance_ai_impact_assessments
  set linked_improvement_candidate_id=candidate_id,updated_at=now()
  where id=assessment.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    assessment.project_id,'GOVERNANCE_AI_IMPACT_ROUTED_TO_IMPROVEMENT',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'assessment_id',assessment.id,
      'candidate_id',candidate_id,
      'automatic_vote',false,
      'automatic_decision',false,
      'automatic_deployment',false
    )
  );

  return candidate_id;
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
  controls jsonb;
  control_evidence jsonb;
  standard_watch jsonb;
  impact_assessments jsonb;
  impact_reviews jsonb;
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

  select coalesce(jsonb_agg(to_jsonb(gc) order by gc.control_key),'[]'::jsonb)
  into controls
  from (
    select c.id,c.control_key,c.version,c.title,c.purpose,c.control_kind,c.standard_refs,
           c.implementation_refs,c.rationale,c.metadata,c.governance_effect,c.created_at,
           (select count(*) from public.governance_control_evidence e where e.control_id=c.id)::integer as evidence_count,
           (select max(e.observed_at) from public.governance_control_evidence e where e.control_id=c.id) as latest_evidence_at
    from public.governance_control_catalog c
    where c.project_id=target_project and c.active=true
  ) gc;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.observed_at desc),'[]'::jsonb)
  into control_evidence
  from (
    select id,control_id,trace_key,evidence_kind,evidence_ref,evidence_digest,summary,
           evidence_state,provenance,observed_at,recorder_role,authoritative_change,created_at
    from public.governance_control_evidence
    where project_id=target_project
    order by observed_at desc
    limit 150
  ) e;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.observed_at desc),'[]'::jsonb)
  into standard_watch
  from (
    select id,standard_id,standard_key,observation_id,trace_key,event_type,
           source_authority,source_url,observed_edition,summary,evidence,observed_at,
           recorder_role,authoritative_change,created_at
    from public.governance_standard_watch_events
    where project_id=target_project
    order by observed_at desc
    limit 100
  ) w;

  select coalesce(jsonb_agg(
    to_jsonb(a)||jsonb_build_object('review_due',a.review_after<=now())
    order by a.updated_at desc
  ),'[]'::jsonb)
  into impact_assessments
  from (
    select id,assessment_key,version,subject_kind,subject_ref,title,scope,lifecycle_stage,
           trigger_kind,materiality,affected_parties,intended_benefits,potential_harms,
           mitigations,residual_risk,evidence_refs,standard_refs,status,review_after,
           reviewed_at,linked_improvement_candidate_id,governance_effect,
           deployment_authority,conformity_claim,created_at,updated_at
    from public.governance_ai_impact_assessments
    where project_id=target_project and active=true
    order by updated_at desc
    limit 100
  ) a;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
  into impact_reviews
  from (
    select id,assessment_id,assessment_key,assessment_version,previous_status,
           decision,rationale,reviewer_role,governance_effect,deployment_authority,created_at
    from public.governance_ai_impact_reviews
    where project_id=target_project
    order by created_at desc
    limit 200
  ) r;

  return jsonb_build_object(
    'role',caller_role,
    'can_manage',caller_role in ('owner','admin'),
    'can_record_control_evidence',caller_role in ('owner','admin','operator'),
    'can_author_impact_assessment',caller_role in ('owner','admin','operator'),
    'standards',coalesce(standards,'[]'::jsonb),
    'observations',coalesce(observations,'[]'::jsonb),
    'candidates',coalesce(candidates,'[]'::jsonb),
    'reviews',coalesce(reviews,'[]'::jsonb),
    'cycles',coalesce(cycles,'[]'::jsonb),
    'controls',coalesce(controls,'[]'::jsonb),
    'control_evidence',coalesce(control_evidence,'[]'::jsonb),
    'standard_watch',coalesce(standard_watch,'[]'::jsonb),
    'impact_assessments',coalesce(impact_assessments,'[]'::jsonb),
    'impact_reviews',coalesce(impact_reviews,'[]'::jsonb),
    'boundaries',jsonb_build_object(
      'learning_can_vote',false,
      'learning_can_close_proposals',false,
      'learning_can_ratify_protocols',false,
      'learning_can_grant_roles',false,
      'learning_can_change_financial_authority',false,
      'learning_can_amend_contracts',false,
      'evidence_frequency_increases_truth_status',false,
      'standards_watch_can_mutate_register',false,
      'control_catalog_creates_authority',false,
      'impact_assessment_creates_deployment_authority',false,
      'impact_assessment_creates_governance_authority',false,
      'formal_governance_route','human_review_then_existing_proposal_vote_ratification'
    )
  );
end;
$$;

create or replace function public.version_governance_ai_impact_assessment_v1(
  target_project uuid,
  target_assessment_key text,
  target_subject_kind text,
  target_subject_ref text,
  target_title text,
  target_scope text,
  target_lifecycle_stage text,
  target_trigger_kind text,
  target_materiality text,
  target_affected_parties text[] default '{}',
  target_intended_benefits jsonb default '[]'::jsonb,
  target_potential_harms jsonb default '[]'::jsonb,
  target_mitigations jsonb default '[]'::jsonb,
  target_residual_risk text default 'unknown',
  target_evidence_refs text[] default '{}',
  target_standard_refs text[] default array['iso-iec-42005-2025','iso-iec-23894-2023','nist-ai-rmf-1-0'],
  target_review_days integer default 90,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.version_governance_ai_impact_assessment_v1(
    target_project,target_assessment_key,target_subject_kind,target_subject_ref,
    target_title,target_scope,target_lifecycle_stage,target_trigger_kind,target_materiality,
    target_affected_parties,target_intended_benefits,target_potential_harms,target_mitigations,
    target_residual_risk,target_evidence_refs,target_standard_refs,target_review_days,target_metadata
  );
$rpc$;

create or replace function public.review_governance_ai_impact_assessment_v1(
  target_assessment uuid,
  target_decision text,
  target_rationale text,
  target_evidence jsonb default '{}'::jsonb,
  target_review_days integer default 90
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.review_governance_ai_impact_assessment_v1(
    target_assessment,target_decision,target_rationale,target_evidence,target_review_days
  );
$rpc$;

create or replace function public.route_governance_ai_impact_to_improvement_v1(
  target_assessment uuid
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.route_governance_ai_impact_to_improvement_v1(target_assessment);
$rpc$;

alter table public.governance_ai_impact_assessments enable row level security;
alter table public.governance_ai_impact_reviews enable row level security;

drop policy if exists governance_ai_impact_assessments_select on public.governance_ai_impact_assessments;
create policy governance_ai_impact_assessments_select
on public.governance_ai_impact_assessments for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_ai_impact_reviews_select on public.governance_ai_impact_reviews;
create policy governance_ai_impact_reviews_select
on public.governance_ai_impact_reviews for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.governance_ai_impact_assessments from public,anon,authenticated;
revoke all on table public.governance_ai_impact_reviews from public,anon,authenticated;

grant select on table public.governance_ai_impact_assessments to authenticated;
grant select on table public.governance_ai_impact_reviews to authenticated;

revoke execute on function private.seed_ai_impact_control_v1(uuid)
  from public,anon,authenticated;
revoke execute on function private.seed_ai_impact_control_for_project_v1()
  from public,anon,authenticated;

grant usage on schema private to authenticated;

revoke execute on function private.version_governance_ai_impact_assessment_v1(
  uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb,jsonb,text,text[],text[],integer,jsonb
) from public,anon;
revoke execute on function private.review_governance_ai_impact_assessment_v1(
  uuid,text,text,jsonb,integer
) from public,anon;
revoke execute on function private.route_governance_ai_impact_to_improvement_v1(uuid)
  from public,anon;

grant execute on function private.version_governance_ai_impact_assessment_v1(
  uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb,jsonb,text,text[],text[],integer,jsonb
) to authenticated;
grant execute on function private.review_governance_ai_impact_assessment_v1(
  uuid,text,text,jsonb,integer
) to authenticated;
grant execute on function private.route_governance_ai_impact_to_improvement_v1(uuid)
  to authenticated;

revoke execute on function public.version_governance_ai_impact_assessment_v1(
  uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb,jsonb,text,text[],text[],integer,jsonb
) from public,anon;
revoke execute on function public.review_governance_ai_impact_assessment_v1(
  uuid,text,text,jsonb,integer
) from public,anon;
revoke execute on function public.route_governance_ai_impact_to_improvement_v1(uuid)
  from public,anon;

grant execute on function public.version_governance_ai_impact_assessment_v1(
  uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb,jsonb,text,text[],text[],integer,jsonb
) to authenticated;
grant execute on function public.review_governance_ai_impact_assessment_v1(
  uuid,text,text,jsonb,integer
) to authenticated;
grant execute on function public.route_governance_ai_impact_to_improvement_v1(uuid)
  to authenticated;

commit;
