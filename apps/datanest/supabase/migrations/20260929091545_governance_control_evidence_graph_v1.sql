begin;

-- Resonance DataNest Continuous Governance Optimization v1.1
-- Adds a standards lifecycle watch and control-evidence graph.
-- These structures describe evidence and implementation controls only. They do not
-- vote, decide, ratify, alter authority, assert conformity, or mutate sovereign history.

create table if not exists public.governance_control_catalog (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  control_key text not null check (char_length(btrim(control_key)) between 3 and 120),
  version bigint not null check (version > 0),
  title text not null check (char_length(btrim(title)) between 3 and 300),
  purpose text not null check (char_length(btrim(purpose)) between 3 and 4000),
  control_kind text not null check (control_kind in (
    'governance','risk','compliance','security','privacy','data','ai_lifecycle',
    'knowledge','evidence','release'
  )),
  standard_refs text[] not null default '{}',
  implementation_refs text[] not null default '{}',
  rationale text not null default 'Documented implementation control; not a conformity claim.',
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_by_kind text not null default 'human'
    check (created_by_kind in ('human','release')),
  created_at timestamptz not null default now(),
  supersedes_id uuid references public.governance_control_catalog(id) on delete set null,
  governance_effect boolean not null default false check (governance_effect=false),
  unique(project_id,control_key,version)
);

create unique index if not exists governance_control_catalog_one_active_idx
  on public.governance_control_catalog(project_id,control_key)
  where active=true;
create index if not exists governance_control_catalog_project_idx
  on public.governance_control_catalog(project_id,active,control_key);
create index if not exists governance_control_catalog_created_by_idx
  on public.governance_control_catalog(created_by)
  where created_by is not null;
create index if not exists governance_control_catalog_supersedes_idx
  on public.governance_control_catalog(supersedes_id)
  where supersedes_id is not null;

create table if not exists public.governance_control_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  control_id uuid not null references public.governance_control_catalog(id) on delete restrict,
  trace_key text not null unique,
  evidence_kind text not null check (evidence_kind in (
    'repository','migration','test','workflow','deployment','observation','incident',
    'external_audit','certified_memory','manual'
  )),
  evidence_ref text not null check (char_length(btrim(evidence_ref)) between 1 and 1000),
  evidence_digest text,
  summary text not null check (char_length(btrim(summary)) between 3 and 4000),
  evidence_state text not null default 'observed'
    check (evidence_state in ('observed','passed','failed','superseded')),
  provenance jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  recorder_role text not null
    check (recorder_role in ('owner','admin','operator','release')),
  authoritative_change boolean not null default false check (authoritative_change=false),
  created_at timestamptz not null default now()
);

create index if not exists governance_control_evidence_project_idx
  on public.governance_control_evidence(project_id,observed_at desc);
create index if not exists governance_control_evidence_control_idx
  on public.governance_control_evidence(control_id,observed_at desc);
create index if not exists governance_control_evidence_recorded_by_idx
  on public.governance_control_evidence(recorded_by)
  where recorded_by is not null;

create table if not exists public.governance_standard_watch_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  standard_id uuid not null references public.governance_standards_register(id) on delete restrict,
  standard_key text not null,
  observation_id uuid not null references public.governance_observations(id) on delete restrict,
  trace_key text not null unique,
  event_type text not null check (event_type in (
    'status_checked','revision_announced','new_edition_published','amendment_published',
    'withdrawn','superseded','guidance_updated','other'
  )),
  source_authority text not null,
  source_url text not null check (lower(source_url) like 'https://%'),
  observed_edition text,
  summary text not null check (char_length(btrim(summary)) between 3 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorder_role text not null check (recorder_role in ('owner','admin')),
  authoritative_change boolean not null default false check (authoritative_change=false),
  created_at timestamptz not null default now()
);

create index if not exists governance_standard_watch_project_idx
  on public.governance_standard_watch_events(project_id,observed_at desc);
create index if not exists governance_standard_watch_standard_idx
  on public.governance_standard_watch_events(standard_id,observed_at desc);
create index if not exists governance_standard_watch_observation_idx
  on public.governance_standard_watch_events(observation_id);
create index if not exists governance_standard_watch_recorded_by_idx
  on public.governance_standard_watch_events(recorded_by);

create or replace function private.seed_governance_evidence_standards_v1(target_project uuid)
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
    target_project,seed.standard_key,1,seed.title,seed.authority,seed.edition,'reference',
    'Recognized provenance/control-evidence reference. Project-specific applicability and conformity have not been assessed.',
    seed.source_url,now()+interval '90 days',
    jsonb_build_object(
      'baseline','continuous-governance-control-evidence-v1',
      'operational_review_cadence_days',90,
      'conformity_claim',false,
      'applicability_assessment_required',true
    )
  from (
    values
      ('w3c-prov-o-2013','W3C PROV-O — Provenance Ontology','W3C','Recommendation 2013-04','https://www.w3.org/TR/prov-o/'),
      ('nist-oscal-1-2-2','NIST OSCAL — Open Security Controls Assessment Language','NIST','1.2.2','https://pages.nist.gov/OSCAL-Reference/models/v1.2.2/'),
      ('slsa-1-2','SLSA specification','SLSA Community','1.2','https://slsa.dev/spec/v1.2/')
  ) as seed(standard_key,title,authority,edition,source_url)
  on conflict(project_id,standard_key,version) do nothing;
end;
$$;

create or replace function private.seed_governance_control_graph_v1(target_project uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.governance_control_catalog(
    project_id,control_key,version,title,purpose,control_kind,standard_refs,
    implementation_refs,rationale,metadata,created_by_kind
  )
  values
    (
      target_project,'CGO-AUTH-001',1,'Governance change firewall',
      'Keep evidence and learning non-authoritative until an existing human Sovereign Governance process acts.',
      'governance',
      array['iso-iec-42001-2023','iso-iec-38500-2024','iso-iec-38507-2022','nist-ai-rmf-1-0'],
      array['docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md','supabase/migrations/20260929230000_continuous_governance_optimization_v1.sql'],
      'Implementation boundary only; this catalog entry does not itself create governance authority.',
      jsonb_build_object('conformity_claim',false,'authority_effect',false),'release'
    ),
    (
      target_project,'CGO-STD-001',1,'Living standards applicability review',
      'Version project-specific standards applicability decisions and preserve supersession history without claiming certification.',
      'compliance',
      array['iso-iec-42001-2023','iso-37301-2021','iso-30401-2018','nist-ai-rmf-1-0'],
      array['docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md','supabase/migrations/20260929230000_continuous_governance_optimization_v1.sql'],
      'Standards lifecycle evidence informs review; it does not automatically alter applicability.',
      jsonb_build_object('conformity_claim',false,'automatic_applicability_change',false),'release'
    ),
    (
      target_project,'CGO-PROV-001',1,'Append-only provenance and evidence chain',
      'Preserve traceable links from controls to implementation and operational evidence without converting evidence frequency into truth.',
      'evidence',
      array['iso-30401-2018','iso-iec-5259-series','w3c-prov-o-2013','nist-oscal-1-2-2'],
      array['docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md','tests/unit/continuous-governance-optimization.test.mjs'],
      'Evidence relationships are descriptive provenance, not proof of conformity or correctness.',
      jsonb_build_object('conformity_claim',false,'evidence_frequency_increases_truth_status',false),'release'
    ),
    (
      target_project,'CGO-REL-001',1,'Governed release verification',
      'Keep source, test, security, migration, deployment and live verification evidence distinguishable across release stages.',
      'release',
      array['iso-iec-27001-2022','iso-iec-5338-2023','nist-csf-2-0','slsa-1-2'],
      array['.github/workflows/ci.yml','.github/workflows/security-scan.yml','.github/workflows/pages.yml'],
      'Workflow definitions are implementation evidence; only completed release evidence supports a release-state claim.',
      jsonb_build_object('conformity_claim',false,'deployment_separate_from_merge',true),'release'
    )
  on conflict(project_id,control_key,version) do nothing;

  insert into public.governance_control_evidence(
    project_id,control_id,trace_key,evidence_kind,evidence_ref,summary,evidence_state,
    provenance,recorder_role
  )
  select
    target_project,c.id,
    'DN-GOV-EVD-'||upper(substr(md5(target_project::text||':'||seed.control_key||':'||seed.evidence_ref),1,16)),
    seed.evidence_kind,seed.evidence_ref,seed.summary,'observed',
    jsonb_build_object(
      'seed','continuous-governance-control-evidence-v1',
      'claim_scope','source-artifact-present',
      'runtime_pass_claim',false
    ),
    'release'
  from (
    values
      ('CGO-AUTH-001','migration','supabase/migrations/20260929230000_continuous_governance_optimization_v1.sql','Source migration contains the governed authority firewall and evidence-layer boundaries.'),
      ('CGO-AUTH-001','test','tests/unit/continuous-governance-optimization.test.mjs','Regression contract checks that learning cannot vote, ratify or grant authority.'),
      ('CGO-STD-001','repository','docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md','Governance standards baseline and non-certification boundary are documented.'),
      ('CGO-PROV-001','repository','docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md','Continuous-governance documentation defines provenance, append-only history and evidence boundaries.'),
      ('CGO-REL-001','workflow','.github/workflows/ci.yml','CI workflow is a release-evidence source; this seed does not claim any particular run passed.'),
      ('CGO-REL-001','workflow','.github/workflows/security-scan.yml','Security workflow is a release-evidence source; this seed does not claim any particular run passed.'),
      ('CGO-REL-001','workflow','.github/workflows/pages.yml','Pages workflow is a deployment-evidence source; this seed does not claim any particular deployment succeeded.')
  ) as seed(control_key,evidence_kind,evidence_ref,summary)
  join public.governance_control_catalog c
    on c.project_id=target_project and c.control_key=seed.control_key and c.active=true
  where not exists(
    select 1 from public.governance_control_evidence e
    where e.project_id=target_project
      and e.control_id=c.id
      and e.evidence_kind=seed.evidence_kind
      and e.evidence_ref=seed.evidence_ref
  );
end;
$$;

create or replace function private.seed_governance_control_graph_for_project_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.seed_governance_evidence_standards_v1(new.id);
  perform private.seed_governance_control_graph_v1(new.id);
  return new;
end;
$$;

drop trigger if exists seed_governance_control_graph_for_project_v1 on public.projects;
create trigger seed_governance_control_graph_for_project_v1
after insert on public.projects
for each row execute function private.seed_governance_control_graph_for_project_v1();

do $$
declare
  p record;
begin
  for p in select id from public.projects loop
    perform private.seed_governance_evidence_standards_v1(p.id);
    perform private.seed_governance_control_graph_v1(p.id);
  end loop;
end;
$$;

create or replace function private.version_governance_control_v1(
  target_project uuid,
  target_control_key text,
  target_title text,
  target_purpose text,
  target_control_kind text,
  target_standard_refs text[] default '{}',
  target_implementation_refs text[] default '{}',
  target_rationale text default 'Human-reviewed implementation-control update.',
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
  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin control-catalog authority is required.';
  end if;

  if nullif(btrim(coalesce(target_control_key,'')),'') is null
     or nullif(btrim(coalesce(target_title,'')),'') is null
     or nullif(btrim(coalesce(target_purpose,'')),'') is null
     or nullif(btrim(coalesce(target_rationale,'')),'') is null then
    raise exception 'Control key, title, purpose and rationale are required.';
  end if;
  if target_control_kind not in (
    'governance','risk','compliance','security','privacy','data','ai_lifecycle',
    'knowledge','evidence','release'
  ) then raise exception 'Unsupported governance control kind.'; end if;

  if exists(
    select 1 from unnest(coalesce(target_standard_refs,'{}'::text[])) s(key)
    where not exists(
      select 1 from public.governance_standards_register gsr
      where gsr.project_id=target_project and gsr.standard_key=s.key and gsr.active=true
    )
  ) then raise exception 'Control contains an unknown active standards reference.'; end if;

  select id,version into current_id,current_version
  from public.governance_control_catalog
  where project_id=target_project and control_key=btrim(target_control_key) and active=true
  for update;

  next_version:=coalesce(current_version,0)+1;

  if current_id is not null then
    update public.governance_control_catalog set active=false where id=current_id;
  end if;

  insert into public.governance_control_catalog(
    id,project_id,control_key,version,title,purpose,control_kind,standard_refs,
    implementation_refs,rationale,metadata,created_by,created_by_kind,supersedes_id
  )
  values(
    new_id,target_project,btrim(target_control_key),next_version,btrim(target_title),
    btrim(target_purpose),target_control_kind,
    coalesce(target_standard_refs,'{}'::text[]),
    coalesce(target_implementation_refs,'{}'::text[]),
    btrim(target_rationale),
    coalesce(target_metadata,'{}'::jsonb)||jsonb_build_object(
      'conformity_claim',false,'governance_effect',false
    ),
    caller,'human',current_id
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'GOVERNANCE_CONTROL_VERSION_RECORDED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'control_id',new_id,'control_key',btrim(target_control_key),
      'version',next_version,'supersedes_id',current_id,
      'governance_effect',false,'conformity_claim',false
    )
  );

  return new_id;
end;
$$;

create or replace function private.record_governance_control_evidence_v1(
  target_control uuid,
  target_evidence_kind text,
  target_evidence_ref text,
  target_summary text,
  target_evidence_state text default 'observed',
  target_evidence_digest text default null,
  target_provenance jsonb default '{}'::jsonb,
  target_observed_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  caller_role text;
  control_row public.governance_control_catalog%rowtype;
  evidence_id uuid:=gen_random_uuid();
  trace text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into control_row
  from public.governance_control_catalog
  where id=target_control and active=true;

  if not found then raise exception 'Active governance control not found.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=control_row.project_id and pm.user_id=caller and pm.status='active'
  limit 1;
  if caller_role is null or caller_role not in ('owner','admin','operator') then
    raise insufficient_privilege using message='Owner, Admin or Operator evidence-recording authority is required.';
  end if;

  if target_evidence_kind not in (
    'repository','migration','test','workflow','deployment','observation','incident',
    'external_audit','certified_memory','manual'
  ) then raise exception 'Unsupported control evidence kind.'; end if;
  if target_evidence_state not in ('observed','passed','failed','superseded') then
    raise exception 'Unsupported control evidence state.'; end if;
  if nullif(btrim(coalesce(target_evidence_ref,'')),'') is null
     or nullif(btrim(coalesce(target_summary,'')),'') is null then
    raise exception 'Evidence reference and summary are required.';
  end if;

  trace:='DN-GOV-EVD-'||upper(substr(replace(evidence_id::text,'-',''),1,16));

  insert into public.governance_control_evidence(
    id,project_id,control_id,trace_key,evidence_kind,evidence_ref,evidence_digest,
    summary,evidence_state,provenance,observed_at,recorded_by,recorder_role
  )
  values(
    evidence_id,control_row.project_id,control_row.id,trace,target_evidence_kind,
    btrim(target_evidence_ref),nullif(btrim(coalesce(target_evidence_digest,'')),''),
    btrim(target_summary),target_evidence_state,
    coalesce(target_provenance,'{}'::jsonb)||jsonb_build_object(
      'conformity_claim',false,'authoritative_change',false
    ),
    coalesce(target_observed_at,now()),caller,caller_role
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    control_row.project_id,'GOVERNANCE_CONTROL_EVIDENCE_RECORDED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'evidence_id',evidence_id,'trace_key',trace,'control_id',control_row.id,
      'evidence_kind',target_evidence_kind,'evidence_state',target_evidence_state,
      'authoritative_change',false,'conformity_claim',false
    )
  );

  return evidence_id;
end;
$$;

create or replace function private.record_governance_standard_watch_event_v1(
  target_standard uuid,
  target_event_type text,
  target_source_url text,
  target_summary text,
  target_observed_edition text default null,
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
  standard_row public.governance_standards_register%rowtype;
  watch_id uuid:=gen_random_uuid();
  observation_id uuid;
  trace text;
  severity text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into standard_row
  from public.governance_standards_register
  where id=target_standard and active=true;

  if not found then raise exception 'Active governance standard record not found.'; end if;

  select pm.role into caller_role
  from public.project_members pm
  where pm.project_id=standard_row.project_id and pm.user_id=caller and pm.status='active'
  limit 1;
  if caller_role is null or caller_role not in ('owner','admin') then
    raise insufficient_privilege using message='Owner or Admin standards-watch authority is required.';
  end if;

  if target_event_type not in (
    'status_checked','revision_announced','new_edition_published','amendment_published',
    'withdrawn','superseded','guidance_updated','other'
  ) then raise exception 'Unsupported standards-watch event type.'; end if;
  if lower(btrim(coalesce(target_source_url,''))) not like 'https://%' then
    raise exception 'Standards-watch source URL must use HTTPS.';
  end if;
  if nullif(btrim(coalesce(target_summary,'')),'') is null then
    raise exception 'Standards-watch summary is required.';
  end if;

  severity:=case when target_event_type='status_checked' then 'info' else 'moderate' end;

  observation_id:=private.record_governance_observation_v1(
    standard_row.project_id,'standards_change',btrim(target_summary),severity,null,
    btrim(target_source_url),
    coalesce(target_evidence,'{}'::jsonb)||jsonb_build_object(
      'standards_watch',true,
      'standard_key',standard_row.standard_key,
      'registered_edition',standard_row.edition,
      'observed_edition',nullif(btrim(coalesce(target_observed_edition,'')),''),
      'event_type',target_event_type,
      'source_authority',standard_row.authority,
      'source_checked_at',now(),
      'automatic_applicability_change',false,
      'conformity_claim',false
    ),
    coalesce(target_observed_at,now())
  );

  trace:='DN-GOV-WATCH-'||upper(substr(replace(watch_id::text,'-',''),1,16));

  insert into public.governance_standard_watch_events(
    id,project_id,standard_id,standard_key,observation_id,trace_key,event_type,
    source_authority,source_url,observed_edition,summary,evidence,observed_at,
    recorded_by,recorder_role
  )
  values(
    watch_id,standard_row.project_id,standard_row.id,standard_row.standard_key,
    observation_id,trace,target_event_type,standard_row.authority,btrim(target_source_url),
    nullif(btrim(coalesce(target_observed_edition,'')),''),
    btrim(target_summary),
    coalesce(target_evidence,'{}'::jsonb)||jsonb_build_object(
      'automatic_standard_mutation',false,
      'automatic_candidate_creation',false,
      'conformity_claim',false
    ),
    coalesce(target_observed_at,now()),caller,caller_role
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    standard_row.project_id,'GOVERNANCE_STANDARD_WATCH_EVENT_RECORDED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'watch_id',watch_id,'trace_key',trace,'standard_key',standard_row.standard_key,
      'observation_id',observation_id,'watch_event_type',target_event_type,
      'automatic_standard_mutation',false,'automatic_candidate_creation',false
    )
  );

  return watch_id;
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

  return jsonb_build_object(
    'role',caller_role,
    'can_manage',caller_role in ('owner','admin'),
    'can_record_control_evidence',caller_role in ('owner','admin','operator'),
    'standards',coalesce(standards,'[]'::jsonb),
    'observations',coalesce(observations,'[]'::jsonb),
    'candidates',coalesce(candidates,'[]'::jsonb),
    'reviews',coalesce(reviews,'[]'::jsonb),
    'cycles',coalesce(cycles,'[]'::jsonb),
    'controls',coalesce(controls,'[]'::jsonb),
    'control_evidence',coalesce(control_evidence,'[]'::jsonb),
    'standard_watch',coalesce(standard_watch,'[]'::jsonb),
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
      'formal_governance_route','human_review_then_existing_proposal_vote_ratification'
    )
  );
end;
$$;

create or replace function public.version_governance_control_v1(
  target_project uuid,
  target_control_key text,
  target_title text,
  target_purpose text,
  target_control_kind text,
  target_standard_refs text[] default '{}',
  target_implementation_refs text[] default '{}',
  target_rationale text default 'Human-reviewed implementation-control update.',
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.version_governance_control_v1(
    target_project,target_control_key,target_title,target_purpose,target_control_kind,
    target_standard_refs,target_implementation_refs,target_rationale,target_metadata
  );
$rpc$;

create or replace function public.record_governance_control_evidence_v1(
  target_control uuid,
  target_evidence_kind text,
  target_evidence_ref text,
  target_summary text,
  target_evidence_state text default 'observed',
  target_evidence_digest text default null,
  target_provenance jsonb default '{}'::jsonb,
  target_observed_at timestamptz default now()
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.record_governance_control_evidence_v1(
    target_control,target_evidence_kind,target_evidence_ref,target_summary,
    target_evidence_state,target_evidence_digest,target_provenance,target_observed_at
  );
$rpc$;

create or replace function public.record_governance_standard_watch_event_v1(
  target_standard uuid,
  target_event_type text,
  target_source_url text,
  target_summary text,
  target_observed_edition text default null,
  target_evidence jsonb default '{}'::jsonb,
  target_observed_at timestamptz default now()
) returns uuid
language sql
security invoker
set search_path=''
as $rpc$
  select private.record_governance_standard_watch_event_v1(
    target_standard,target_event_type,target_source_url,target_summary,
    target_observed_edition,target_evidence,target_observed_at
  );
$rpc$;

alter table public.governance_control_catalog enable row level security;
alter table public.governance_control_evidence enable row level security;
alter table public.governance_standard_watch_events enable row level security;

drop policy if exists governance_control_catalog_select on public.governance_control_catalog;
create policy governance_control_catalog_select
on public.governance_control_catalog for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_control_evidence_select on public.governance_control_evidence;
create policy governance_control_evidence_select
on public.governance_control_evidence for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_standard_watch_events_select on public.governance_standard_watch_events;
create policy governance_standard_watch_events_select
on public.governance_standard_watch_events for select to authenticated
using (private.has_project_access(project_id));

revoke all on table public.governance_control_catalog from public,anon,authenticated;
revoke all on table public.governance_control_evidence from public,anon,authenticated;
revoke all on table public.governance_standard_watch_events from public,anon,authenticated;

grant select on table public.governance_control_catalog to authenticated;
grant select on table public.governance_control_evidence to authenticated;
grant select on table public.governance_standard_watch_events to authenticated;

revoke execute on function private.seed_governance_evidence_standards_v1(uuid)
  from public,anon,authenticated;
revoke execute on function private.seed_governance_control_graph_v1(uuid)
  from public,anon,authenticated;
revoke execute on function private.seed_governance_control_graph_for_project_v1()
  from public,anon,authenticated;

grant usage on schema private to authenticated;

revoke execute on function private.version_governance_control_v1(uuid,text,text,text,text,text[],text[],text,jsonb)
  from public,anon;
revoke execute on function private.record_governance_control_evidence_v1(uuid,text,text,text,text,text,jsonb,timestamptz)
  from public,anon;
revoke execute on function private.record_governance_standard_watch_event_v1(uuid,text,text,text,text,jsonb,timestamptz)
  from public,anon;

grant execute on function private.version_governance_control_v1(uuid,text,text,text,text,text[],text[],text,jsonb)
  to authenticated;
grant execute on function private.record_governance_control_evidence_v1(uuid,text,text,text,text,text,jsonb,timestamptz)
  to authenticated;
grant execute on function private.record_governance_standard_watch_event_v1(uuid,text,text,text,text,jsonb,timestamptz)
  to authenticated;

revoke execute on function public.version_governance_control_v1(uuid,text,text,text,text,text[],text[],text,jsonb)
  from public,anon;
revoke execute on function public.record_governance_control_evidence_v1(uuid,text,text,text,text,text,jsonb,timestamptz)
  from public,anon;
revoke execute on function public.record_governance_standard_watch_event_v1(uuid,text,text,text,text,jsonb,timestamptz)
  from public,anon;

grant execute on function public.version_governance_control_v1(uuid,text,text,text,text,text[],text[],text,jsonb)
  to authenticated;
grant execute on function public.record_governance_control_evidence_v1(uuid,text,text,text,text,text,jsonb,timestamptz)
  to authenticated;
grant execute on function public.record_governance_standard_watch_event_v1(uuid,text,text,text,text,jsonb,timestamptz)
  to authenticated;

commit;
