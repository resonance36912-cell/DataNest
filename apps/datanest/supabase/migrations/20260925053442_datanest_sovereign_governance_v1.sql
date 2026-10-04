begin;

create table if not exists public.governance_protocol_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  protocol_key text not null default 'sovereign-governance',
  version integer not null check (version > 0),
  title text not null,
  mission text,
  vision text,
  body text not null,
  principles jsonb not null default '[]'::jsonb check (jsonb_typeof(principles)='array'),
  status text not null default 'draft' check (status in ('draft','ratified','rejected','superseded')),
  content_hash text not null,
  proposed_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  proposed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  effective_from timestamptz,
  supersedes_protocol_id uuid references public.governance_protocol_versions(id),
  contractual_effect boolean not null default false check (contractual_effect=false),
  ownership_effect boolean not null default false check (ownership_effect=false),
  financial_authority_effect boolean not null default false check (financial_authority_effect=false),
  role_authority_effect boolean not null default false check (role_authority_effect=false),
  unique(project_id,protocol_key,version)
);

create unique index if not exists governance_protocol_one_ratified_idx
  on public.governance_protocol_versions(project_id,protocol_key)
  where status='ratified';
create index if not exists governance_protocol_project_idx
  on public.governance_protocol_versions(project_id,status,version desc);
create index if not exists governance_protocol_proposed_by_idx
  on public.governance_protocol_versions(proposed_by);
create index if not exists governance_protocol_reviewed_by_idx
  on public.governance_protocol_versions(reviewed_by)
  where reviewed_by is not null;
create index if not exists governance_protocol_supersedes_idx
  on public.governance_protocol_versions(supersedes_protocol_id)
  where supersedes_protocol_id is not null;

create table if not exists public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trace_key text not null unique,
  proposal_type text not null check (proposal_type in (
    'protocol_change','operational_rule','process_change','clarification','advisory','dispute_followup'
  )),
  title text not null,
  summary text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','accepted','rejected','withdrawn','expired')),
  proposed_by uuid not null references auth.users(id),
  based_on_protocol_id uuid references public.governance_protocol_versions(id),
  target_protocol_id uuid references public.governance_protocol_versions(id),
  quorum_count integer not null default 1 check (quorum_count >= 1),
  decision_rule text not null default 'simple_majority' check (decision_rule='simple_majority'),
  opens_at timestamptz not null default now(),
  closes_at timestamptz,
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  contractual_effect boolean not null default false check (contractual_effect=false),
  ownership_effect boolean not null default false check (ownership_effect=false),
  financial_authority_effect boolean not null default false check (financial_authority_effect=false),
  role_authority_effect boolean not null default false check (role_authority_effect=false),
  created_at timestamptz not null default now(),
  check (closes_at is null or closes_at > opens_at),
  check (
    (proposal_type='protocol_change' and target_protocol_id is not null)
    or (proposal_type<>'protocol_change')
  )
);

create index if not exists governance_proposals_project_idx
  on public.governance_proposals(project_id,status,created_at desc);
create index if not exists governance_proposals_proposed_by_idx
  on public.governance_proposals(proposed_by,created_at desc);
create index if not exists governance_proposals_based_protocol_idx
  on public.governance_proposals(based_on_protocol_id)
  where based_on_protocol_id is not null;
create index if not exists governance_proposals_target_protocol_idx
  on public.governance_proposals(target_protocol_id)
  where target_protocol_id is not null;
create index if not exists governance_proposals_closed_by_idx
  on public.governance_proposals(closed_by)
  where closed_by is not null;

create table if not exists public.governance_vote_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.governance_proposals(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  choice text not null check (choice in ('support','oppose','abstain')),
  vote_weight numeric not null default 1 check (vote_weight=1),
  role_snapshot text not null check (role_snapshot in ('owner','admin','operator','viewer')),
  rationale text,
  created_at timestamptz not null default now(),
  unique(proposal_id,user_id,sequence)
);

create index if not exists governance_vote_events_project_idx
  on public.governance_vote_events(project_id,proposal_id,created_at desc);
create index if not exists governance_vote_events_user_idx
  on public.governance_vote_events(user_id,created_at desc);

create table if not exists public.governance_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  proposal_id uuid not null unique references public.governance_proposals(id) on delete restrict,
  trace_key text not null unique,
  outcome text not null check (outcome in ('accepted','rejected')),
  support_count integer not null check (support_count >= 0),
  oppose_count integer not null check (oppose_count >= 0),
  abstain_count integer not null check (abstain_count >= 0),
  eligible_voter_count integer not null check (eligible_voter_count >= 0),
  quorum_met boolean not null,
  independent_support boolean not null,
  decision_rule text not null default 'simple_majority' check (decision_rule='simple_majority'),
  summary text,
  closed_by uuid not null references auth.users(id),
  protocol_version_id uuid references public.governance_protocol_versions(id),
  decided_at timestamptz not null default now(),
  contractual_effect boolean not null default false check (contractual_effect=false),
  ownership_effect boolean not null default false check (ownership_effect=false),
  financial_authority_effect boolean not null default false check (financial_authority_effect=false),
  role_authority_effect boolean not null default false check (role_authority_effect=false)
);

create index if not exists governance_decisions_project_idx
  on public.governance_decisions(project_id,decided_at desc);
create index if not exists governance_decisions_closed_by_idx
  on public.governance_decisions(closed_by);
create index if not exists governance_decisions_protocol_idx
  on public.governance_decisions(protocol_version_id)
  where protocol_version_id is not null;

create table if not exists public.governance_disputes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trace_key text not null unique,
  target_type text not null check (target_type in ('protocol','proposal','decision')),
  target_id uuid not null,
  title text not null,
  grounds text not null,
  requested_remedy text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  filed_by uuid not null references auth.users(id),
  filed_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists governance_disputes_project_idx
  on public.governance_disputes(project_id,status,filed_at desc);
create index if not exists governance_disputes_filed_by_idx
  on public.governance_disputes(filed_by,filed_at desc);

create table if not exists public.governance_dispute_resolutions (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null unique references public.governance_disputes(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  trace_key text not null unique,
  outcome text not null check (outcome in ('upheld','clarified','refer_to_new_proposal','dismissed')),
  resolution_text text not null,
  replacement_proposal_id uuid references public.governance_proposals(id),
  resolved_by uuid not null references auth.users(id),
  resolved_at timestamptz not null default now(),
  source_record_mutated boolean not null default false check (source_record_mutated=false)
);

create index if not exists governance_dispute_resolutions_project_idx
  on public.governance_dispute_resolutions(project_id,resolved_at desc);
create index if not exists governance_dispute_resolutions_replacement_idx
  on public.governance_dispute_resolutions(replacement_proposal_id)
  where replacement_proposal_id is not null;
create index if not exists governance_dispute_resolutions_resolved_by_idx
  on public.governance_dispute_resolutions(resolved_by);

create or replace function public.create_governance_protocol_draft_v1(
  target_project uuid,
  target_title text,
  target_mission text,
  target_vision text,
  target_body text,
  target_principles jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  next_version integer;
  protocol_id uuid;
  normalized_principles jsonb := coalesce(target_principles,'[]'::jsonb);
  protocol_hash text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to draft a governance protocol version.';
  end if;
  if nullif(btrim(coalesce(target_title,'')),'') is null
     or nullif(btrim(coalesce(target_body,'')),'') is null then
    raise exception 'Protocol title and body are required.';
  end if;
  if jsonb_typeof(normalized_principles)<>'array' then
    raise exception 'Protocol principles must be a JSON array.';
  end if;

  select coalesce(max(version),0)+1
  into next_version
  from public.governance_protocol_versions
  where project_id=target_project
    and protocol_key='sovereign-governance';

  protocol_hash := md5(
    jsonb_build_object(
      'title',btrim(target_title),
      'mission',nullif(btrim(coalesce(target_mission,'')),''),
      'vision',nullif(btrim(coalesce(target_vision,'')),''),
      'body',btrim(target_body),
      'principles',normalized_principles,
      'version',next_version
    )::text
  );

  insert into public.governance_protocol_versions(
    project_id,protocol_key,version,title,mission,vision,body,principles,
    status,content_hash,proposed_by
  )
  values(
    target_project,'sovereign-governance',next_version,btrim(target_title),
    nullif(btrim(coalesce(target_mission,'')),''),
    nullif(btrim(coalesce(target_vision,'')),''),
    btrim(target_body),normalized_principles,'draft',protocol_hash,caller
  )
  returning id into protocol_id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,
    'GOVERNANCE_PROTOCOL_DRAFT_CREATED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'protocol_id',protocol_id,
      'protocol_key','sovereign-governance',
      'version',next_version,
      'content_hash',protocol_hash,
      'contractual_effect',false,
      'ownership_effect',false,
      'financial_authority_effect',false,
      'role_authority_effect',false
    )
  );

  return protocol_id;
end;
$$;

create or replace function public.create_governance_proposal_v1(
  target_project uuid,
  target_type text,
  target_title text,
  target_summary text,
  target_body text,
  target_protocol uuid default null,
  target_closes_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  proposal_id uuid := gen_random_uuid();
  trace text;
  current_protocol uuid;
  target_protocol_row public.governance_protocol_versions%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_role(target_project,array['owner','admin','operator','viewer']) then
    raise insufficient_privilege using message='Active project membership is required to create a governance proposal.';
  end if;
  if target_type not in ('protocol_change','operational_rule','process_change','clarification','advisory','dispute_followup') then
    raise exception 'Unsupported governance proposal type.';
  end if;
  if nullif(btrim(coalesce(target_title,'')),'') is null
     or nullif(btrim(coalesce(target_summary,'')),'') is null
     or nullif(btrim(coalesce(target_body,'')),'') is null then
    raise exception 'Proposal title, summary and body are required.';
  end if;
  if target_closes_at is not null and target_closes_at<=now() then
    raise exception 'Proposal close time must be in the future.';
  end if;

  if target_type='protocol_change' then
    if target_protocol is null then
      raise exception 'Protocol-change proposals require a draft protocol target.';
    end if;
    select * into target_protocol_row
    from public.governance_protocol_versions
    where id=target_protocol and project_id=target_project;
    if not found then raise exception 'Target protocol draft not found.'; end if;
    if target_protocol_row.status<>'draft' then
      raise exception 'Only draft protocol versions may be proposed for ratification.';
    end if;
  elsif target_protocol is not null then
    raise exception 'Only protocol-change proposals may target a protocol draft.';
  end if;

  select id into current_protocol
  from public.governance_protocol_versions
  where project_id=target_project
    and protocol_key='sovereign-governance'
    and status='ratified'
  limit 1;

  trace := 'DN-GOV-PROP-' || upper(substr(replace(proposal_id::text,'-',''),1,16));

  insert into public.governance_proposals(
    id,project_id,trace_key,proposal_type,title,summary,body,status,proposed_by,
    based_on_protocol_id,target_protocol_id,quorum_count,decision_rule,closes_at
  )
  values(
    proposal_id,target_project,trace,target_type,btrim(target_title),btrim(target_summary),
    btrim(target_body),'open',caller,current_protocol,target_protocol,1,'simple_majority',target_closes_at
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,
    'GOVERNANCE_PROPOSAL_OPENED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'proposal_id',proposal_id,
      'trace_key',trace,
      'proposal_type',target_type,
      'target_protocol_id',target_protocol,
      'decision_rule','simple_majority',
      'vote_weighting','one_active_member_one_vote',
      'contractual_effect',false,
      'ownership_effect',false,
      'financial_authority_effect',false,
      'role_authority_effect',false
    )
  );

  return proposal_id;
end;
$$;

create or replace function public.cast_governance_vote_v1(
  target_proposal uuid,
  target_choice text,
  target_rationale text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  proposal public.governance_proposals%rowtype;
  member_role text;
  next_sequence integer;
  vote_id uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_choice not in ('support','oppose','abstain') then
    raise exception 'Vote choice must be support, oppose or abstain.';
  end if;

  select * into proposal
  from public.governance_proposals
  where id=target_proposal
  for share;

  if not found then raise exception 'Governance proposal not found.'; end if;
  if proposal.status<>'open' then raise exception 'Only open proposals may receive votes.'; end if;
  if proposal.closes_at is not null and proposal.closes_at<=now() then
    raise exception 'The proposal voting window has closed.';
  end if;

  select pm.role into member_role
  from public.project_members pm
  where pm.project_id=proposal.project_id
    and pm.user_id=caller
    and pm.status='active'
    and pm.role in ('owner','admin','operator','viewer');

  if member_role is null then
    raise insufficient_privilege using message='Formal voting requires active project membership.';
  end if;

  select coalesce(max(sequence),0)+1
  into next_sequence
  from public.governance_vote_events
  where proposal_id=proposal.id and user_id=caller;

  insert into public.governance_vote_events(
    proposal_id,project_id,user_id,sequence,choice,vote_weight,role_snapshot,rationale
  )
  values(
    proposal.id,proposal.project_id,caller,next_sequence,target_choice,1,member_role,
    nullif(btrim(coalesce(target_rationale,'')),'')
  )
  returning id into vote_id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    proposal.project_id,
    'GOVERNANCE_VOTE_RECORDED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'proposal_id',proposal.id,
      'proposal_trace_key',proposal.trace_key,
      'vote_event_id',vote_id,
      'sequence',next_sequence,
      'choice',target_choice,
      'vote_weight',1,
      'role_snapshot',member_role,
      'sparks_weight',false,
      'reputation_weight',false
    )
  );

  return vote_id;
end;
$$;

create or replace function public.withdraw_governance_proposal_v1(
  target_proposal uuid,
  target_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  proposal public.governance_proposals%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into proposal
  from public.governance_proposals
  where id=target_proposal
  for update;

  if not found then raise exception 'Governance proposal not found.'; end if;
  if proposal.proposed_by<>caller then
    raise insufficient_privilege using message='Only the proposer may withdraw an open proposal.';
  end if;
  if proposal.status<>'open' then raise exception 'Only open proposals may be withdrawn.'; end if;

  update public.governance_proposals
  set status='withdrawn',closed_by=caller,closed_at=now()
  where id=proposal.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    proposal.project_id,
    'GOVERNANCE_PROPOSAL_WITHDRAWN',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'proposal_id',proposal.id,
      'trace_key',proposal.trace_key,
      'reason',nullif(btrim(coalesce(target_reason,'')),'')
    )
  );

  return proposal.id;
end;
$$;

create or replace function public.close_governance_proposal_v1(
  target_proposal uuid,
  target_summary text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  proposal public.governance_proposals%rowtype;
  support_count integer := 0;
  oppose_count integer := 0;
  abstain_count integer := 0;
  eligible_voter_count integer := 0;
  quorum_met boolean := false;
  independent_support boolean := false;
  outcome text;
  decision_id uuid := gen_random_uuid();
  decision_trace text;
  current_protocol uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into proposal
  from public.governance_proposals
  where id=target_proposal
  for update;

  if not found then raise exception 'Governance proposal not found.'; end if;
  if not private.has_project_role(proposal.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to close a governance proposal.';
  end if;
  if proposal.status<>'open' then
    if exists(select 1 from public.governance_decisions d where d.proposal_id=proposal.id) then
      select id into decision_id from public.governance_decisions where proposal_id=proposal.id;
      return decision_id;
    end if;
    raise exception 'Only open proposals may be closed.';
  end if;
  if proposal.closes_at is not null and proposal.closes_at>now() then
    raise exception 'The proposal voting window is still open.';
  end if;

  with effective_votes as (
    select distinct on (v.user_id)
      v.user_id,v.choice
    from public.governance_vote_events v
    join public.project_members pm
      on pm.project_id=v.project_id
     and pm.user_id=v.user_id
     and pm.status='active'
     and pm.role in ('owner','admin','operator','viewer')
    where v.proposal_id=proposal.id
    order by v.user_id,v.sequence desc,v.created_at desc
  )
  select
    count(*) filter (where choice='support')::integer,
    count(*) filter (where choice='oppose')::integer,
    count(*) filter (where choice='abstain')::integer,
    bool_or(user_id<>proposal.proposed_by and choice='support')
  into support_count,oppose_count,abstain_count,independent_support
  from effective_votes;

  support_count := coalesce(support_count,0);
  oppose_count := coalesce(oppose_count,0);
  abstain_count := coalesce(abstain_count,0);
  independent_support := coalesce(independent_support,false);

  select count(*)::integer
  into eligible_voter_count
  from public.project_members pm
  where pm.project_id=proposal.project_id
    and pm.status='active'
    and pm.role in ('owner','admin','operator','viewer');

  quorum_met := (support_count+oppose_count+abstain_count)>=proposal.quorum_count;
  outcome := case
    when quorum_met and support_count>oppose_count and independent_support then 'accepted'
    else 'rejected'
  end;

  select id into current_protocol
  from public.governance_protocol_versions
  where project_id=proposal.project_id
    and protocol_key='sovereign-governance'
    and status='ratified'
  limit 1;

  decision_trace := 'DN-GOV-DEC-' || upper(substr(replace(decision_id::text,'-',''),1,16));

  insert into public.governance_decisions(
    id,project_id,proposal_id,trace_key,outcome,
    support_count,oppose_count,abstain_count,eligible_voter_count,
    quorum_met,independent_support,decision_rule,summary,closed_by,protocol_version_id
  )
  values(
    decision_id,proposal.project_id,proposal.id,decision_trace,outcome,
    support_count,oppose_count,abstain_count,eligible_voter_count,
    quorum_met,independent_support,'simple_majority',
    nullif(btrim(coalesce(target_summary,'')),''),
    caller,current_protocol
  );

  update public.governance_proposals
  set status=outcome,closed_by=caller,closed_at=now()
  where id=proposal.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    proposal.project_id,
    'GOVERNANCE_DECISION_RECORDED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'proposal_id',proposal.id,
      'proposal_trace_key',proposal.trace_key,
      'decision_id',decision_id,
      'decision_trace_key',decision_trace,
      'outcome',outcome,
      'support_count',support_count,
      'oppose_count',oppose_count,
      'abstain_count',abstain_count,
      'eligible_voter_count',eligible_voter_count,
      'quorum_met',quorum_met,
      'independent_support',independent_support,
      'sparks_weight',false,
      'reputation_weight',false,
      'contractual_effect',false,
      'ownership_effect',false,
      'financial_authority_effect',false,
      'role_authority_effect',false
    )
  );

  return decision_id;
end;
$$;

create or replace function public.ratify_governance_protocol_v1(
  target_protocol uuid,
  target_proposal uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  protocol_row public.governance_protocol_versions%rowtype;
  proposal public.governance_proposals%rowtype;
  decision public.governance_decisions%rowtype;
  prior_protocol uuid;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  select * into protocol_row
  from public.governance_protocol_versions
  where id=target_protocol
  for update;

  if not found then raise exception 'Governance protocol draft not found.'; end if;
  if not private.has_project_role(protocol_row.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to ratify a governance protocol.';
  end if;
  if protocol_row.status='ratified' then return protocol_row.id; end if;
  if protocol_row.status<>'draft' then
    raise exception 'Only draft governance protocol versions may be ratified.';
  end if;

  select * into proposal
  from public.governance_proposals
  where id=target_proposal
    and project_id=protocol_row.project_id
    and proposal_type='protocol_change'
    and target_protocol_id=protocol_row.id;

  if not found then
    raise exception 'An accepted protocol-change proposal targeting this draft is required.';
  end if;

  select * into decision
  from public.governance_decisions
  where proposal_id=proposal.id
    and outcome='accepted'
    and quorum_met=true
    and independent_support=true;

  if not found then
    raise exception 'The protocol-change proposal has not been independently accepted.';
  end if;

  select id into prior_protocol
  from public.governance_protocol_versions
  where project_id=protocol_row.project_id
    and protocol_key=protocol_row.protocol_key
    and status='ratified'
    and id<>protocol_row.id
  for update;

  if prior_protocol is not null then
    update public.governance_protocol_versions
    set status='superseded'
    where id=prior_protocol;
  end if;

  update public.governance_protocol_versions
  set status='ratified',
      reviewed_by=caller,
      reviewed_at=now(),
      effective_from=now(),
      supersedes_protocol_id=prior_protocol
  where id=protocol_row.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    protocol_row.project_id,
    'GOVERNANCE_PROTOCOL_RATIFIED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'protocol_id',protocol_row.id,
      'protocol_version',protocol_row.version,
      'content_hash',protocol_row.content_hash,
      'proposal_id',proposal.id,
      'decision_id',decision.id,
      'supersedes_protocol_id',prior_protocol,
      'contractual_effect',false,
      'ownership_effect',false,
      'financial_authority_effect',false,
      'role_authority_effect',false
    )
  );

  return protocol_row.id;
end;
$$;

create or replace function public.file_governance_dispute_v1(
  target_project uuid,
  target_type text,
  target_id uuid,
  target_title text,
  target_grounds text,
  target_requested_remedy text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  dispute_id uuid := gen_random_uuid();
  trace text;
  target_exists boolean := false;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required to file a governance dispute.';
  end if;
  if target_type not in ('protocol','proposal','decision') then
    raise exception 'Dispute target must be protocol, proposal or decision.';
  end if;
  if nullif(btrim(coalesce(target_title,'')),'') is null
     or nullif(btrim(coalesce(target_grounds,'')),'') is null then
    raise exception 'Dispute title and grounds are required.';
  end if;

  if target_type='protocol' then
    select exists(
      select 1 from public.governance_protocol_versions
      where id=target_id and project_id=target_project
    ) into target_exists;
  elsif target_type='proposal' then
    select exists(
      select 1 from public.governance_proposals
      where id=target_id and project_id=target_project
    ) into target_exists;
  else
    select exists(
      select 1 from public.governance_decisions
      where id=target_id and project_id=target_project
    ) into target_exists;
  end if;

  if not target_exists then raise exception 'Governance dispute target not found in this project.'; end if;

  trace := 'DN-GOV-DISP-' || upper(substr(replace(dispute_id::text,'-',''),1,16));

  insert into public.governance_disputes(
    id,project_id,trace_key,target_type,target_id,title,grounds,requested_remedy,status,filed_by
  )
  values(
    dispute_id,target_project,trace,target_type,target_id,btrim(target_title),
    btrim(target_grounds),nullif(btrim(coalesce(target_requested_remedy,'')),''),
    'open',caller
  );

  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,
    'GOVERNANCE_DISPUTE_FILED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'dispute_id',dispute_id,
      'trace_key',trace,
      'target_type',target_type,
      'target_id',target_id,
      'source_record_mutated',false
    )
  );

  return dispute_id;
end;
$$;

create or replace function public.resolve_governance_dispute_v1(
  target_dispute uuid,
  target_outcome text,
  target_resolution text,
  target_replacement_proposal uuid default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  dispute public.governance_disputes%rowtype;
  replacement public.governance_proposals%rowtype;
  resolution_id uuid := gen_random_uuid();
  trace text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if target_outcome not in ('upheld','clarified','refer_to_new_proposal','dismissed') then
    raise exception 'Unsupported governance dispute outcome.';
  end if;
  if nullif(btrim(coalesce(target_resolution,'')),'') is null then
    raise exception 'A dispute resolution statement is required.';
  end if;

  select * into dispute
  from public.governance_disputes
  where id=target_dispute
  for update;

  if not found then raise exception 'Governance dispute not found.'; end if;
  if dispute.status<>'open' then
    if exists(select 1 from public.governance_dispute_resolutions where dispute_id=dispute.id) then
      select id into resolution_id from public.governance_dispute_resolutions where dispute_id=dispute.id;
      return resolution_id;
    end if;
    raise exception 'Only open disputes may be resolved.';
  end if;
  if not private.has_project_role(dispute.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to resolve a governance dispute.';
  end if;
  if dispute.filed_by=caller then
    raise insufficient_privilege using message='A stakeholder cannot resolve their own governance dispute.';
  end if;

  if target_outcome='refer_to_new_proposal' then
    if target_replacement_proposal is null then
      raise exception 'A replacement proposal is required for refer_to_new_proposal.';
    end if;
    select * into replacement
    from public.governance_proposals
    where id=target_replacement_proposal and project_id=dispute.project_id;
    if not found then raise exception 'Replacement proposal not found in this project.'; end if;
  elsif target_replacement_proposal is not null then
    raise exception 'Replacement proposals are only valid for refer_to_new_proposal outcomes.';
  end if;

  trace := 'DN-GOV-RES-' || upper(substr(replace(resolution_id::text,'-',''),1,16));

  insert into public.governance_dispute_resolutions(
    id,dispute_id,project_id,trace_key,outcome,resolution_text,
    replacement_proposal_id,resolved_by,source_record_mutated
  )
  values(
    resolution_id,dispute.id,dispute.project_id,trace,target_outcome,btrim(target_resolution),
    target_replacement_proposal,caller,false
  );

  update public.governance_disputes
  set status=case when target_outcome='dismissed' then 'dismissed' else 'resolved' end,
      closed_at=now()
  where id=dispute.id;

  insert into public.events(project_id,event_type,actor,payload)
  values(
    dispute.project_id,
    'GOVERNANCE_DISPUTE_RESOLVED',
    coalesce(auth.jwt()->>'email',caller::text),
    jsonb_build_object(
      'dispute_id',dispute.id,
      'dispute_trace_key',dispute.trace_key,
      'resolution_id',resolution_id,
      'resolution_trace_key',trace,
      'outcome',target_outcome,
      'replacement_proposal_id',target_replacement_proposal,
      'source_record_mutated',false
    )
  );

  return resolution_id;
end;
$$;

create or replace function public.get_governance_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  ratified_protocol jsonb;
  drafts jsonb;
  proposals jsonb;
  decisions jsonb;
  disputes jsonb;
  can_manage boolean;
  can_vote boolean;
  current_role text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  can_manage := private.has_project_role(target_project,array['owner','admin']);

  select pm.role into current_role
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active'
    and pm.role in ('owner','admin','operator','viewer');

  can_vote := current_role is not null;

  select to_jsonb(p) into ratified_protocol
  from public.governance_protocol_versions p
  where p.project_id=target_project
    and p.protocol_key='sovereign-governance'
    and p.status='ratified'
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.version desc),'[]'::jsonb)
  into drafts
  from (
    select id,project_id,protocol_key,version,title,mission,vision,body,principles,status,
           content_hash,proposed_by,proposed_at
    from public.governance_protocol_versions
    where project_id=target_project and status='draft'
    order by version desc
    limit 20
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'trace_key',p.trace_key,
    'proposal_type',p.proposal_type,
    'title',p.title,
    'summary',p.summary,
    'body',p.body,
    'status',p.status,
    'proposed_by',p.proposed_by,
    'based_on_protocol_id',p.based_on_protocol_id,
    'target_protocol_id',p.target_protocol_id,
    'quorum_count',p.quorum_count,
    'decision_rule',p.decision_rule,
    'opens_at',p.opens_at,
    'closes_at',p.closes_at,
    'closed_at',p.closed_at,
    'support_count',coalesce(v.support_count,0),
    'oppose_count',coalesce(v.oppose_count,0),
    'abstain_count',coalesce(v.abstain_count,0),
    'my_vote',v.my_vote
  ) order by p.created_at desc),'[]'::jsonb)
  into proposals
  from public.governance_proposals p
  left join lateral (
    with effective_votes as (
      select distinct on (g.user_id)
        g.user_id,g.choice
      from public.governance_vote_events g
      join public.project_members pm
        on pm.project_id=g.project_id
       and pm.user_id=g.user_id
       and pm.status='active'
       and pm.role in ('owner','admin','operator','viewer')
      where g.proposal_id=p.id
      order by g.user_id,g.sequence desc,g.created_at desc
    )
    select
      count(*) filter (where choice='support')::integer as support_count,
      count(*) filter (where choice='oppose')::integer as oppose_count,
      count(*) filter (where choice='abstain')::integer as abstain_count,
      max(choice) filter (where user_id=caller) as my_vote
    from effective_votes
  ) v on true
  where p.project_id=target_project;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.decided_at desc),'[]'::jsonb)
  into decisions
  from (
    select id,project_id,proposal_id,trace_key,outcome,support_count,oppose_count,abstain_count,
           eligible_voter_count,quorum_met,independent_support,decision_rule,summary,
           closed_by,protocol_version_id,decided_at
    from public.governance_decisions
    where project_id=target_project
    order by decided_at desc
    limit 100
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'trace_key',d.trace_key,
    'target_type',d.target_type,
    'target_id',d.target_id,
    'title',d.title,
    'grounds',d.grounds,
    'requested_remedy',d.requested_remedy,
    'status',d.status,
    'filed_by',d.filed_by,
    'filed_at',d.filed_at,
    'closed_at',d.closed_at,
    'resolution',case when r.id is null then null else jsonb_build_object(
      'id',r.id,
      'trace_key',r.trace_key,
      'outcome',r.outcome,
      'resolution_text',r.resolution_text,
      'replacement_proposal_id',r.replacement_proposal_id,
      'resolved_by',r.resolved_by,
      'resolved_at',r.resolved_at,
      'source_record_mutated',r.source_record_mutated
    ) end
  ) order by d.filed_at desc),'[]'::jsonb)
  into disputes
  from public.governance_disputes d
  left join public.governance_dispute_resolutions r on r.dispute_id=d.id
  where d.project_id=target_project;

  return jsonb_build_object(
    'ratified_protocol',ratified_protocol,
    'draft_protocols',coalesce(drafts,'[]'::jsonb),
    'proposals',coalesce(proposals,'[]'::jsonb),
    'decisions',coalesce(decisions,'[]'::jsonb),
    'disputes',coalesce(disputes,'[]'::jsonb),
    'can_manage',can_manage,
    'can_vote',can_vote,
    'member_role',current_role,
    'boundaries',jsonb_build_object(
      'formal_vote_basis','one_active_project_member_one_vote',
      'sparks_weight_votes',false,
      'reputation_weight_votes',false,
      'governance_changes_legal_ownership',false,
      'governance_amends_contracts',false,
      'governance_creates_royalty_entitlements',false,
      'governance_grants_project_roles',false,
      'dispute_resolution_mutates_source_records',false,
      'accepted_protocol_requires_independent_support',true
    )
  );
end;
$$;

alter table public.governance_protocol_versions enable row level security;
alter table public.governance_proposals enable row level security;
alter table public.governance_vote_events enable row level security;
alter table public.governance_decisions enable row level security;
alter table public.governance_disputes enable row level security;
alter table public.governance_dispute_resolutions enable row level security;

drop policy if exists governance_protocol_versions_select on public.governance_protocol_versions;
create policy governance_protocol_versions_select
on public.governance_protocol_versions for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_proposals_select on public.governance_proposals;
create policy governance_proposals_select
on public.governance_proposals for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_vote_events_select on public.governance_vote_events;
create policy governance_vote_events_select
on public.governance_vote_events for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_decisions_select on public.governance_decisions;
create policy governance_decisions_select
on public.governance_decisions for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_disputes_select on public.governance_disputes;
create policy governance_disputes_select
on public.governance_disputes for select to authenticated
using (private.has_project_access(project_id));

drop policy if exists governance_dispute_resolutions_select on public.governance_dispute_resolutions;
create policy governance_dispute_resolutions_select
on public.governance_dispute_resolutions for select to authenticated
using (private.has_project_access(project_id));

revoke all on public.governance_protocol_versions from anon,authenticated;
revoke all on public.governance_proposals from anon,authenticated;
revoke all on public.governance_vote_events from anon,authenticated;
revoke all on public.governance_decisions from anon,authenticated;
revoke all on public.governance_disputes from anon,authenticated;
revoke all on public.governance_dispute_resolutions from anon,authenticated;

grant select on public.governance_protocol_versions to authenticated;
grant select on public.governance_proposals to authenticated;
grant select on public.governance_vote_events to authenticated;
grant select on public.governance_decisions to authenticated;
grant select on public.governance_disputes to authenticated;
grant select on public.governance_dispute_resolutions to authenticated;

revoke all on function public.create_governance_protocol_draft_v1(uuid,text,text,text,text,jsonb) from public,anon;
revoke all on function public.create_governance_proposal_v1(uuid,text,text,text,text,uuid,timestamptz) from public,anon;
revoke all on function public.cast_governance_vote_v1(uuid,text,text) from public,anon;
revoke all on function public.withdraw_governance_proposal_v1(uuid,text) from public,anon;
revoke all on function public.close_governance_proposal_v1(uuid,text) from public,anon;
revoke all on function public.ratify_governance_protocol_v1(uuid,uuid) from public,anon;
revoke all on function public.file_governance_dispute_v1(uuid,text,uuid,text,text,text) from public,anon;
revoke all on function public.resolve_governance_dispute_v1(uuid,text,text,uuid) from public,anon;
revoke all on function public.get_governance_workspace_v1(uuid) from public,anon;

grant execute on function public.create_governance_protocol_draft_v1(uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.create_governance_proposal_v1(uuid,text,text,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.cast_governance_vote_v1(uuid,text,text) to authenticated;
grant execute on function public.withdraw_governance_proposal_v1(uuid,text) to authenticated;
grant execute on function public.close_governance_proposal_v1(uuid,text) to authenticated;
grant execute on function public.ratify_governance_protocol_v1(uuid,uuid) to authenticated;
grant execute on function public.file_governance_dispute_v1(uuid,text,uuid,text,text,text) to authenticated;
grant execute on function public.resolve_governance_dispute_v1(uuid,text,text,uuid) to authenticated;
grant execute on function public.get_governance_workspace_v1(uuid) to authenticated;

commit;
