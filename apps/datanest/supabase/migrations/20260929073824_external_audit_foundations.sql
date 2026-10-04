begin;

create table if not exists public.external_audit_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_request_id uuid not null,
  target_name text not null,
  target_kind text not null check (target_kind in ('website','application','repository','product','project','document','other')),
  target_goal text,
  target_reference text,
  status text not null default 'intake' check (status in ('intake','evidence','analysis','review','approved','verification','closed','blocked')),
  revision integer not null default 1 check (revision>0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,client_request_id)
);

create table if not exists public.external_audit_profiles (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.external_audit_assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null,
  profile_version integer not null default 1,
  domains text[] not null default '{}',
  jurisdiction text,
  selected_standards jsonb not null default '[]'::jsonb,
  excluded_standards jsonb not null default '[]'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(assessment_id,revision,profile_version)
);

create table if not exists public.external_audit_sources (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.external_audit_assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null,
  kind text not null,
  canonical_reference text not null,
  source_version text,
  fetched_at timestamptz,
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  content_text text,
  locator text,
  visibility text not null default 'project_restricted',
  acquisition_state text not null default 'pending' check (acquisition_state in ('pending','captured','blocked','failed','stale')),
  coverage_note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.external_audit_findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.external_audit_assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null,
  criterion_id text not null,
  evidence_ids uuid[] not null default '{}',
  observation text not null,
  limitation text,
  claim_kind text not null check (claim_kind in ('observed','inferred','unknown')),
  severity text not null check (severity in ('info','low','medium','high','critical')),
  confidence numeric not null check (confidence between 0 and 1),
  state text not null default 'draft' check (state in ('draft','observation','potential_gap','verified_nonconformity','accepted','rejected')),
  draft_action text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.external_audit_actions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.external_audit_assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  finding_id uuid not null references public.external_audit_findings(id) on delete cascade,
  outcome text not null,
  acceptance text,
  priority integer not null default 50 check (priority between 0 and 100),
  status text not null default 'proposed' check (status in ('proposed','approved','planned','verifying','closed','rejected')),
  job_id uuid references public.jobs(id) on delete set null,
  approval_request_id uuid,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  verification_source_id uuid references public.external_audit_sources(id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.external_audit_reviewers (
  assessment_id uuid not null references public.external_audit_assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  primary key(assessment_id,reviewer_user_id)
);

create table if not exists public.external_audit_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.external_audit_assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.external_audit_documents (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.external_audit_assessments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null,
  kind text not null check (kind in ('audit_plan','applicability_matrix','evidence_register','trace_matrix','findings_actions','review_log','assessment_report')),
  format text not null check (format in ('html','csv','json','pdf')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  content_text text not null,
  storage_reference text,
  visibility text not null default 'project_restricted',
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  unique(assessment_id,revision,kind,format,content_hash)
);

create index if not exists external_audit_assessments_project_idx on public.external_audit_assessments(project_id,updated_at desc);
create index if not exists external_audit_sources_assessment_idx on public.external_audit_sources(assessment_id,revision,created_at);
create index if not exists external_audit_findings_assessment_idx on public.external_audit_findings(assessment_id,revision,state);
create index if not exists external_audit_actions_assessment_idx on public.external_audit_actions(assessment_id,status);
create index if not exists external_audit_events_assessment_idx on public.external_audit_events(assessment_id,created_at);
create index if not exists external_audit_documents_assessment_idx on public.external_audit_documents(assessment_id,revision,generated_at desc);

alter table public.external_audit_assessments enable row level security;
alter table public.external_audit_profiles enable row level security;
alter table public.external_audit_sources enable row level security;
alter table public.external_audit_findings enable row level security;
alter table public.external_audit_actions enable row level security;
alter table public.external_audit_reviewers enable row level security;
alter table public.external_audit_events enable row level security;
alter table public.external_audit_documents enable row level security;

create policy external_audit_assessments_select on public.external_audit_assessments for select to authenticated using (private.is_project_member(project_id));
create policy external_audit_profiles_select on public.external_audit_profiles for select to authenticated using (private.is_project_member(project_id));
create policy external_audit_sources_select on public.external_audit_sources for select to authenticated using (private.is_project_member(project_id));
create policy external_audit_findings_select on public.external_audit_findings for select to authenticated using (private.is_project_member(project_id));
create policy external_audit_actions_select on public.external_audit_actions for select to authenticated using (private.is_project_member(project_id));
create policy external_audit_reviewers_select on public.external_audit_reviewers for select to authenticated using (private.is_project_member(project_id));
create policy external_audit_events_select on public.external_audit_events for select to authenticated using (private.is_project_member(project_id));
create policy external_audit_documents_select on public.external_audit_documents for select to authenticated using (private.is_project_member(project_id));

create policy external_audit_assessments_insert on public.external_audit_assessments for insert to authenticated
with check (private.has_project_role(project_id,array['owner','admin','operator']) and created_by=auth.uid());
create policy external_audit_assessments_update on public.external_audit_assessments for update to authenticated
using (private.has_project_role(project_id,array['owner','admin','operator']))
with check (private.has_project_role(project_id,array['owner','admin','operator']));
create policy external_audit_profiles_insert on public.external_audit_profiles for insert to authenticated
with check (private.has_project_role(project_id,array['owner','admin','operator']) and created_by=auth.uid());
create policy external_audit_sources_insert on public.external_audit_sources for insert to authenticated
with check (private.has_project_role(project_id,array['owner','admin','operator']));
create policy external_audit_findings_insert on public.external_audit_findings for insert to authenticated
with check (private.has_project_role(project_id,array['owner','admin','operator']));
create policy external_audit_actions_insert on public.external_audit_actions for insert to authenticated
with check (private.has_project_role(project_id,array['owner','admin','operator']));
create policy external_audit_reviewers_write on public.external_audit_reviewers for all to authenticated
using (private.has_project_role(project_id,array['owner','admin']))
with check (private.has_project_role(project_id,array['owner','admin']));
create policy external_audit_documents_insert on public.external_audit_documents for insert to authenticated
with check (private.has_project_role(project_id,array['owner','admin','operator']));

revoke all on public.external_audit_events from anon,authenticated;
grant select on public.external_audit_events to authenticated;
grant select,insert,update on public.external_audit_assessments,public.external_audit_profiles,public.external_audit_sources,public.external_audit_findings,public.external_audit_actions,public.external_audit_reviewers,public.external_audit_documents to authenticated;
grant select,insert,update on public.external_audit_assessments,public.external_audit_profiles,public.external_audit_sources,public.external_audit_findings,public.external_audit_actions,public.external_audit_reviewers,public.external_audit_events,public.external_audit_documents to service_role;

create or replace function private.external_audit_enforce_assessment_project()
returns trigger language plpgsql security definer set search_path=public,private as $$
begin
  if not exists(select 1 from public.external_audit_assessments a where a.id=new.assessment_id and a.project_id=new.project_id) then
    raise exception 'External audit child row must match the assessment project.';
  end if;
  return new;
end;
$$;

create or replace function private.external_audit_validate_finding_evidence()
returns trigger language plpgsql security definer set search_path=public,private as $$
begin
  if exists(
    select 1 from unnest(coalesce(new.evidence_ids,'{}'::uuid[])) evidence_id
    where not exists(
      select 1 from public.external_audit_sources s
      where s.id=evidence_id and s.assessment_id=new.assessment_id and s.project_id=new.project_id and s.revision=new.revision
    )
  ) then
    raise exception 'Finding evidence must belong to the same assessment project and revision.';
  end if;
  return new;
end;
$$;

create or replace function private.external_audit_validate_action_finding()
returns trigger language plpgsql security definer set search_path=public,private as $$
begin
  if not exists(
    select 1 from public.external_audit_findings f
    where f.id=new.finding_id and f.assessment_id=new.assessment_id and f.project_id=new.project_id
  ) then
    raise exception 'Action finding must belong to the same assessment project.';
  end if;
  return new;
end;
$$;

create trigger external_audit_profiles_scope_guard before insert or update on public.external_audit_profiles for each row execute function private.external_audit_enforce_assessment_project();
create trigger external_audit_sources_scope_guard before insert or update on public.external_audit_sources for each row execute function private.external_audit_enforce_assessment_project();
create trigger external_audit_findings_scope_guard before insert or update on public.external_audit_findings for each row execute function private.external_audit_enforce_assessment_project();
create trigger external_audit_actions_scope_guard before insert or update on public.external_audit_actions for each row execute function private.external_audit_enforce_assessment_project();
create trigger external_audit_reviewers_scope_guard before insert or update on public.external_audit_reviewers for each row execute function private.external_audit_enforce_assessment_project();
create trigger external_audit_events_scope_guard before insert or update on public.external_audit_events for each row execute function private.external_audit_enforce_assessment_project();
create trigger external_audit_documents_scope_guard before insert or update on public.external_audit_documents for each row execute function private.external_audit_enforce_assessment_project();
create trigger external_audit_findings_evidence_guard before insert or update of evidence_ids,assessment_id,project_id,revision on public.external_audit_findings for each row execute function private.external_audit_validate_finding_evidence();
create trigger external_audit_actions_finding_guard before insert or update of finding_id,assessment_id,project_id on public.external_audit_actions for each row execute function private.external_audit_validate_action_finding();

create or replace function public.create_external_audit_v1(
  target_project uuid,
  target_request_key uuid,
  target_name text,
  target_kind text,
  target_goal text,
  target_reference text default null
) returns table(assessment_id uuid,revision integer)
language plpgsql security invoker set search_path=public as $$
declare existing public.external_audit_assessments%rowtype;
declare created public.external_audit_assessments%rowtype;
begin
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required to create assessments.';
  end if;
  if target_request_key is null or btrim(coalesce(target_name,''))='' then raise exception 'Request key and target name are required.'; end if;
  select * into existing from public.external_audit_assessments where project_id=target_project and client_request_id=target_request_key;
  if found then
    if existing.target_name<>btrim(target_name) or existing.target_kind<>target_kind or coalesce(existing.target_goal,'')<>coalesce(target_goal,'') or coalesce(existing.target_reference,'')<>coalesce(target_reference,'') then
      raise exception 'Request key already exists with different assessment payload.';
    end if;
    return query select existing.id,existing.revision; return;
  end if;
  insert into public.external_audit_assessments(project_id,client_request_id,target_name,target_kind,target_goal,target_reference,created_by)
  values(target_project,target_request_key,btrim(target_name),target_kind,nullif(btrim(coalesce(target_goal,'')),''),nullif(btrim(coalesce(target_reference,'')),''),auth.uid())
  returning * into created;
  insert into public.external_audit_events(assessment_id,project_id,revision,event_type,actor_user_id,payload)
  values(created.id,target_project,created.revision,'ASSESSMENT_CREATED',auth.uid(),jsonb_build_object('target_kind',created.target_kind,'target_name',created.target_name));
  return query select created.id,created.revision;
end;
$$;

revoke all on function public.create_external_audit_v1(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.create_external_audit_v1(uuid,uuid,text,text,text,text) to authenticated;

commit;