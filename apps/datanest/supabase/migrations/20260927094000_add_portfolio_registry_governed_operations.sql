begin;

create or replace function private.portfolio_item_project(target_item uuid)
returns uuid
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare
  result uuid;
begin
  select project_id into result
  from public.portfolio_items
  where id=target_item;

  if result is null then
    raise exception 'Portfolio item not found.';
  end if;
  return result;
end;
$$;

create or replace function private.portfolio_contains_path(
  target_project uuid,
  start_item uuid,
  sought_item uuid
) returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  with recursive reachable(item_id) as (
    select start_item
    union
    select r.target_item_id
    from public.portfolio_relationships r
    join reachable x on x.item_id=r.source_item_id
    where r.project_id=target_project
      and r.status='active'
      and r.relationship_type='contains'
  )
  select exists(select 1 from reachable where item_id=sought_item);
$$;

create or replace function private.portfolio_has_active_critical_dependants(target_item uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select exists (
    select 1
    from public.portfolio_relationships r
    join public.portfolio_items source_item on source_item.id=r.source_item_id
    where r.target_item_id=target_item
      and r.status='active'
      and r.relationship_type='depends_on'
      and r.criticality='critical'
      and coalesce(source_item.current_lifecycle,'')<>'retired'
  );
$$;

create or replace function private.portfolio_has_active_production_surfaces(target_item uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select exists (
    select 1
    from public.product_surfaces s
    where s.portfolio_item_id=target_item
      and s.environment='production'
      and s.status='active'
  );
$$;

create or replace function private.validate_portfolio_promotion_packet(target_packet jsonb)
returns void
language plpgsql
immutable
security definer
set search_path=public,private
as $$
declare
  required_key text;
  required_keys text[] := array[
    'problem_statement',
    'intended_users',
    'value_proposition',
    'repeat_demand_evidence',
    'operational_owner',
    'independent_lifecycle_justification',
    'product_lab_evidence',
    'known_risks',
    'dependencies'
  ];
  value jsonb;
begin
  if target_packet is null or jsonb_typeof(target_packet)<>'object' then
    raise exception 'Promotion packet must be a JSON object.';
  end if;

  foreach required_key in array required_keys loop
    if not (target_packet ? required_key) then
      raise exception 'Promotion packet is missing required key: %',required_key;
    end if;
    value := target_packet->required_key;
    if value is null or value='null'::jsonb then
      raise exception 'Promotion packet key % must have evidence.',required_key;
    end if;
    if jsonb_typeof(value)='string' and nullif(btrim(target_packet->>required_key),'') is null then
      raise exception 'Promotion packet key % must have evidence.',required_key;
    end if;
  end loop;
end;
$$;

create or replace function private.record_portfolio_event(
  target_project uuid,
  target_event_type text,
  target_actor uuid,
  target_payload jsonb
) returns void
language plpgsql
security definer
set search_path=public,private,auth
as $$
begin
  insert into public.events(project_id,event_type,actor,payload)
  values(
    target_project,
    target_event_type,
    coalesce(auth.jwt()->>'email',target_actor::text),
    coalesce(target_payload,'{}'::jsonb)
  );
end;
$$;

revoke all on function private.portfolio_item_project(uuid) from public;
revoke all on function private.portfolio_contains_path(uuid,uuid,uuid) from public;
revoke all on function private.portfolio_has_active_critical_dependants(uuid) from public;
revoke all on function private.portfolio_has_active_production_surfaces(uuid) from public;
revoke all on function private.validate_portfolio_promotion_packet(jsonb) from public;
revoke all on function private.record_portfolio_event(uuid,text,uuid,jsonb) from public;

create or replace function public.create_portfolio_item_v1(
  target_project uuid,
  target_slug text,
  target_name text,
  target_kind text,
  target_lifecycle text default null,
  target_source_authority text default null,
  target_source_reference text default null,
  target_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  item_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  if nullif(btrim(coalesce(target_slug,'')),'') is null or nullif(btrim(coalesce(target_name,'')),'') is null then
    raise exception 'Portfolio slug and name are required.';
  end if;
  if target_kind not in ('governed_product','product_candidate','application','module','capability','external_capability') then
    raise exception 'Unsupported portfolio item kind.';
  end if;
  if target_kind='governed_product' then
    raise exception 'Governed product identity belongs to the Product Registry and must be created through the promotion workflow.';
  end if;
  if target_lifecycle is not null and target_lifecycle not in ('concept','experiment','validating','candidate','active','maintained','deprecated','retired') then
    raise exception 'Unsupported portfolio lifecycle.';
  end if;

  insert into public.portfolio_items(
    project_id,slug,name,item_kind,review_state,current_lifecycle,
    source_authority,source_reference,metadata,created_by
  )
  values(
    target_project,lower(btrim(target_slug)),btrim(target_name),target_kind,'pending_review',target_lifecycle,
    nullif(btrim(coalesce(target_source_authority,'')),''),
    nullif(btrim(coalesce(target_source_reference,'')),''),
    coalesce(target_metadata,'{}'::jsonb),caller
  )
  returning id into item_id;

  perform private.record_portfolio_event(
    target_project,'PORTFOLIO_ITEM_CREATED',caller,
    jsonb_build_object('portfolio_item_id',item_id,'item_kind',target_kind,'slug',lower(btrim(target_slug)))
  );
  return item_id;
end;
$$;

create or replace function public.propose_portfolio_classification_v1(
  target_item uuid,
  target_classification text,
  target_product uuid default null,
  target_rationale text default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  project uuid;
  proposal_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  project := private.portfolio_item_project(target_item);
  if not private.has_project_role(project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  if target_classification not in ('product_owned','shared_datanest_capability','independent_datanest_product','registered_external_capability') then
    raise exception 'Unsupported portfolio classification.';
  end if;

  if target_classification='product_owned' then
    if target_product is null then raise exception 'product_owned classification requires target_product_id.'; end if;
    if not exists(select 1 from public.products p where p.id=target_product and p.project_id=project) then
      raise exception 'Classification target product project mismatch.';
    end if;
  elsif target_product is not null then
    raise exception 'Only product_owned classification accepts a target product.';
  end if;

  insert into public.portfolio_classifications(
    project_id,portfolio_item_id,classification,target_product_id,status,
    rationale,evidence_reference,proposed_by
  )
  values(
    project,target_item,target_classification,target_product,'proposed',
    nullif(btrim(coalesce(target_rationale,'')),''),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),
    caller
  )
  returning id into proposal_id;

  perform private.record_portfolio_event(
    project,'PORTFOLIO_CLASSIFICATION_PROPOSED',caller,
    jsonb_build_object('classification_id',proposal_id,'portfolio_item_id',target_item,'classification',target_classification,'target_product_id',target_product)
  );
  return proposal_id;
end;
$$;

create or replace function public.approve_portfolio_classification_v1(
  target_classification_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  proposal public.portfolio_classifications%rowtype;
  item public.portfolio_items%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into proposal from public.portfolio_classifications
  where id=target_classification_id for update;
  if not found then raise exception 'Portfolio classification proposal not found.'; end if;

  if not private.has_project_role(proposal.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if proposal.status<>'proposed' then raise exception 'Only proposed classifications may be approved.'; end if;

  select * into item from public.portfolio_items
  where id=proposal.portfolio_item_id for update;
  if not found or item.project_id<>proposal.project_id then raise exception 'Portfolio classification project mismatch.'; end if;

  if proposal.classification='product_owned' then
    if proposal.target_product_id is null or not exists(
      select 1 from public.products p
      where p.id=proposal.target_product_id and p.project_id=proposal.project_id
    ) then
      raise exception 'Classification target product project mismatch.';
    end if;
  end if;

  update public.portfolio_classifications
  set status='superseded',superseded_at=now()
  where portfolio_item_id=proposal.portfolio_item_id and status='active';

  update public.portfolio_classifications
  set status='active',approved_by=caller,approved_at=now()
  where id=proposal.id;

  update public.portfolio_items
  set review_state=case
      when current_lifecycle='deprecated' then 'deprecated'
      when current_lifecycle='retired' then 'retired'
      else 'classified'
    end,
    updated_at=now()
  where id=item.id;

  perform private.record_portfolio_event(
    proposal.project_id,'PORTFOLIO_CLASSIFICATION_APPROVED',caller,
    jsonb_build_object('classification_id',proposal.id,'portfolio_item_id',proposal.portfolio_item_id,'classification',proposal.classification,'target_product_id',proposal.target_product_id)
  );
  return proposal.id;
end;
$$;


create or replace function public.reject_portfolio_classification_v1(
  target_classification_id uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $portfolio_reject$
declare
  caller uuid := auth.uid();
  proposal public.portfolio_classifications%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into proposal from public.portfolio_classifications
  where id=target_classification_id for update;
  if not found then raise exception 'Portfolio classification proposal not found.'; end if;
  if not private.has_project_role(proposal.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if proposal.status<>'proposed' then raise exception 'Only proposed classifications may be rejected.'; end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Rejection reason is required.'; end if;

  update public.portfolio_classifications
  set status='rejected'
  where id=proposal.id;

  perform private.record_portfolio_event(
    proposal.project_id,'PORTFOLIO_CLASSIFICATION_REJECTED',caller,
    jsonb_build_object(
      'classification_id',proposal.id,
      'portfolio_item_id',proposal.portfolio_item_id,
      'reason',btrim(target_reason)
    )
  );
  return proposal.id;
end;
$portfolio_reject$;

create or replace function public.propose_portfolio_relationship_v1(
  target_source_item uuid,
  target_target_item uuid,
  target_relationship_type text,
  target_criticality text default 'normal',
  target_rationale text default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  source_project uuid;
  target_project uuid;
  proposal_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if target_source_item=target_target_item then raise exception 'Relationship source_item_id = target_item_id is not allowed.'; end if;

  source_project := private.portfolio_item_project(target_source_item);
  target_project := private.portfolio_item_project(target_target_item);
  if source_project<>target_project then raise exception 'Relationship project mismatch.'; end if;
  if not private.has_project_role(source_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  if target_relationship_type not in ('contains','uses','provides','depends_on','replaces','supersedes','integrates_with','derived_from') then
    raise exception 'Unsupported portfolio relationship type.';
  end if;
  if target_criticality not in ('optional','normal','critical') then
    raise exception 'Unsupported portfolio relationship criticality.';
  end if;

  insert into public.portfolio_relationships(
    project_id,source_item_id,target_item_id,relationship_type,criticality,status,
    rationale,evidence_reference,proposed_by
  )
  values(
    source_project,target_source_item,target_target_item,target_relationship_type,target_criticality,'proposed',
    nullif(btrim(coalesce(target_rationale,'')),''),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),
    caller
  )
  returning id into proposal_id;

  perform private.record_portfolio_event(
    source_project,'PORTFOLIO_RELATIONSHIP_PROPOSED',caller,
    jsonb_build_object('relationship_id',proposal_id,'source_item_id',target_source_item,'target_item_id',target_target_item,'relationship_type',target_relationship_type,'criticality',target_criticality)
  );
  return proposal_id;
end;
$$;

create or replace function public.approve_portfolio_relationship_v1(
  target_relationship_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  proposal public.portfolio_relationships%rowtype;
  source_item public.portfolio_items%rowtype;
  target_item public.portfolio_items%rowtype;
  target_class public.portfolio_classifications%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into proposal from public.portfolio_relationships
  where id=target_relationship_id for update;
  if not found then raise exception 'Portfolio relationship proposal not found.'; end if;
  if not private.has_project_role(proposal.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if proposal.status<>'proposed' then raise exception 'Only proposed relationships may be approved.'; end if;
  if proposal.source_item_id=proposal.target_item_id then raise exception 'Relationship source_item_id = target_item_id is not allowed.'; end if;

  select * into source_item from public.portfolio_items where id=proposal.source_item_id for update;
  select * into target_item from public.portfolio_items where id=proposal.target_item_id for update;
  if not found or source_item.project_id<>proposal.project_id or target_item.project_id<>proposal.project_id then
    raise exception 'Relationship project mismatch.';
  end if;

  if proposal.relationship_type='contains' then
    if private.portfolio_contains_path(proposal.project_id,proposal.target_item_id,proposal.source_item_id) then
      raise exception 'Portfolio contains relationship would create a cycle.';
    end if;
    select * into target_class
    from public.portfolio_classifications c
    where c.portfolio_item_id=proposal.target_item_id and c.status='active';
    if not found
       or target_class.classification<>'product_owned'
       or source_item.linked_product_id is null
       or target_class.target_product_id is distinct from source_item.linked_product_id then
      raise exception 'contains requires product_owned classification targeting the source governed product.';
    end if;
  end if;

  update public.portfolio_relationships
  set status='superseded',superseded_at=now()
  where source_item_id=proposal.source_item_id
    and target_item_id=proposal.target_item_id
    and relationship_type=proposal.relationship_type
    and status='active';

  update public.portfolio_relationships
  set status='active',approved_by=caller,approved_at=now()
  where id=proposal.id;

  perform private.record_portfolio_event(
    proposal.project_id,'PORTFOLIO_RELATIONSHIP_APPROVED',caller,
    jsonb_build_object('relationship_id',proposal.id,'source_item_id',proposal.source_item_id,'target_item_id',proposal.target_item_id,'relationship_type',proposal.relationship_type,'criticality',proposal.criticality)
  );
  return proposal.id;
end;
$$;


create or replace function public.reject_portfolio_relationship_v1(
  target_relationship_id uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $portfolio_reject$
declare
  caller uuid := auth.uid();
  proposal public.portfolio_relationships%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into proposal from public.portfolio_relationships
  where id=target_relationship_id for update;
  if not found then raise exception 'Portfolio relationship proposal not found.'; end if;
  if not private.has_project_role(proposal.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if proposal.status<>'proposed' then raise exception 'Only proposed relationships may be rejected.'; end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Rejection reason is required.'; end if;

  update public.portfolio_relationships
  set status='rejected'
  where id=proposal.id;

  perform private.record_portfolio_event(
    proposal.project_id,'PORTFOLIO_RELATIONSHIP_REJECTED',caller,
    jsonb_build_object(
      'relationship_id',proposal.id,
      'source_item_id',proposal.source_item_id,
      'target_item_id',proposal.target_item_id,
      'reason',btrim(target_reason)
    )
  );
  return proposal.id;
end;
$portfolio_reject$;

create or replace function public.propose_portfolio_lifecycle_transition_v1(
  target_item uuid,
  target_to_state text,
  target_reason text,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  item public.portfolio_items%rowtype;
  event_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into item from public.portfolio_items where id=target_item;
  if not found then raise exception 'Portfolio item not found.'; end if;
  if not private.has_project_role(item.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  if target_to_state not in ('concept','experiment','validating','candidate','active','maintained','deprecated','retired') then
    raise exception 'Unsupported portfolio lifecycle.';
  end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Lifecycle transition reason is required.'; end if;

  insert into public.portfolio_lifecycle_events(
    project_id,portfolio_item_id,from_state,to_state,status,reason,evidence_reference,proposed_by
  )
  values(
    item.project_id,item.id,item.current_lifecycle,target_to_state,'proposed',btrim(target_reason),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),caller
  )
  returning id into event_id;

  perform private.record_portfolio_event(
    item.project_id,'PORTFOLIO_LIFECYCLE_PROPOSED',caller,
    jsonb_build_object('lifecycle_event_id',event_id,'portfolio_item_id',item.id,'from_state',item.current_lifecycle,'to_state',target_to_state)
  );
  return event_id;
end;
$$;

create or replace function public.approve_portfolio_lifecycle_transition_v1(
  target_event_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  event_row public.portfolio_lifecycle_events%rowtype;
  item public.portfolio_items%rowtype;
  has_classification boolean;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into event_row from public.portfolio_lifecycle_events
  where id=target_event_id for update;
  if not found then raise exception 'Portfolio lifecycle proposal not found.'; end if;
  if not private.has_project_role(event_row.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if event_row.status<>'proposed' then raise exception 'Only proposed lifecycle events may be approved.'; end if;

  select * into item from public.portfolio_items where id=event_row.portfolio_item_id for update;
  if not found or item.project_id<>event_row.project_id then raise exception 'Lifecycle project mismatch.'; end if;
  if item.current_lifecycle is distinct from event_row.from_state then
    raise exception 'Lifecycle proposal is stale because the current lifecycle changed.';
  end if;

  if event_row.to_state='retired' then
    if private.portfolio_has_active_critical_dependants(item.id) then
      raise exception 'Portfolio item has active critical dependants.';
    end if;
    if private.portfolio_has_active_production_surfaces(item.id) then
      raise exception 'Portfolio item has an active linked production surface.';
    end if;
  end if;

  select exists(
    select 1 from public.portfolio_classifications c
    where c.portfolio_item_id=item.id and c.status='active'
  ) into has_classification;

  update public.portfolio_lifecycle_events
  set status='approved',approved_by=caller,approved_at=now()
  where id=event_row.id;

  update public.portfolio_items
  set current_lifecycle=event_row.to_state,
      review_state=case
        when event_row.to_state='deprecated' then 'deprecated'
        when event_row.to_state='retired' then 'retired'
        when has_classification then 'classified'
        else 'pending_review'
      end,
      updated_at=now()
  where id=item.id;

  perform private.record_portfolio_event(
    item.project_id,'PORTFOLIO_LIFECYCLE_APPROVED',caller,
    jsonb_build_object('lifecycle_event_id',event_row.id,'portfolio_item_id',item.id,'from_state',event_row.from_state,'to_state',event_row.to_state)
  );
  return event_row.id;
end;
$$;


create or replace function public.reject_portfolio_lifecycle_transition_v1(
  target_event_id uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $portfolio_reject$
declare
  caller uuid := auth.uid();
  event_row public.portfolio_lifecycle_events%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into event_row from public.portfolio_lifecycle_events
  where id=target_event_id for update;
  if not found then raise exception 'Portfolio lifecycle proposal not found.'; end if;
  if not private.has_project_role(event_row.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if event_row.status<>'proposed' then raise exception 'Only proposed lifecycle events may be rejected.'; end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Rejection reason is required.'; end if;

  update public.portfolio_lifecycle_events
  set status='rejected'
  where id=event_row.id;

  perform private.record_portfolio_event(
    event_row.project_id,'PORTFOLIO_LIFECYCLE_REJECTED',caller,
    jsonb_build_object(
      'lifecycle_event_id',event_row.id,
      'portfolio_item_id',event_row.portfolio_item_id,
      'reason',btrim(target_reason)
    )
  );
  return event_row.id;
end;
$portfolio_reject$;

create or replace function public.promote_product_candidate_v1(
  target_item uuid,
  target_category text,
  target_mission text,
  target_operating_model text,
  target_primary_runtime text,
  target_promotion_packet jsonb,
  target_evidence_reference text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  item public.portfolio_items%rowtype;
  product_id uuid := gen_random_uuid();
  lifecycle_id uuid := gen_random_uuid();
  decision_id uuid := gen_random_uuid();
  authoritative_lab_evidence jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into item from public.portfolio_items where id=target_item for update;
  if not found then raise exception 'Portfolio item not found.'; end if;
  if not private.has_project_role(item.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if item.item_kind<>'product_candidate' then raise exception 'Only a product_candidate may be promoted.'; end if;
  if item.current_lifecycle is distinct from 'candidate' then raise exception 'Product candidate lifecycle must be candidate before promotion.'; end if;
  if item.linked_product_id is not null then raise exception 'Product candidate is already linked to a governed product.'; end if;

  perform private.validate_portfolio_promotion_packet(target_promotion_packet);
  if nullif(btrim(coalesce(target_evidence_reference,'')),'') is null then
    raise exception 'Promotion evidence reference is required.';
  end if;
  if nullif(btrim(coalesce(target_category,'')),'') is null
     or nullif(btrim(coalesce(target_mission,'')),'') is null
     or nullif(btrim(coalesce(target_operating_model,'')),'') is null
     or nullif(btrim(coalesce(target_primary_runtime,'')),'') is null then
    raise exception 'Category, mission, operating model, and primary runtime are required.';
  end if;

  if not exists(
    select 1 from public.portfolio_classifications c
    where c.portfolio_item_id=item.id
      and c.project_id=item.project_id
      and c.status='active'
      and c.classification='independent_datanest_product'
  ) then
    raise exception 'Candidate requires an active independent_datanest_product classification.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'surface_id',s.id,
        'build_commit',s.build_commit,
        'release_id',s.release_id,
        'test_run_id',tr.id,
        'test_case_id',tr.test_case_id,
        'test_case_version',tr.test_case_version,
        'result',tr.result,
        'evidence_url',tr.evidence_url
      )
      order by tr.created_at,tr.id
    ),
    '[]'::jsonb
  )
  into authoritative_lab_evidence
  from public.product_surfaces s
  join public.product_test_runs tr
    on tr.surface_id=s.id
   and tr.project_id=item.project_id
   and tr.build_commit=s.build_commit
  where s.portfolio_item_id=item.id
    and s.project_id=item.project_id
    and s.build_commit is not null
    and nullif(btrim(s.build_commit),'') is not null;

  if jsonb_array_length(authoritative_lab_evidence)=0 then
    raise exception 'Candidate requires linked exact-build Product Lab evidence.';
  end if;

  insert into public.products(
    id,project_id,slug,name,full_name,category,lifecycle_status,mission,operating_model,
    primary_runtime,commercial_mode,billing_enabled,as_of_date,metadata
  )
  values(
    product_id,item.project_id,item.slug,item.name,item.name,btrim(target_category),'active',
    btrim(target_mission),btrim(target_operating_model),btrim(target_primary_runtime),
    'free promotion / no billing until pricing is established',false,current_date,
    jsonb_build_object(
      'portfolio_item_id',item.id,
      'promotion_evidence_reference',btrim(target_evidence_reference),
      'authoritative_product_lab_evidence',authoritative_lab_evidence,
      'promotion_approved_by',caller
    )
  );

  insert into public.portfolio_lifecycle_events(
    id,project_id,portfolio_item_id,from_state,to_state,status,reason,evidence_reference,
    proposed_by,approved_by,created_at,approved_at
  )
  values(
    lifecycle_id,item.project_id,item.id,item.current_lifecycle,'active','approved',
    'Product Candidate promoted to governed product.',btrim(target_evidence_reference),
    caller,caller,now(),now()
  );

  update public.portfolio_items
  set item_kind='governed_product',
      review_state='classified',
      current_lifecycle='active',
      linked_product_id=product_id,
      updated_at=now()
  where id=item.id;

  insert into public.product_records(
    id,project_id,product_id,record_type,code,name,status,sort_order,payload
  )
  values(
    decision_id,item.project_id,product_id,'decision','PORTFOLIO-PROMOTION',
    'Portfolio promotion approved','approved',900,
    jsonb_build_object(
      'portfolio_item_id',item.id,
      'promotion_packet',target_promotion_packet,
      'authoritative_product_lab_evidence',authoritative_lab_evidence,
      'evidence_reference',btrim(target_evidence_reference),
      'approved_by',caller,
      'billing_enabled',false
    )
  );

  perform private.record_portfolio_event(
    item.project_id,'PORTFOLIO_PRODUCT_PROMOTED',caller,
    jsonb_build_object(
      'portfolio_item_id',item.id,
      'product_id',product_id,
      'lifecycle_event_id',lifecycle_id,
      'decision_record_id',decision_id,
      'billing_enabled',false,
      'authoritative_product_lab_evidence',authoritative_lab_evidence
    )
  );
  return product_id;
end;
$$;

create or replace function public.deprecate_portfolio_item_v1(
  target_item uuid,
  target_reason text,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  item public.portfolio_items%rowtype;
  event_id uuid := gen_random_uuid();
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into item from public.portfolio_items where id=target_item for update;
  if not found then raise exception 'Portfolio item not found.'; end if;
  if not private.has_project_role(item.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Deprecation reason is required.'; end if;
  if item.current_lifecycle='retired' then raise exception 'A retired item cannot be deprecated.'; end if;

  insert into public.portfolio_lifecycle_events(
    id,project_id,portfolio_item_id,from_state,to_state,status,reason,evidence_reference,
    proposed_by,approved_by,created_at,approved_at
  )
  values(
    event_id,item.project_id,item.id,item.current_lifecycle,'deprecated','approved',
    btrim(target_reason),nullif(btrim(coalesce(target_evidence_reference,'')),''),
    caller,caller,now(),now()
  );

  update public.portfolio_items
  set current_lifecycle='deprecated',review_state='deprecated',updated_at=now()
  where id=item.id;

  perform private.record_portfolio_event(
    item.project_id,'PORTFOLIO_ITEM_DEPRECATED',caller,
    jsonb_build_object('portfolio_item_id',item.id,'lifecycle_event_id',event_id,'reason',btrim(target_reason))
  );
  return event_id;
end;
$$;

create or replace function public.retire_portfolio_item_v1(
  target_item uuid,
  target_reason text,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid := auth.uid();
  item public.portfolio_items%rowtype;
  event_id uuid := gen_random_uuid();
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into item from public.portfolio_items where id=target_item for update;
  if not found then raise exception 'Portfolio item not found.'; end if;
  if not private.has_project_role(item.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Retirement reason is required.'; end if;
  if item.current_lifecycle='retired' then return item.id; end if;

  if private.portfolio_has_active_critical_dependants(item.id) then
    raise exception 'Portfolio item has active critical dependants.';
  end if;
  if private.portfolio_has_active_production_surfaces(item.id) then
    raise exception 'Portfolio item has an active linked production surface.';
  end if;

  insert into public.portfolio_lifecycle_events(
    id,project_id,portfolio_item_id,from_state,to_state,status,reason,evidence_reference,
    proposed_by,approved_by,created_at,approved_at
  )
  values(
    event_id,item.project_id,item.id,item.current_lifecycle,'retired','approved',
    btrim(target_reason),nullif(btrim(coalesce(target_evidence_reference,'')),''),
    caller,caller,now(),now()
  );

  update public.portfolio_items
  set current_lifecycle='retired',review_state='retired',updated_at=now()
  where id=item.id;

  perform private.record_portfolio_event(
    item.project_id,'PORTFOLIO_ITEM_RETIRED',caller,
    jsonb_build_object('portfolio_item_id',item.id,'lifecycle_event_id',event_id,'reason',btrim(target_reason))
  );
  return event_id;
end;
$$;

revoke all on function public.create_portfolio_item_v1(uuid,text,text,text,text,text,text,jsonb) from public;
revoke all on function public.propose_portfolio_classification_v1(uuid,text,uuid,text,text) from public;
revoke all on function public.approve_portfolio_classification_v1(uuid) from public;
revoke all on function public.reject_portfolio_classification_v1(uuid,text) from public;
revoke all on function public.propose_portfolio_relationship_v1(uuid,uuid,text,text,text,text) from public;
revoke all on function public.approve_portfolio_relationship_v1(uuid) from public;
revoke all on function public.reject_portfolio_relationship_v1(uuid,text) from public;
revoke all on function public.propose_portfolio_lifecycle_transition_v1(uuid,text,text,text) from public;
revoke all on function public.approve_portfolio_lifecycle_transition_v1(uuid) from public;
revoke all on function public.reject_portfolio_lifecycle_transition_v1(uuid,text) from public;
revoke all on function public.promote_product_candidate_v1(uuid,text,text,text,text,jsonb,text) from public;
revoke all on function public.deprecate_portfolio_item_v1(uuid,text,text) from public;
revoke all on function public.retire_portfolio_item_v1(uuid,text,text) from public;

grant execute on function public.create_portfolio_item_v1(uuid,text,text,text,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.propose_portfolio_classification_v1(uuid,text,uuid,text,text) to authenticated, service_role;
grant execute on function public.approve_portfolio_classification_v1(uuid) to authenticated, service_role;
grant execute on function public.reject_portfolio_classification_v1(uuid,text) to authenticated, service_role;
grant execute on function public.propose_portfolio_relationship_v1(uuid,uuid,text,text,text,text) to authenticated, service_role;
grant execute on function public.approve_portfolio_relationship_v1(uuid) to authenticated, service_role;
grant execute on function public.reject_portfolio_relationship_v1(uuid,text) to authenticated, service_role;
grant execute on function public.propose_portfolio_lifecycle_transition_v1(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.approve_portfolio_lifecycle_transition_v1(uuid) to authenticated, service_role;
grant execute on function public.reject_portfolio_lifecycle_transition_v1(uuid,text) to authenticated, service_role;
grant execute on function public.promote_product_candidate_v1(uuid,text,text,text,text,jsonb,text) to authenticated, service_role;
grant execute on function public.deprecate_portfolio_item_v1(uuid,text,text) to authenticated, service_role;
grant execute on function public.retire_portfolio_item_v1(uuid,text,text) to authenticated, service_role;

commit;
