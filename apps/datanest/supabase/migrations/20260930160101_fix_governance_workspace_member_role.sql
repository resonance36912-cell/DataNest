begin;

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
  member_role_value text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;
  if not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  can_manage := private.has_project_role(target_project,array['owner','admin']);

  select pm.role into member_role_value
  from public.project_members pm
  where pm.project_id=target_project
    and pm.user_id=caller
    and pm.status='active'
    and pm.role in ('owner','admin','operator','viewer');

  can_vote := member_role_value is not null;

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
    'member_role',member_role_value,
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

commit;
