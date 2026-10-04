begin;

-- Governance Control Effectiveness Monitoring v1
-- Authorized by governance decision DN-GOV-DEC-940A1C11150442E6.
-- This layer observes, records and alerts. It does not vote, decide, ratify,
-- deploy, grant authority, amend contracts, or turn evidence frequency into truth.

create table if not exists public.governance_control_runtime_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  control_key text not null check (char_length(btrim(control_key)) between 3 and 120),
  event_type text not null check (char_length(btrim(event_type)) between 3 and 160),
  target_kind text not null check (char_length(btrim(target_kind)) between 3 and 120),
  target_id uuid,
  outcome text,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  governance_effect boolean not null default false check (governance_effect=false)
);

create index if not exists governance_control_runtime_events_project_idx
  on public.governance_control_runtime_events(project_id,observed_at desc);
create index if not exists governance_control_runtime_events_control_idx
  on public.governance_control_runtime_events(project_id,control_key,observed_at desc);

create table if not exists public.governance_control_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trigger_kind text not null check (trigger_kind in ('cron','owner','release')),
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  check_count integer not null default 0 check (check_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  summary text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  initiated_by uuid references auth.users(id) on delete set null,
  governance_effect boolean not null default false check (governance_effect=false),
  deployment_authority boolean not null default false check (deployment_authority=false)
);

create index if not exists governance_control_monitor_runs_project_idx
  on public.governance_control_monitor_runs(project_id,started_at desc);
create index if not exists governance_control_monitor_runs_initiated_by_idx
  on public.governance_control_monitor_runs(initiated_by)
  where initiated_by is not null;

create table if not exists public.governance_control_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  control_id uuid not null references public.governance_control_catalog(id) on delete restrict,
  last_run_id uuid references public.governance_control_monitor_runs(id) on delete set null,
  trace_key text not null unique,
  check_key text not null check (char_length(btrim(check_key)) between 3 and 160),
  severity text not null check (severity in ('low','moderate','high','critical')),
  state text not null default 'open' check (state in ('open','acknowledged','resolved')),
  summary text not null check (char_length(btrim(summary)) between 3 and 4000),
  details jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  acknowledgement_rationale text,
  resolved_at timestamptz,
  governance_effect boolean not null default false check (governance_effect=false),
  deployment_authority boolean not null default false check (deployment_authority=false),
  unique(project_id,check_key)
);

create index if not exists governance_control_alerts_project_idx
  on public.governance_control_alerts(project_id,state,severity,last_detected_at desc);
create index if not exists governance_control_alerts_control_idx
  on public.governance_control_alerts(control_id,last_detected_at desc);
create index if not exists governance_control_alerts_last_run_idx
  on public.governance_control_alerts(last_run_id)
  where last_run_id is not null;
create index if not exists governance_control_alerts_acknowledged_by_idx
  on public.governance_control_alerts(acknowledged_by)
  where acknowledged_by is not null;

insert into public.governance_control_catalog(
  project_id,control_key,version,title,purpose,control_kind,
  standard_refs,implementation_refs,rationale,metadata,active,
  created_by,created_by_kind,governance_effect
)
select
  p.id,
  'CGO-MON-001',
  1,
  'Governance control effectiveness monitoring',
  'Continuously observe governance control operation, preserve non-sensitive runtime evidence, and surface anomalies for human owner review without creating governance or deployment authority.',
  'evidence',
  array['iso-iec-42001-2023','iso-iec-23894-2023','nist-ai-rmf-1-0','iso-iec-38507-2022']::text[],
  array[
    'supabase/migrations/20260929241000_governance_control_effectiveness_monitoring_v1.sql',
    'tests/unit/governance-control-effectiveness-monitoring.test.mjs',
    'src/components/GovernanceControlMonitor.tsx',
    '.github/workflows/ci.yml'
  ]::text[],
  'Accepted governance decision DN-GOV-DEC-940A1C11150442E6 authorizes observability-only control monitoring. Monitoring evidence is descriptive and does not itself change authority or governance.',
  jsonb_build_object(
    'decision_trace','DN-GOV-DEC-940A1C11150442E6',
    'proposal_trace','DN-GOV-PROP-64DF5385966A4D12',
    'conformity_claim',false,
    'automatic_governance_effect',false,
    'automatic_deployment',false
  ),
  true,
  null,
  'release',
  false
from public.projects p
where p.slug='resonance-datanest'
on conflict (project_id,control_key,version) do nothing;

create or replace function private.capture_governance_decision_control_event_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $fn$
begin
  insert into public.governance_control_runtime_events(
    project_id,control_key,event_type,target_kind,target_id,outcome,metadata
  )
  values(
    new.project_id,'CGO-AUTH-001','governance_decision_recorded','governance_decision',
    new.id,new.outcome,
    jsonb_build_object(
      'quorum_met',new.quorum_met,
      'independent_support',new.independent_support,
      'contractual_effect',new.contractual_effect,
      'ownership_effect',new.ownership_effect,
      'financial_authority_effect',new.financial_authority_effect,
      'role_authority_effect',new.role_authority_effect
    )
  );
  return new;
end;
$fn$;

drop trigger if exists governance_decision_control_event on public.governance_decisions;
create trigger governance_decision_control_event
after insert on public.governance_decisions
for each row execute function private.capture_governance_decision_control_event_v1();

create or replace function private.capture_outcome_feedback_control_event_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $fn$
begin
  insert into public.governance_control_runtime_events(
    project_id,control_key,event_type,target_kind,target_id,outcome,metadata
  )
  values(
    new.project_id,'CGO-OUT-001','outcome_feedback_routed','outcome_feedback_link',
    new.id,'routed',
    jsonb_build_object(
      'signal',new.signal,
      'outcome_kind',new.outcome_kind,
      'authoritative_change',new.authoritative_change,
      'memory_truth_changed',new.memory_truth_changed,
      'automatic_candidate_created',new.automatic_candidate_created
    )
  );
  return new;
end;
$fn$;

drop trigger if exists outcome_feedback_control_event on public.governance_outcome_feedback_links;
create trigger outcome_feedback_control_event
after insert on public.governance_outcome_feedback_links
for each row execute function private.capture_outcome_feedback_control_event_v1();

create or replace function private.capture_ai_impact_control_event_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $fn$
begin
  insert into public.governance_control_runtime_events(
    project_id,control_key,event_type,target_kind,target_id,outcome,metadata
  )
  values(
    new.project_id,'CGO-IMP-001','ai_impact_assessment_state','ai_impact_assessment',
    new.id,new.status,
    jsonb_build_object(
      'lifecycle_stage',new.lifecycle_stage,
      'trigger_kind',new.trigger_kind,
      'materiality',new.materiality,
      'residual_risk',new.residual_risk,
      'active',new.active,
      'governance_effect',new.governance_effect,
      'deployment_authority',new.deployment_authority,
      'conformity_claim',new.conformity_claim
    )
  );
  return new;
end;
$fn$;

drop trigger if exists ai_impact_control_event on public.governance_ai_impact_assessments;
create trigger ai_impact_control_event
after insert or update of status,review_after,active on public.governance_ai_impact_assessments
for each row execute function private.capture_ai_impact_control_event_v1();

create or replace function private.capture_optimizer_authority_control_event_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $fn$
begin
  insert into public.governance_control_runtime_events(
    project_id,control_key,event_type,target_kind,target_id,outcome,metadata
  )
  values(
    new.project_id,'CGO-AUTH-001','optimizer_suggestion_state','optimizer_suggestion',
    new.id,new.status,
    jsonb_build_object(
      'governance_effect',new.governance_effect,
      'deployment_authority',new.deployment_authority,
      'linked_observation',new.linked_observation_id is not null,
      'linked_candidate',new.linked_improvement_candidate_id is not null
    )
  );
  return new;
end;
$fn$;

drop trigger if exists optimizer_authority_control_event on public.optimizer_suggestions;
create trigger optimizer_authority_control_event
after insert or update of status on public.optimizer_suggestions
for each row execute function private.capture_optimizer_authority_control_event_v1();

create or replace function private.record_control_monitor_evidence_v1(
  target_project uuid,
  target_control_key text,
  target_run uuid,
  target_check_key text,
  target_passed boolean,
  target_summary text,
  target_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $fn$
declare
  control_row public.governance_control_catalog%rowtype;
  evidence_id uuid := gen_random_uuid();
begin
  select *
  into control_row
  from public.governance_control_catalog c
  where c.project_id=target_project
    and c.control_key=target_control_key
    and c.active=true
  order by c.version desc
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.governance_control_evidence(
    id,project_id,control_id,trace_key,evidence_kind,evidence_ref,
    summary,evidence_state,provenance,observed_at,recorded_by,recorder_role,
    authoritative_change
  )
  values(
    evidence_id,target_project,control_row.id,
    'DN-GOV-CTL-EV-' || upper(substr(replace(evidence_id::text,'-',''),1,16)),
    'observation',
    'control-monitor:' || target_run::text || ':' || target_check_key,
    left(target_summary,4000),
    case when target_passed then 'passed' else 'failed' end,
    jsonb_build_object(
      'source','governance-control-monitor',
      'monitor_run_id',target_run,
      'check_key',target_check_key,
      'details',coalesce(target_details,'{}'::jsonb),
      'evidence_does_not_equal_truth',true,
      'governance_effect',false
    ),
    now(),null,'release',false
  );

  return evidence_id;
end;
$fn$;

create or replace function private.sync_control_monitor_alert_v1(
  target_project uuid,
  target_control_key text,
  target_run uuid,
  target_check_key text,
  target_failed boolean,
  target_severity text,
  target_summary text,
  target_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $fn$
declare
  control_id uuid;
  alert_id uuid;
begin
  select c.id
  into control_id
  from public.governance_control_catalog c
  where c.project_id=target_project
    and c.control_key=target_control_key
    and c.active=true
  order by c.version desc
  limit 1;

  if control_id is null then
    return null;
  end if;

  if target_failed then
    insert into public.governance_control_alerts(
      project_id,control_id,last_run_id,trace_key,check_key,severity,state,
      summary,details,occurrence_count,first_detected_at,last_detected_at,
      governance_effect,deployment_authority
    )
    values(
      target_project,control_id,target_run,
      'DN-GOV-CTL-AL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
      target_check_key,target_severity,'open',left(target_summary,4000),
      coalesce(target_details,'{}'::jsonb),1,now(),now(),false,false
    )
    on conflict (project_id,check_key)
    do update set
      control_id=excluded.control_id,
      last_run_id=excluded.last_run_id,
      severity=excluded.severity,
      state=case
        when public.governance_control_alerts.state='acknowledged' then 'acknowledged'
        else 'open'
      end,
      summary=excluded.summary,
      details=excluded.details,
      occurrence_count=public.governance_control_alerts.occurrence_count+1,
      last_detected_at=now(),
      resolved_at=null
    returning id into alert_id;
  else
    update public.governance_control_alerts
    set state='resolved',
        last_run_id=target_run,
        resolved_at=now(),
        details=coalesce(target_details,'{}'::jsonb)
    where project_id=target_project
      and check_key=target_check_key
      and state in ('open','acknowledged')
    returning id into alert_id;
  end if;

  return alert_id;
end;
$fn$;

create or replace function private.run_governance_control_monitor_core_v1(
  target_project uuid,
  target_trigger text,
  target_actor uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $fn$
declare
  run_id uuid := gen_random_uuid();
  check_total integer := 0;
  failed_total integer := 0;
  issue_count integer := 0;
  request_count integer := 0;
  active_assessment_count integer := 0;
  overdue_assessment_count integer := 0;
  recent_release_evidence integer := 0;
  details jsonb;
  passed boolean;
begin
  if target_trigger not in ('cron','owner','release') then
    raise exception 'Unsupported monitor trigger.';
  end if;

  if not exists(select 1 from public.projects p where p.id=target_project) then
    raise exception 'Project not found.';
  end if;

  insert into public.governance_control_monitor_runs(
    id,project_id,trigger_kind,status,initiated_by
  )
  values(run_id,target_project,target_trigger,'running',target_actor);

  -- 1. Authority firewall invariants.
  select
    (select count(*) from public.governance_observations o
      where o.project_id=target_project and o.authoritative_change=true)
    +(select count(*) from public.governance_improvement_candidates c
      where c.project_id=target_project and c.governance_effect=true)
    +(select count(*) from public.governance_ai_impact_assessments a
      where a.project_id=target_project
        and (a.governance_effect=true or a.deployment_authority=true or a.conformity_claim=true))
    +(select count(*) from public.optimizer_suggestions s
      where s.project_id=target_project
        and (s.governance_effect=true or s.deployment_authority=true))
    +(select count(*) from public.governance_proposals p
      where p.project_id=target_project
        and (p.contractual_effect=true or p.ownership_effect=true
          or p.financial_authority_effect=true or p.role_authority_effect=true))
    +(select count(*) from public.governance_decisions d
      where d.project_id=target_project
        and (d.contractual_effect=true or d.ownership_effect=true
          or d.financial_authority_effect=true or d.role_authority_effect=true))
  into issue_count;

  check_total := check_total+1;
  passed := coalesce(issue_count,0)=0;
  if not passed then failed_total:=failed_total+1; end if;
  details:=jsonb_build_object('persisted_authority_boundary_violations',coalesce(issue_count,0));
  perform private.record_control_monitor_evidence_v1(
    target_project,'CGO-AUTH-001',run_id,'authority_firewall',passed,
    case when passed
      then 'Authority firewall invariants remain intact.'
      else 'Persisted authority-boundary violations were detected and require owner review.'
    end,details
  );
  perform private.sync_control_monitor_alert_v1(
    target_project,'CGO-AUTH-001',run_id,'authority_firewall',not passed,'critical',
    'Governance authority firewall integrity check failed.',details
  );

  -- 2. AI impact assessment coverage and review freshness.
  select count(*)::integer
  into request_count
  from public.ai_usage_requests r
  where r.project_id=target_project
    and r.created_at>=now()-interval '30 days';

  select count(*)::integer,
         count(*) filter(where a.review_after<=now() and a.status<>'closed')::integer
  into active_assessment_count,overdue_assessment_count
  from public.governance_ai_impact_assessments a
  where a.project_id=target_project and a.active=true;

  check_total := check_total+1;
  passed := not (
    (coalesce(request_count,0)>0 and coalesce(active_assessment_count,0)=0)
    or coalesce(overdue_assessment_count,0)>0
  );
  if not passed then failed_total:=failed_total+1; end if;
  details:=jsonb_build_object(
    'ai_requests_last_30_days',coalesce(request_count,0),
    'active_assessments',coalesce(active_assessment_count,0),
    'overdue_assessments',coalesce(overdue_assessment_count,0)
  );
  perform private.record_control_monitor_evidence_v1(
    target_project,'CGO-IMP-001',run_id,'ai_impact_assessment_coverage',passed,
    case when passed
      then 'AI impact assessment coverage and review freshness check passed.'
      else 'AI activity exists without active impact-assessment coverage, or an assessment review is overdue.'
    end,details
  );
  perform private.sync_control_monitor_alert_v1(
    target_project,'CGO-IMP-001',run_id,'ai_impact_assessment_coverage',not passed,'moderate',
    'AI impact assessment coverage requires owner review.',details
  );

  -- 3. Adverse Certified Memory outcomes that explicitly triggered review must be routed.
  select count(*)::integer
  into issue_count
  from public.certified_memory_outcome_evidence e
  where e.project_id=target_project
    and e.signal in ('challenged','contradicted')
    and e.review_triggered=true
    and not exists(
      select 1
      from public.governance_outcome_feedback_links l
      where l.project_id=e.project_id
        and l.source_outcome_evidence_id=e.id
    );

  check_total := check_total+1;
  passed := coalesce(issue_count,0)=0;
  if not passed then failed_total:=failed_total+1; end if;
  details:=jsonb_build_object('review_triggered_adverse_outcomes_without_governance_link',coalesce(issue_count,0));
  perform private.record_control_monitor_evidence_v1(
    target_project,'CGO-OUT-001',run_id,'outcome_feedback_routing',passed,
    case when passed
      then 'Review-triggered adverse Certified Memory outcomes are routed into governance.'
      else 'One or more review-triggered adverse Certified Memory outcomes lack a governance feedback link.'
    end,details
  );
  perform private.sync_control_monitor_alert_v1(
    target_project,'CGO-OUT-001',run_id,'outcome_feedback_routing',not passed,'high',
    'Governed outcome-feedback routing is incomplete.',details
  );

  -- 4. Every active control must have at least one evidence record.
  select count(*)::integer
  into issue_count
  from public.governance_control_catalog c
  where c.project_id=target_project
    and c.active=true
    and not exists(
      select 1 from public.governance_control_evidence e where e.control_id=c.id
    );

  check_total := check_total+1;
  passed := coalesce(issue_count,0)=0;
  if not passed then failed_total:=failed_total+1; end if;
  details:=jsonb_build_object('active_controls_without_evidence',coalesce(issue_count,0));
  perform private.record_control_monitor_evidence_v1(
    target_project,'CGO-PROV-001',run_id,'control_evidence_chain',passed,
    case when passed
      then 'Every active governance control has traceable evidence.'
      else 'One or more active governance controls have no evidence record.'
    end,details
  );
  perform private.sync_control_monitor_alert_v1(
    target_project,'CGO-PROV-001',run_id,'control_evidence_chain',not passed,'high',
    'Governance control evidence chain is incomplete.',details
  );

  -- 5. Release verification evidence must stay current.
  select count(*)::integer
  into recent_release_evidence
  from public.governance_control_evidence e
  join public.governance_control_catalog c on c.id=e.control_id
  where c.project_id=target_project
    and c.control_key='CGO-REL-001'
    and c.active=true
    and e.evidence_kind in ('workflow','deployment','test')
    and e.evidence_state='passed'
    and e.observed_at>=now()-interval '30 days';

  check_total := check_total+1;
  passed := coalesce(recent_release_evidence,0)>0;
  if not passed then failed_total:=failed_total+1; end if;
  details:=jsonb_build_object('passed_release_evidence_last_30_days',coalesce(recent_release_evidence,0));
  perform private.record_control_monitor_evidence_v1(
    target_project,'CGO-REL-001',run_id,'release_verification_freshness',passed,
    case when passed
      then 'Recent passed workflow, test, or deployment evidence exists for governed release verification.'
      else 'No recent passed workflow, test, or deployment evidence exists for governed release verification.'
    end,details
  );
  perform private.sync_control_monitor_alert_v1(
    target_project,'CGO-REL-001',run_id,'release_verification_freshness',not passed,'high',
    'Governed release verification evidence is stale or missing.',details
  );

  -- 6. Living standards register review dates must not silently lapse.
  select count(*)::integer
  into issue_count
  from public.governance_standards_register s
  where s.project_id=target_project
    and s.active=true
    and s.review_after<=now();

  check_total := check_total+1;
  passed := coalesce(issue_count,0)=0;
  if not passed then failed_total:=failed_total+1; end if;
  details:=jsonb_build_object('standards_review_due_count',coalesce(issue_count,0));
  perform private.record_control_monitor_evidence_v1(
    target_project,'CGO-STD-001',run_id,'standards_review_freshness',passed,
    case when passed
      then 'No active governance standards applicability review is overdue.'
      else 'One or more governance standards applicability reviews are overdue.'
    end,details
  );
  perform private.sync_control_monitor_alert_v1(
    target_project,'CGO-STD-001',run_id,'standards_review_freshness',not passed,'moderate',
    'Governance standards applicability review is overdue.',details
  );

  -- Summary evidence for the monitoring control itself.
  perform private.record_control_monitor_evidence_v1(
    target_project,'CGO-MON-001',run_id,'monitor_run_summary',failed_total=0,
    format('Governance control monitor completed %s checks with %s finding(s).',check_total,failed_total),
    jsonb_build_object(
      'check_count',check_total,
      'failed_count',failed_total,
      'trigger_kind',target_trigger,
      'governance_effect',false,
      'deployment_authority',false
    )
  );

  update public.governance_control_monitor_runs
  set status='succeeded',
      check_count=check_total,
      failed_count=failed_total,
      summary=format('Completed %s control checks; %s require owner review.',check_total,failed_total),
      completed_at=now()
  where id=run_id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,
    'GOVERNANCE_CONTROL_MONITOR_COMPLETED',
    case when target_actor is null then 'release-monitor' else target_actor::text end,
    jsonb_build_object(
      'monitor_run_id',run_id,
      'trigger_kind',target_trigger,
      'check_count',check_total,
      'failed_count',failed_total,
      'governance_effect',false,
      'deployment_authority',false,
      'evidence_does_not_equal_truth',true
    )
  );

  return run_id;
exception when others then
  if exists(select 1 from public.governance_control_monitor_runs r where r.id=run_id) then
    update public.governance_control_monitor_runs
    set status='failed',
        summary=left(sqlerrm,4000),
        completed_at=now()
    where id=run_id;
  end if;
  raise;
end;
$fn$;

create or replace function private.run_governance_control_monitor_owner_v1(
  target_project uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $fn$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner']) then
    raise insufficient_privilege using message='Owner access is required to run governance control monitoring.';
  end if;
  return private.run_governance_control_monitor_core_v1(target_project,'owner',caller);
end;
$fn$;

create or replace function private.run_governance_control_monitor_cron_v1()
returns integer
language plpgsql
security definer
set search_path=''
as $fn$
declare
  project_row record;
  run_count integer := 0;
begin
  for project_row in
    select distinct c.project_id
    from public.governance_control_catalog c
    where c.active=true
  loop
    perform private.run_governance_control_monitor_core_v1(project_row.project_id,'cron',null);
    run_count:=run_count+1;
  end loop;
  return run_count;
end;
$fn$;

create or replace function private.get_owner_governance_control_monitor_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $fn$
declare
  caller uuid := auth.uid();
  latest_run jsonb;
  runs jsonb;
  alerts jsonb;
  runtime_events jsonb;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner']) then
    raise insufficient_privilege using message='Owner access is required.';
  end if;

  select case when r.id is null then null else jsonb_build_object(
    'id',r.id,'trigger_kind',r.trigger_kind,'status',r.status,
    'check_count',r.check_count,'failed_count',r.failed_count,
    'summary',r.summary,'started_at',r.started_at,'completed_at',r.completed_at
  ) end
  into latest_run
  from public.governance_control_monitor_runs r
  where r.project_id=target_project
  order by r.started_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'trigger_kind',r.trigger_kind,'status',r.status,
    'check_count',r.check_count,'failed_count',r.failed_count,
    'summary',r.summary,'started_at',r.started_at,'completed_at',r.completed_at
  ) order by r.started_at desc),'[]'::jsonb)
  into runs
  from (
    select *
    from public.governance_control_monitor_runs
    where project_id=target_project
    order by started_at desc
    limit 20
  ) r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'trace_key',a.trace_key,'check_key',a.check_key,
    'control_key',c.control_key,'control_title',c.title,
    'severity',a.severity,'state',a.state,'summary',a.summary,
    'details',a.details,'occurrence_count',a.occurrence_count,
    'first_detected_at',a.first_detected_at,'last_detected_at',a.last_detected_at,
    'acknowledged_at',a.acknowledged_at,'acknowledgement_rationale',a.acknowledgement_rationale,
    'resolved_at',a.resolved_at
  ) order by
    case a.state when 'open' then 0 when 'acknowledged' then 1 else 2 end,
    a.last_detected_at desc),'[]'::jsonb)
  into alerts
  from public.governance_control_alerts a
  join public.governance_control_catalog c on c.id=a.control_id
  where a.project_id=target_project;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'control_key',e.control_key,'event_type',e.event_type,
    'target_kind',e.target_kind,'target_id',e.target_id,'outcome',e.outcome,
    'metadata',e.metadata,'observed_at',e.observed_at
  ) order by e.observed_at desc),'[]'::jsonb)
  into runtime_events
  from (
    select *
    from public.governance_control_runtime_events
    where project_id=target_project
    order by observed_at desc
    limit 30
  ) e;

  return jsonb_build_object(
    'latest_run',latest_run,
    'runs',coalesce(runs,'[]'::jsonb),
    'alerts',coalesce(alerts,'[]'::jsonb),
    'runtime_events',coalesce(runtime_events,'[]'::jsonb),
    'open_alert_count',(
      select count(*) from public.governance_control_alerts
      where project_id=target_project and state='open'
    ),
    'boundaries',jsonb_build_object(
      'owner_review_required',true,
      'monitor_can_vote',false,
      'monitor_can_close_proposals',false,
      'monitor_can_ratify',false,
      'monitor_can_deploy',false,
      'evidence_does_not_equal_truth',true
    )
  );
end;
$fn$;

create or replace function private.acknowledge_governance_control_alert_v1(
  target_alert uuid,
  target_rationale text
) returns uuid
language plpgsql
security definer
set search_path=''
as $fn$
declare
  caller uuid := auth.uid();
  alert_row public.governance_control_alerts%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if nullif(btrim(coalesce(target_rationale,'')),'') is null
     or char_length(btrim(target_rationale))<3 then
    raise exception 'Acknowledgement rationale is required.';
  end if;

  select * into alert_row
  from public.governance_control_alerts
  where id=target_alert
  for update;

  if not found then raise exception 'Governance control alert not found.'; end if;
  if not private.has_project_role(alert_row.project_id,array['owner']) then
    raise insufficient_privilege using message='Owner access is required.';
  end if;
  if alert_row.state='resolved' then return alert_row.id; end if;

  update public.governance_control_alerts
  set state='acknowledged',
      acknowledged_by=caller,
      acknowledged_at=now(),
      acknowledgement_rationale=btrim(target_rationale)
  where id=alert_row.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    alert_row.project_id,'GOVERNANCE_CONTROL_ALERT_ACKNOWLEDGED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'alert_id',alert_row.id,
      'trace_key',alert_row.trace_key,
      'check_key',alert_row.check_key,
      'governance_effect',false,
      'deployment_authority',false
    )
  );

  return alert_row.id;
end;
$fn$;

create or replace function public.run_governance_control_monitor_v1(
  target_project uuid
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.run_governance_control_monitor_owner_v1(target_project);
$rpc$;

create or replace function public.get_owner_governance_control_monitor_v1(
  target_project uuid
) returns jsonb
language sql
stable
security invoker
set search_path=''
as $rpc$
  select private.get_owner_governance_control_monitor_v1(target_project);
$rpc$;

create or replace function public.acknowledge_governance_control_alert_v1(
  target_alert uuid,
  target_rationale text
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.acknowledge_governance_control_alert_v1(target_alert,target_rationale);
$rpc$;

alter table public.governance_control_runtime_events enable row level security;
alter table public.governance_control_monitor_runs enable row level security;
alter table public.governance_control_alerts enable row level security;

drop policy if exists governance_control_runtime_events_owner_select
  on public.governance_control_runtime_events;
create policy governance_control_runtime_events_owner_select
on public.governance_control_runtime_events for select to authenticated
using (private.has_project_role(project_id,array['owner']));

drop policy if exists governance_control_monitor_runs_owner_select
  on public.governance_control_monitor_runs;
create policy governance_control_monitor_runs_owner_select
on public.governance_control_monitor_runs for select to authenticated
using (private.has_project_role(project_id,array['owner']));

drop policy if exists governance_control_alerts_owner_select
  on public.governance_control_alerts;
create policy governance_control_alerts_owner_select
on public.governance_control_alerts for select to authenticated
using (private.has_project_role(project_id,array['owner']));

revoke all on table public.governance_control_runtime_events from public,anon,authenticated;
revoke all on table public.governance_control_monitor_runs from public,anon,authenticated;
revoke all on table public.governance_control_alerts from public,anon,authenticated;

grant select on table public.governance_control_runtime_events to authenticated;
grant select on table public.governance_control_monitor_runs to authenticated;
grant select on table public.governance_control_alerts to authenticated;

revoke execute on function private.capture_governance_decision_control_event_v1() from public,anon,authenticated;
revoke execute on function private.capture_outcome_feedback_control_event_v1() from public,anon,authenticated;
revoke execute on function private.capture_ai_impact_control_event_v1() from public,anon,authenticated;
revoke execute on function private.capture_optimizer_authority_control_event_v1() from public,anon,authenticated;
revoke execute on function private.record_control_monitor_evidence_v1(uuid,text,uuid,text,boolean,text,jsonb) from public,anon,authenticated;
revoke execute on function private.sync_control_monitor_alert_v1(uuid,text,uuid,text,boolean,text,text,jsonb) from public,anon,authenticated;
revoke execute on function private.run_governance_control_monitor_core_v1(uuid,text,uuid) from public,anon,authenticated;
revoke execute on function private.run_governance_control_monitor_cron_v1() from public,anon,authenticated;

revoke execute on function private.run_governance_control_monitor_owner_v1(uuid) from public,anon;
revoke execute on function private.get_owner_governance_control_monitor_v1(uuid) from public,anon;
revoke execute on function private.acknowledge_governance_control_alert_v1(uuid,text) from public,anon;
grant execute on function private.run_governance_control_monitor_owner_v1(uuid) to authenticated;
grant execute on function private.get_owner_governance_control_monitor_v1(uuid) to authenticated;
grant execute on function private.acknowledge_governance_control_alert_v1(uuid,text) to authenticated;

revoke execute on function public.run_governance_control_monitor_v1(uuid) from public,anon;
revoke execute on function public.get_owner_governance_control_monitor_v1(uuid) from public,anon;
revoke execute on function public.acknowledge_governance_control_alert_v1(uuid,text) from public,anon;
grant execute on function public.run_governance_control_monitor_v1(uuid) to authenticated;
grant execute on function public.get_owner_governance_control_monitor_v1(uuid) to authenticated;
grant execute on function public.acknowledge_governance_control_alert_v1(uuid,text) to authenticated;

do $cron$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname='datanest-governance-control-monitor-hourly'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'datanest-governance-control-monitor-hourly',
    '23 * * * *',
    'select private.run_governance_control_monitor_cron_v1();'
  );
end;
$cron$;

select private.run_governance_control_monitor_cron_v1();

commit;
