
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $seed_cron_token$
declare
  token_name text := 'datanest_optimizer_cron_token';
  token_value text;
begin
  if not exists(select 1 from vault.secrets where name=token_name) then
    token_value := encode(extensions.gen_random_bytes(32),'hex');
    perform vault.create_secret(
      token_value,
      token_name,
      'Resonance DataNest Audit Optimizer scheduled-worker token',
      null
    );
  end if;
end;
$seed_cron_token$;

create table if not exists public.optimizer_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  cadence_hours integer not null default 6 check (cadence_hours between 1 and 168),
  max_suggestions integer not null default 5 check (max_suggestions between 1 and 10),
  last_run_at timestamptz,
  last_success_at timestamptz,
  next_run_after timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.optimizer_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  request_key uuid not null,
  trigger_kind text not null check (trigger_kind in ('cron','owner')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'running'
    check (status in ('running','succeeded','failed','denied')),
  provider_request_id uuid,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  summary text,
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations)='array'),
  suggestion_count integer not null default 0 check (suggestion_count >= 0),
  error_category text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(project_id,request_key)
);

create index if not exists optimizer_runs_project_time_idx
  on public.optimizer_runs(project_id,created_at desc);
create index if not exists optimizer_runs_project_status_idx
  on public.optimizer_runs(project_id,status,created_at desc);
create index if not exists optimizer_runs_actor_idx
  on public.optimizer_runs(actor_user_id,created_at desc);

create table if not exists public.optimizer_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null references public.optimizer_runs(id) on delete cascade,
  trace_key text not null unique,
  fingerprint text not null,
  title text not null check (char_length(btrim(title)) between 3 and 300),
  problem_statement text not null check (char_length(btrim(problem_statement)) between 3 and 4000),
  hypothesis text not null check (char_length(btrim(hypothesis)) between 3 and 4000),
  desired_outcome text not null check (char_length(btrim(desired_outcome)) between 3 and 4000),
  proposed_change jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  evidence_refs text[] not null default '{}',
  standard_refs text[] not null default '{}',
  risk_class text not null default 'moderate'
    check (risk_class in ('low','moderate','high','critical')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'proposed'
    check (status in ('proposed','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_rationale text,
  linked_observation_id uuid references public.governance_observations(id) on delete set null,
  linked_improvement_candidate_id uuid references public.governance_improvement_candidates(id) on delete set null,
  governance_effect boolean not null default false check (governance_effect=false),
  deployment_authority boolean not null default false check (deployment_authority=false),
  created_at timestamptz not null default now()
);

create index if not exists optimizer_suggestions_project_status_idx
  on public.optimizer_suggestions(project_id,status,created_at desc);
create index if not exists optimizer_suggestions_run_idx
  on public.optimizer_suggestions(run_id,created_at);
create index if not exists optimizer_suggestions_fingerprint_idx
  on public.optimizer_suggestions(project_id,fingerprint,created_at desc);
create index if not exists optimizer_suggestions_reviewed_by_idx
  on public.optimizer_suggestions(reviewed_by)
  where reviewed_by is not null;
create index if not exists optimizer_suggestions_linked_observation_idx
  on public.optimizer_suggestions(linked_observation_id)
  where linked_observation_id is not null;
create index if not exists optimizer_suggestions_linked_candidate_idx
  on public.optimizer_suggestions(linked_improvement_candidate_id)
  where linked_improvement_candidate_id is not null;

alter table public.ai_usage_requests
  add column if not exists optimizer_run_id uuid references public.optimizer_runs(id) on delete cascade;

alter table public.ai_usage_requests
  drop constraint if exists ai_usage_requests_subject_check;

alter table public.ai_usage_requests
  add constraint ai_usage_requests_subject_check
  check (
    ((job_id is not null)::integer
      + (assessment_id is not null)::integer
      + (optimizer_run_id is not null)::integer) = 1
  );

create index if not exists ai_usage_requests_optimizer_run_idx
  on public.ai_usage_requests(optimizer_run_id,created_at desc)
  where optimizer_run_id is not null;

alter table public.optimizer_runs
  drop constraint if exists optimizer_runs_provider_request_id_fkey;
alter table public.optimizer_runs
  add constraint optimizer_runs_provider_request_id_fkey
  foreign key(provider_request_id) references public.ai_usage_requests(id) on delete set null;

insert into public.optimizer_settings(project_id,enabled,cadence_hours,max_suggestions,next_run_after)
select id,false,6,5,now()
from public.projects
on conflict(project_id) do nothing;

create or replace function private.seed_optimizer_settings_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.optimizer_settings(project_id,enabled,cadence_hours,max_suggestions,next_run_after)
  values(new.id,false,6,5,now())
  on conflict(project_id) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_optimizer_settings_v1 on public.projects;
create trigger seed_optimizer_settings_v1
after insert on public.projects
for each row execute function private.seed_optimizer_settings_v1();

alter table public.optimizer_settings enable row level security;
alter table public.optimizer_runs enable row level security;
alter table public.optimizer_suggestions enable row level security;

drop policy if exists optimizer_settings_owner_select on public.optimizer_settings;
create policy optimizer_settings_owner_select on public.optimizer_settings
for select to authenticated
using (private.has_project_role(project_id,array['owner']));

drop policy if exists optimizer_runs_owner_select on public.optimizer_runs;
create policy optimizer_runs_owner_select on public.optimizer_runs
for select to authenticated
using (private.has_project_role(project_id,array['owner']));

drop policy if exists optimizer_suggestions_owner_select on public.optimizer_suggestions;
create policy optimizer_suggestions_owner_select on public.optimizer_suggestions
for select to authenticated
using (private.has_project_role(project_id,array['owner']));

revoke all on public.optimizer_settings,public.optimizer_runs,public.optimizer_suggestions from public,anon;
grant select on public.optimizer_settings,public.optimizer_runs,public.optimizer_suggestions to authenticated;

create or replace function public.service_verify_optimizer_cron_token_v1(
  target_token text
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if nullif(btrim(coalesce(target_token,'')),'') is null then return false; end if;
  return exists(
    select 1
    from vault.decrypted_secrets s
    where s.name='datanest_optimizer_cron_token'
      and extensions.digest(s.decrypted_secret,'sha256')
          = extensions.digest(target_token,'sha256')
  );
end;
$$;

create or replace function public.service_get_optimizer_evidence_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  project_row jsonb;
  standards jsonb;
  observations jsonb;
  cycles jsonb;
  findings jsonb;
  impact_assessments jsonb;
  control_evidence jsonb;
  job_metrics jsonb;
  ai_metrics jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  select jsonb_build_object(
    'id',p.id,'slug',p.slug,'name',p.name,'description',p.description,'status',p.status
  ) into project_row
  from public.projects p where p.id=target_project;
  if project_row is null then raise exception 'Project not found.'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.standard_key),'[]'::jsonb)
  into standards
  from (
    select standard_key,title,authority,edition,applicability_state,review_after,
           (review_after<=now()) as review_due
    from public.governance_standards_register
    where project_id=target_project and active=true
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.observed_at desc),'[]'::jsonb)
  into observations
  from (
    select id,trace_key,source_kind,source_ref,summary,severity,confidence,observed_at
    from public.governance_observations
    where project_id=target_project
    order by observed_at desc
    limit 60
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into cycles
  from (
    select id,trace_key,window_start,window_end,metrics,signals,created_at
    from public.governance_improvement_cycles
    where project_id=target_project
    order by created_at desc
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into findings
  from (
    select id,criterion_id,observation,limitation,claim_kind,severity,confidence,state,created_at
    from public.external_audit_findings
    where project_id=target_project
    order by created_at desc
    limit 50
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb)
  into impact_assessments
  from (
    select id,assessment_key,version,subject_kind,subject_ref,title,lifecycle_stage,
           trigger_kind,materiality,residual_risk,status,review_after,updated_at
    from public.governance_ai_impact_assessments
    where project_id=target_project and active=true
    order by updated_at desc
    limit 30
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.observed_at desc),'[]'::jsonb)
  into control_evidence
  from (
    select e.id,e.trace_key,c.control_key,c.title as control_title,e.evidence_kind,
           e.evidence_ref,e.summary,e.evidence_state,e.observed_at
    from public.governance_control_evidence e
    join public.governance_control_catalog c on c.id=e.control_id
    where e.project_id=target_project
    order by e.observed_at desc
    limit 60
  ) x;

  select jsonb_build_object(
    'total',count(*),
    'active',count(*) filter(where status not in ('COMPLETED','FAILED','CANCELLED')),
    'blocked',count(*) filter(where status='BLOCKED'),
    'running',count(*) filter(where status='RUNNING'),
    'completed_last_7d',count(*) filter(where status='COMPLETED' and updated_at>=now()-interval '7 days')
  ) into job_metrics
  from public.jobs
  where project_id=target_project;

  select jsonb_build_object(
    'requests_24h',count(*) filter(where created_at>=now()-interval '24 hours'),
    'failed_24h',count(*) filter(where created_at>=now()-interval '24 hours' and status='failed'),
    'denied_24h',count(*) filter(where created_at>=now()-interval '24 hours' and status='denied'),
    'unknown_24h',count(*) filter(where created_at>=now()-interval '24 hours' and status='unknown'),
    'tokens_24h',coalesce(sum(total_tokens) filter(where created_at>=now()-interval '24 hours'),0)
  ) into ai_metrics
  from public.ai_usage_requests
  where project_id=target_project;

  return jsonb_build_object(
    'captured_at',now(),
    'project',project_row,
    'standards',standards,
    'governance_observations',observations,
    'governance_cycles',cycles,
    'external_audit_findings',findings,
    'ai_impact_assessments',impact_assessments,
    'control_evidence',control_evidence,
    'job_metrics',job_metrics,
    'ai_metrics',ai_metrics,
    'boundaries',jsonb_build_object(
      'ai_can_approve',false,
      'ai_can_deploy',false,
      'ai_can_vote',false,
      'owner_review_required',true,
      'formal_governance_required_after_owner_approval',true
    )
  );
end;
$$;

create or replace function public.service_create_optimizer_run_v1(
  target_project uuid,
  target_trigger_kind text,
  target_actor_user uuid,
  target_request_key uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  setting public.optimizer_settings%rowtype;
  existing public.optimizer_runs%rowtype;
  run_id uuid:=gen_random_uuid();
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_trigger_kind not in ('cron','owner') then
    raise exception 'Unsupported optimizer trigger.';
  end if;
  if target_request_key is null then raise exception 'Optimizer request key is required.'; end if;

  if not exists(
    select 1 from public.project_members pm
    where pm.project_id=target_project and pm.user_id=target_actor_user
      and pm.status='active' and pm.role='owner'
  ) then
    raise insufficient_privilege using message='An active project owner is required for optimizer execution.';
  end if;

  select * into setting
  from public.optimizer_settings
  where project_id=target_project
  for update;

  if not found then
    insert into public.optimizer_settings(project_id,enabled,cadence_hours,max_suggestions,next_run_after)
    values(target_project,false,6,5,now())
    returning * into setting;
  end if;

  select * into existing
  from public.optimizer_runs
  where project_id=target_project and request_key=target_request_key;
  if found then
    return jsonb_build_object('run_id',existing.id,'created',false,'status',existing.status,'skip',false);
  end if;

  if target_trigger_kind='cron' and not setting.enabled then
    return jsonb_build_object('run_id',null,'created',false,'status','disabled','skip',true);
  end if;

  if target_trigger_kind='cron'
     and setting.next_run_after is not null
     and setting.next_run_after>now() then
    return jsonb_build_object(
      'run_id',null,'created',false,'status','not_due','skip',true,
      'next_run_after',setting.next_run_after
    );
  end if;

  if exists(
    select 1 from public.optimizer_runs r
    where r.project_id=target_project and r.status='running'
      and r.started_at>=now()-interval '45 minutes'
  ) then
    return jsonb_build_object('run_id',null,'created',false,'status','run_in_progress','skip',true);
  end if;

  insert into public.optimizer_runs(
    id,project_id,request_key,trigger_kind,actor_user_id,status
  ) values(
    run_id,target_project,target_request_key,target_trigger_kind,target_actor_user,'running'
  );

  update public.optimizer_settings
  set last_run_at=now(),
      next_run_after=now()+make_interval(hours=>cadence_hours),
      updated_at=now()
  where project_id=target_project;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'DATANEST_OPTIMIZER_RUN_STARTED','DataNest Audit Optimizer',
    jsonb_build_object(
      'run_id',run_id,'trigger_kind',target_trigger_kind,
      'actor_user_id',target_actor_user,
      'governance_effect',false,'deployment_authority',false
    )
  );

  return jsonb_build_object('run_id',run_id,'created',true,'status','running','skip',false);
end;
$$;

create or replace function public.service_begin_optimizer_ai_request_v1(
  target_run uuid,
  target_client_request_id uuid,
  target_message_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.optimizer_runs%rowtype;
  existing public.ai_usage_requests%rowtype;
  req public.ai_usage_requests%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_client_request_id is null then raise exception 'client_request_id is required.'; end if;

  select * into r from public.optimizer_runs where id=target_run for update;
  if not found then raise exception 'Optimizer run not found.'; end if;
  if r.status<>'running' then raise exception 'Optimizer run is not active.'; end if;

  select * into existing
  from public.ai_usage_requests
  where user_id=r.actor_user_id and client_request_id=target_client_request_id;

  if found then
    if existing.optimizer_run_id is distinct from r.id
       or coalesce(existing.metadata->>'message_sha256','')<>coalesce(target_message_fingerprint,'') then
      raise exception 'Request key already exists with a different optimizer payload.';
    end if;
    return jsonb_build_object(
      'id',existing.id,'is_new',false,'status',existing.status,'provider_called',existing.provider_called
    );
  end if;

  insert into public.ai_usage_requests(
    client_request_id,project_id,job_id,assessment_id,optimizer_run_id,user_id,
    status,provider_called,metadata
  )
  values(
    target_client_request_id,r.project_id,null,null,r.id,r.actor_user_id,
    'pending',false,jsonb_build_object(
      'message_sha256',target_message_fingerprint,
      'purpose','datanest_audit_optimizer',
      'optimizer_run_id',r.id
    )
  )
  returning * into req;

  update public.optimizer_runs
  set provider_request_id=req.id
  where id=r.id;

  return jsonb_build_object('id',req.id,'is_new',true,'status',req.status,'provider_called',false);
end;
$$;

create or replace function public.service_complete_optimizer_run_v1(
  target_run uuid,
  target_status text,
  target_summary text default null,
  target_limitations jsonb default '[]'::jsonb,
  target_evidence_snapshot jsonb default '{}'::jsonb,
  target_suggestions jsonb default '[]'::jsonb,
  target_error_category text default null,
  target_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.optimizer_runs%rowtype;
  setting public.optimizer_settings%rowtype;
  item jsonb;
  suggestion_id uuid;
  trace text;
  fp text;
  risk text;
  confidence_value numeric;
  evidence_refs_value text[];
  standard_refs_value text[];
  inserted_count integer:=0;
  max_items integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_status not in ('succeeded','failed','denied') then
    raise exception 'Unsupported optimizer terminal status.';
  end if;
  if jsonb_typeof(coalesce(target_limitations,'[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(target_suggestions,'[]'::jsonb))<>'array' then
    raise exception 'Optimizer limitations and suggestions must be arrays.';
  end if;

  select * into r from public.optimizer_runs where id=target_run for update;
  if not found then raise exception 'Optimizer run not found.'; end if;
  if r.status<>'running' then
    return jsonb_build_object('run_id',r.id,'status',r.status,'suggestion_count',r.suggestion_count,'idempotent',true);
  end if;

  select * into setting from public.optimizer_settings where project_id=r.project_id;
  max_items:=least(coalesce(setting.max_suggestions,5),10);

  if target_status='succeeded' then
    for item in
      select value from jsonb_array_elements(coalesce(target_suggestions,'[]'::jsonb)) with ordinality
      where ordinality<=max_items
    loop
      if jsonb_typeof(item)<>'object' then continue; end if;
      if nullif(btrim(coalesce(item->>'title','')),'') is null
         or nullif(btrim(coalesce(item->>'problemStatement','')),'') is null
         or nullif(btrim(coalesce(item->>'hypothesis','')),'') is null
         or nullif(btrim(coalesce(item->>'desiredOutcome','')),'') is null then
        continue;
      end if;

      fp:=nullif(btrim(coalesce(item->>'fingerprint','')),'');
      if fp is null then
        fp:=encode(
          extensions.digest(
            lower(btrim(item->>'title'))||E'\n'||
            lower(btrim(item->>'problemStatement'))||E'\n'||
            coalesce(item->'proposedChange','{}'::jsonb)::text,
            'sha256'
          ),
          'hex'
        );
      end if;

      if exists(
        select 1 from public.optimizer_suggestions s
        where s.project_id=r.project_id and s.fingerprint=fp
          and s.status in ('proposed','approved')
      ) then
        continue;
      end if;

      risk:=lower(coalesce(item->>'riskClass','moderate'));
      if risk not in ('low','moderate','high','critical') then risk:='moderate'; end if;

      begin
        confidence_value:=greatest(0,least(1,(item->>'confidence')::numeric));
      exception when others then
        confidence_value:=null;
      end;

      select coalesce(array_agg(value),'{}'::text[])
      into evidence_refs_value
      from jsonb_array_elements_text(
        case when jsonb_typeof(item->'evidenceRefs')='array' then item->'evidenceRefs' else '[]'::jsonb end
      );

      select coalesce(array_agg(s.value),'{}'::text[])
      into standard_refs_value
      from jsonb_array_elements_text(
        case when jsonb_typeof(item->'standardRefs')='array' then item->'standardRefs' else '[]'::jsonb end
      ) s(value)
      where exists(
        select 1 from public.governance_standards_register g
        where g.project_id=r.project_id and g.standard_key=s.value and g.active=true
      );

      suggestion_id:=gen_random_uuid();
      trace:='DN-OPT-'||upper(substr(replace(suggestion_id::text,'-',''),1,16));

      insert into public.optimizer_suggestions(
        id,project_id,run_id,trace_key,fingerprint,title,problem_statement,hypothesis,
        desired_outcome,proposed_change,guardrails,evidence_refs,standard_refs,
        risk_class,confidence,status
      )
      values(
        suggestion_id,r.project_id,r.id,trace,fp,
        left(btrim(item->>'title'),300),
        left(btrim(item->>'problemStatement'),4000),
        left(btrim(item->>'hypothesis'),4000),
        left(btrim(item->>'desiredOutcome'),4000),
        case when jsonb_typeof(item->'proposedChange')='object' then item->'proposedChange' else jsonb_build_object('description',coalesce(item->>'proposedChange','')) end,
        coalesce(
          case when jsonb_typeof(item->'guardrails')='object' then item->'guardrails' else null end,
          '{}'::jsonb
        )||jsonb_build_object(
          'owner_approval_required',true,
          'formal_governance_required',true,
          'no_automatic_deployment',true,
          'no_automatic_vote',true,
          'no_automatic_ratification',true
        ),
        evidence_refs_value,standard_refs_value,risk,confidence_value,'proposed'
      );
      inserted_count:=inserted_count+1;
    end loop;
  end if;

  update public.optimizer_runs
  set status=target_status,
      summary=case when target_summary is null then null else left(target_summary,6000) end,
      limitations=coalesce(target_limitations,'[]'::jsonb),
      evidence_snapshot=coalesce(target_evidence_snapshot,'{}'::jsonb),
      suggestion_count=inserted_count,
      error_category=target_error_category,
      error_message=case when target_error_message is null then null else left(target_error_message,500) end,
      completed_at=now()
  where id=r.id;

  if target_status='succeeded' then
    update public.optimizer_settings
    set last_success_at=now(),updated_at=now()
    where project_id=r.project_id;
  end if;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    r.project_id,
    case when target_status='succeeded' then 'DATANEST_OPTIMIZER_RUN_COMPLETED' else 'DATANEST_OPTIMIZER_RUN_FAILED' end,
    'DataNest Audit Optimizer',
    jsonb_build_object(
      'run_id',r.id,'status',target_status,'suggestion_count',inserted_count,
      'governance_effect',false,'deployment_authority',false
    )
  );

  return jsonb_build_object(
    'run_id',r.id,'status',target_status,'suggestion_count',inserted_count,'idempotent',false
  );
end;
$$;

create or replace function private.get_owner_optimizer_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  setting jsonb;
  runs jsonb;
  suggestions jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not exists(
    select 1 from public.project_members pm
    where pm.project_id=target_project and pm.user_id=caller
      and pm.status='active' and pm.role='owner'
  ) then
    raise insufficient_privilege using message='Owner access is required.';
  end if;

  select to_jsonb(s) into setting
  from (
    select project_id,enabled,cadence_hours,max_suggestions,last_run_at,last_success_at,
           next_run_after,updated_at
    from public.optimizer_settings
    where project_id=target_project
  ) s;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
  into runs
  from (
    select id,request_key,trigger_kind,status,provider_request_id,summary,limitations,
           suggestion_count,error_category,error_message,started_at,completed_at,created_at
    from public.optimizer_runs
    where project_id=target_project
    order by created_at desc
    limit 30
  ) r;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb)
  into suggestions
  from (
    select id,run_id,trace_key,title,problem_statement,hypothesis,desired_outcome,
           proposed_change,guardrails,evidence_refs,standard_refs,risk_class,confidence,
           status,reviewed_at,review_rationale,linked_observation_id,
           linked_improvement_candidate_id,governance_effect,deployment_authority,created_at
    from public.optimizer_suggestions
    where project_id=target_project
    order by
      case status when 'proposed' then 0 when 'approved' then 1 else 2 end,
      created_at desc
    limit 100
  ) s;

  return jsonb_build_object(
    'role','owner',
    'settings',coalesce(setting,'{}'::jsonb),
    'runs',runs,
    'suggestions',suggestions,
    'pending_count',(select count(*) from public.optimizer_suggestions where project_id=target_project and status='proposed'),
    'boundaries',jsonb_build_object(
      'ai_can_suggest',true,
      'ai_can_approve',false,
      'ai_can_deploy',false,
      'owner_approval_creates_governance_candidate',true,
      'formal_governance_still_required',true
    )
  );
end;
$$;

create or replace function private.set_optimizer_settings_v1(
  target_project uuid,
  target_enabled boolean,
  target_cadence_hours integer,
  target_max_suggestions integer
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare caller uuid:=auth.uid();
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not exists(
    select 1 from public.project_members pm
    where pm.project_id=target_project and pm.user_id=caller
      and pm.status='active' and pm.role='owner'
  ) then
    raise insufficient_privilege using message='Owner access is required.';
  end if;
  if target_cadence_hours<1 or target_cadence_hours>168 then
    raise exception 'Optimizer cadence must be between 1 and 168 hours.';
  end if;
  if target_max_suggestions<1 or target_max_suggestions>10 then
    raise exception 'Optimizer max suggestions must be between 1 and 10.';
  end if;

  insert into public.optimizer_settings(
    project_id,enabled,cadence_hours,max_suggestions,next_run_after,updated_by,updated_at
  )
  values(
    target_project,target_enabled,target_cadence_hours,target_max_suggestions,
    case when target_enabled then now() else null end,caller,now()
  )
  on conflict(project_id) do update set
    enabled=excluded.enabled,
    cadence_hours=excluded.cadence_hours,
    max_suggestions=excluded.max_suggestions,
    next_run_after=case
      when excluded.enabled and not public.optimizer_settings.enabled then now()
      when excluded.enabled then coalesce(public.optimizer_settings.next_run_after,now())
      else null
    end,
    updated_by=caller,
    updated_at=now();

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,'DATANEST_OPTIMIZER_SETTINGS_UPDATED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'enabled',target_enabled,'cadence_hours',target_cadence_hours,
      'max_suggestions',target_max_suggestions,'owner_only',true
    )
  );

  return target_project;
end;
$$;

create or replace function private.review_optimizer_suggestion_v1(
  target_suggestion uuid,
  target_decision text,
  target_rationale text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  s public.optimizer_suggestions%rowtype;
  observation_id uuid;
  candidate_id uuid;
  review_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into s from public.optimizer_suggestions where id=target_suggestion for update;
  if not found then raise exception 'Optimizer suggestion not found.'; end if;

  if not exists(
    select 1 from public.project_members pm
    where pm.project_id=s.project_id and pm.user_id=caller
      and pm.status='active' and pm.role='owner'
  ) then
    raise insufficient_privilege using message='Owner approval is required.';
  end if;

  if s.status<>'proposed' then
    return jsonb_build_object(
      'suggestion_id',s.id,'status',s.status,
      'linked_improvement_candidate_id',s.linked_improvement_candidate_id,
      'idempotent',true
    );
  end if;
  if target_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;
  if char_length(btrim(coalesce(target_rationale,'')))<3 then
    raise exception 'Review rationale is required.';
  end if;

  if target_decision='reject' then
    update public.optimizer_suggestions
    set status='rejected',reviewed_by=caller,reviewed_at=now(),
        review_rationale=left(btrim(target_rationale),4000)
    where id=s.id;

    insert into public.events(project_id,event_type,actor,payload)
    values(
      s.project_id,'DATANEST_OPTIMIZER_SUGGESTION_REJECTED',
      coalesce(auth.jwt()->>'email',caller::text),
      jsonb_build_object('suggestion_id',s.id,'trace_key',s.trace_key,'governance_effect',false)
    );
    return jsonb_build_object('suggestion_id',s.id,'status','rejected','idempotent',false);
  end if;

  observation_id:=private.record_governance_observation_v1(
    s.project_id,
    'audit',
    'Owner-approved DataNest AI optimizer hypothesis · '||s.title,
    s.risk_class,
    s.confidence,
    s.trace_key,
    jsonb_build_object(
      'optimizer_suggestion_id',s.id,
      'optimizer_run_id',s.run_id,
      'evidence_refs',s.evidence_refs,
      'owner_review_rationale',left(btrim(target_rationale),4000),
      'ai_generated',true,
      'authoritative_change',false
    ),
    now()
  );

  candidate_id:=private.create_governance_improvement_candidate_v1(
    s.project_id,
    s.title,
    s.problem_statement,
    s.hypothesis,
    s.desired_outcome,
    array[observation_id],
    s.standard_refs,
    s.risk_class,
    s.confidence,
    s.proposed_change,
    s.guardrails||jsonb_build_object(
      'optimizer_suggestion_id',s.id,
      'owner_approved',true,
      'owner_approval_is_not_deployment',true
    )
  );

  review_id:=private.review_governance_improvement_candidate_v1(
    candidate_id,
    'ready_for_governance',
    'Owner approved optimizer suggestion for formal governance routing. '||left(btrim(target_rationale),3500),
    jsonb_build_object(
      'optimizer_suggestion_id',s.id,
      'optimizer_run_id',s.run_id,
      'owner_review',true
    )
  );

  update public.optimizer_suggestions
  set status='approved',reviewed_by=caller,reviewed_at=now(),
      review_rationale=left(btrim(target_rationale),4000),
      linked_observation_id=observation_id,
      linked_improvement_candidate_id=candidate_id
  where id=s.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    s.project_id,'DATANEST_OPTIMIZER_SUGGESTION_APPROVED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'suggestion_id',s.id,'trace_key',s.trace_key,
      'observation_id',observation_id,'candidate_id',candidate_id,'review_id',review_id,
      'automatic_deployment',false,'automatic_vote',false,'automatic_ratification',false
    )
  );

  return jsonb_build_object(
    'suggestion_id',s.id,'status','approved',
    'observation_id',observation_id,'candidate_id',candidate_id,'review_id',review_id,
    'idempotent',false
  );
end;
$$;

create or replace function public.get_owner_optimizer_workspace_v1(
  target_project uuid
) returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.get_owner_optimizer_workspace_v1(target_project);
$$;

create or replace function public.set_optimizer_settings_v1(
  target_project uuid,
  target_enabled boolean,
  target_cadence_hours integer,
  target_max_suggestions integer
) returns uuid
language sql
security invoker
set search_path=''
as $$
  select private.set_optimizer_settings_v1(
    target_project,target_enabled,target_cadence_hours,target_max_suggestions
  );
$$;

create or replace function public.review_optimizer_suggestion_v1(
  target_suggestion uuid,
  target_decision text,
  target_rationale text
) returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.review_optimizer_suggestion_v1(
    target_suggestion,target_decision,target_rationale
  );
$$;

revoke all on function public.service_verify_optimizer_cron_token_v1(text) from public,anon,authenticated;
revoke all on function public.service_get_optimizer_evidence_v1(uuid) from public,anon,authenticated;
revoke all on function public.service_create_optimizer_run_v1(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.service_begin_optimizer_ai_request_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.service_complete_optimizer_run_v1(uuid,text,text,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;

grant execute on function public.service_verify_optimizer_cron_token_v1(text) to service_role;
grant execute on function public.service_get_optimizer_evidence_v1(uuid) to service_role;
grant execute on function public.service_create_optimizer_run_v1(uuid,text,uuid,uuid) to service_role;
grant execute on function public.service_begin_optimizer_ai_request_v1(uuid,uuid,text) to service_role;
grant execute on function public.service_complete_optimizer_run_v1(uuid,text,text,jsonb,jsonb,jsonb,text,text) to service_role;

revoke all on function public.get_owner_optimizer_workspace_v1(uuid) from public,anon;
revoke all on function public.set_optimizer_settings_v1(uuid,boolean,integer,integer) from public,anon;
revoke all on function public.review_optimizer_suggestion_v1(uuid,text,text) from public,anon;

grant execute on function public.get_owner_optimizer_workspace_v1(uuid) to authenticated;
grant execute on function public.set_optimizer_settings_v1(uuid,boolean,integer,integer) to authenticated;
grant execute on function public.review_optimizer_suggestion_v1(uuid,text,text) to authenticated;

commit;
