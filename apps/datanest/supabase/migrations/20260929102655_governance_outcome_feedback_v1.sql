begin;

-- Resonance DataNest Continuous Governance Optimization v1.3
-- Bridges adverse Certified Memory outcome evidence into Governance observations only
-- after explicit Owner/Admin routing. The bridge never changes Certified Memory truth,
-- certification, confidence, governance authority, or proposal state automatically.

create table if not exists public.governance_outcome_feedback_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_outcome_evidence_id uuid not null unique,
  memory_id uuid not null,
  usage_receipt_id uuid not null,
  observation_id uuid not null references public.governance_observations(id) on delete restrict,
  signal text not null check (signal in ('challenged','contradicted')),
  outcome_kind text not null check (
    outcome_kind in ('human_review','external_audit','test_result','job_result','operator_observation')
  ),
  rationale text not null check (char_length(btrim(rationale)) between 3 and 4000),
  routed_by uuid references auth.users(id) on delete set null,
  router_role text not null check (router_role in ('owner','admin')),
  authoritative_change boolean not null default false check (authoritative_change=false),
  memory_truth_changed boolean not null default false check (memory_truth_changed=false),
  automatic_candidate_created boolean not null default false check (automatic_candidate_created=false),
  created_at timestamptz not null default now()
);

create index if not exists governance_outcome_feedback_project_idx
  on public.governance_outcome_feedback_links(project_id,created_at desc);
create index if not exists governance_outcome_feedback_observation_idx
  on public.governance_outcome_feedback_links(observation_id);
create index if not exists governance_outcome_feedback_routed_by_idx
  on public.governance_outcome_feedback_links(routed_by)
  where routed_by is not null;

create or replace function private.seed_governance_outcome_feedback_control_v1(target_project uuid)
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
    target_project,'CGO-OUT-001',1,'Governed outcome-feedback bridge',
    'Route adverse Certified Memory use outcomes into governance observations after explicit human review without changing memory truth status or bypassing formal governance.',
    'knowledge',
    array['iso-30401-2018','iso-iec-42001-2023','iso-iec-5259-series','nist-ai-rmf-1-0'],
    array[
      'docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md',
      'supabase/migrations/20260929240000_governance_outcome_feedback_v1.sql',
      'supabase/migrations/20260929090500_add_verified_memory_outcome_evidence.sql'
    ],
    'Outcome evidence may trigger review and governance observation routing; it does not automatically alter Certified Memory certification, confidence, governance authority or proposal state.',
    jsonb_build_object(
      'truth_status_change',false,
      'certification_change',false,
      'confidence_change',false,
      'automatic_candidate_creation',false,
      'automatic_governance_effect',false
    ),
    'release'
  )
  on conflict(project_id,control_key,version) do nothing;

  select id into v_control_id
  from public.governance_control_catalog
  where project_id=target_project and control_key='CGO-OUT-001' and active=true
  limit 1;

  if v_control_id is not null and not exists(
    select 1 from public.governance_control_evidence e
    where e.project_id=target_project
      and e.control_id=v_control_id
      and e.evidence_kind='migration'
      and e.evidence_ref='supabase/migrations/20260929240000_governance_outcome_feedback_v1.sql'
  ) then
    insert into public.governance_control_evidence(
      project_id,control_id,trace_key,evidence_kind,evidence_ref,summary,
      evidence_state,provenance,recorder_role
    )
    values(
      target_project,v_control_id,
      'DN-GOV-EVD-'||upper(substr(md5(target_project::text||':CGO-OUT-001:migration'),1,16)),
      'migration','supabase/migrations/20260929240000_governance_outcome_feedback_v1.sql',
      'Source migration implements explicit adverse Certified Memory outcome routing into governance observations.',
      'observed',
      jsonb_build_object(
        'claim_scope','source-artifact-present',
        'runtime_pass_claim',false,
        'memory_truth_changed',false,
        'automatic_candidate_created',false
      ),
      'release'
    );
  end if;
end;
$$;

create or replace function private.seed_governance_outcome_feedback_for_project_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.seed_governance_outcome_feedback_control_v1(new.id);
  return new;
end;
$$;

drop trigger if exists seed_governance_outcome_feedback_for_project_v1 on public.projects;
create trigger seed_governance_outcome_feedback_for_project_v1
after insert on public.projects
for each row execute function private.seed_governance_outcome_feedback_for_project_v1();

do $$
declare
  p record;
begin
  for p in select id from public.projects loop
    perform private.seed_governance_outcome_feedback_control_v1(p.id);
  end loop;
end;
$$;

create or replace function private.route_certified_memory_outcome_to_governance_v1(
  target_outcome_evidence uuid,
  target_governance_summary text,
  target_rationale text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  outcome public.certified_memory_outcome_evidence%rowtype;
  existing_observation uuid;
  observation_id uuid;
  severity text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if nullif(btrim(coalesce(target_governance_summary,'')),'') is null
     or nullif(btrim(coalesce(target_rationale,'')),'') is null then
    raise exception 'Governance summary and routing rationale are required.';
  end if;

  select * into outcome
  from public.certified_memory_outcome_evidence
  where id=target_outcome_evidence
  for update;

  if not found then
    raise exception 'Certified Memory outcome evidence not found.';
  end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=outcome.project_id
    and pm.user_id=caller
    and pm.status='active'
  limit 1;

  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin outcome-feedback routing authority is required.';
  end if;

  if outcome.signal not in ('challenged','contradicted') then
    raise exception 'Only challenged or contradicted Certified Memory outcomes can be routed as adverse governance feedback.';
  end if;

  select l.observation_id into existing_observation
  from public.governance_outcome_feedback_links l
  where l.source_outcome_evidence_id=outcome.id
  limit 1;

  if existing_observation is not null then
    return existing_observation;
  end if;

  severity:=case when outcome.signal='contradicted' then 'high' else 'moderate' end;

  observation_id:=private.record_governance_observation_v1(
    outcome.project_id,
    'certified_memory_review',
    btrim(target_governance_summary),
    severity,
    null,
    'certified-memory-outcome:'||outcome.id::text,
    jsonb_build_object(
      'source','certified_memory_outcome_evidence',
      'outcome_evidence_id',outcome.id,
      'memory_id',outcome.memory_id,
      'usage_receipt_id',outcome.usage_receipt_id,
      'signal',outcome.signal,
      'outcome_kind',outcome.outcome_kind,
      'review_triggered',outcome.review_triggered,
      'source_created_at',outcome.created_at,
      'routing_rationale',btrim(target_rationale),
      'truth_status_changed',false,
      'certification_changed',false,
      'confidence_changed',false,
      'automatic_candidate_created',false
    ),
    outcome.created_at
  );

  insert into public.governance_outcome_feedback_links(
    project_id,source_outcome_evidence_id,memory_id,usage_receipt_id,observation_id,
    signal,outcome_kind,rationale,routed_by,router_role
  )
  values(
    outcome.project_id,outcome.id,outcome.memory_id,outcome.usage_receipt_id,observation_id,
    outcome.signal,outcome.outcome_kind,btrim(target_rationale),caller,caller_role
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    outcome.project_id,'GOVERNANCE_OUTCOME_FEEDBACK_ROUTED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'outcome_evidence_id',outcome.id,
      'observation_id',observation_id,
      'memory_id',outcome.memory_id,
      'signal',outcome.signal,
      'truth_status_changed',false,
      'certification_changed',false,
      'confidence_changed',false,
      'automatic_candidate_created',false,
      'governance_effect',false
    )
  );

  return observation_id;
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
  outcome_feedback jsonb;
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

  if caller_role in ('owner','admin') then
    select coalesce(jsonb_agg(to_jsonb(ofb) order by ofb.created_at desc),'[]'::jsonb)
    into outcome_feedback
    from (
      select
        o.id as outcome_evidence_id,
        o.memory_id,
        o.usage_receipt_id,
        o.signal,
        o.outcome_kind,
        o.summary,
        o.review_triggered,
        o.created_at,
        l.id as feedback_link_id,
        l.observation_id,
        l.rationale as routing_rationale,
        l.created_at as routed_at,
        (l.id is not null) as routed
      from public.certified_memory_outcome_evidence o
      left join public.governance_outcome_feedback_links l
        on l.project_id=o.project_id
       and l.source_outcome_evidence_id=o.id
      where o.project_id=target_project
        and o.signal in ('challenged','contradicted')
      order by o.created_at desc
      limit 100
    ) ofb;
  else
    outcome_feedback:='[]'::jsonb;
  end if;

  return jsonb_build_object(
    'role',caller_role,
    'can_manage',caller_role in ('owner','admin'),
    'can_record_control_evidence',caller_role in ('owner','admin','operator'),
    'can_author_impact_assessment',caller_role in ('owner','admin','operator'),
    'can_route_outcome_feedback',caller_role in ('owner','admin'),
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
    'outcome_feedback',coalesce(outcome_feedback,'[]'::jsonb),
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
      'outcome_feedback_changes_memory_truth_status',false,
      'outcome_feedback_creates_improvement_candidate_automatically',false,
      'formal_governance_route','human_review_then_existing_proposal_vote_ratification'
    )
  );
end;
$$;



create or replace function public.route_certified_memory_outcome_to_governance_v1(
  target_outcome_evidence uuid,
  target_governance_summary text,
  target_rationale text
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.route_certified_memory_outcome_to_governance_v1(
    target_outcome_evidence,target_governance_summary,target_rationale
  );
$rpc$;

alter table public.governance_outcome_feedback_links enable row level security;

drop policy if exists governance_outcome_feedback_links_select on public.governance_outcome_feedback_links;
create policy governance_outcome_feedback_links_select
on public.governance_outcome_feedback_links for select to authenticated
using (
  exists(
    select 1
    from public.project_members pm
    where pm.project_id=governance_outcome_feedback_links.project_id
      and pm.user_id=(select auth.uid())
      and pm.status='active'
      and pm.role in ('owner','admin')
  )
);

revoke all on table public.governance_outcome_feedback_links from public,anon,authenticated;
grant select on table public.governance_outcome_feedback_links to authenticated;

revoke execute on function private.seed_governance_outcome_feedback_control_v1(uuid)
  from public,anon,authenticated;
revoke execute on function private.seed_governance_outcome_feedback_for_project_v1()
  from public,anon,authenticated;

grant usage on schema private to authenticated;

revoke execute on function private.route_certified_memory_outcome_to_governance_v1(uuid,text,text)
  from public,anon;
grant execute on function private.route_certified_memory_outcome_to_governance_v1(uuid,text,text)
  to authenticated;

revoke execute on function public.route_certified_memory_outcome_to_governance_v1(uuid,text,text)
  from public,anon;
grant execute on function public.route_certified_memory_outcome_to_governance_v1(uuid,text,text)
  to authenticated;

commit;
