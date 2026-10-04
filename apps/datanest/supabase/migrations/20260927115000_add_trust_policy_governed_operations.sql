begin;

create or replace function private.record_trust_policy_event(
  target_project uuid,
  target_event text,
  target_actor uuid,
  target_payload jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path=public,private,auth
as $$
  insert into public.events(project_id,job_id,event_type,actor,payload)
  values(
    target_project,
    null,
    target_event,
    coalesce(target_actor::text,'service_role'),
    coalesce(target_payload,'{}'::jsonb)
  );
$$;

create or replace function private.trust_validate_subject(
  target_project uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_subject_reference text
) returns void
language plpgsql
security definer
set search_path=public,private,auth
as $$
begin
  if target_subject_type not in (
    'project','product','job','ai_event','certified_memory','portfolio_item','file','transparency_artifact','other'
  ) then
    raise exception 'Unsupported trust policy subject type.';
  end if;

  if target_subject_type='project' then
    if target_subject_id is null or target_subject_id<>target_project then
      raise exception 'Object project mismatch.';
    end if;
  elsif target_subject_type='product' then
    if target_subject_id is null or not exists(
      select 1 from public.products p where p.id=target_subject_id and p.project_id=target_project
    ) then
      raise exception 'Product subject not found in project.';
    end if;
  elsif target_subject_type='job' then
    if target_subject_id is null or not exists(
      select 1 from public.jobs j where j.id=target_subject_id and j.project_id=target_project
    ) then
      raise exception 'Job subject not found in project.';
    end if;
  elsif target_subject_type='certified_memory' then
    if target_subject_id is null or not exists(
      select 1 from public.certified_memory cm where cm.id=target_subject_id and cm.project_id=target_project
    ) then
      raise exception 'Certified memory subject not found in project.';
    end if;
  elsif target_subject_type='portfolio_item' then
    if target_subject_id is null or not exists(
      select 1 from public.portfolio_items pi where pi.id=target_subject_id and pi.project_id=target_project
    ) then
      raise exception 'Portfolio Item subject not found in project.';
    end if;
  else
    if nullif(btrim(coalesce(target_subject_reference,'')),'') is null then
      raise exception 'A stable subject reference is required for this subject type.';
    end if;
  end if;
end;
$$;

create or replace function private.trust_active_manifest(
  target_project uuid,
  target_product uuid default null
) returns public.trust_manifests
language sql
stable
security definer
set search_path=public,private
as $$
  select tm
  from public.trust_manifests tm
  where tm.project_id=target_project
    and tm.status='active'
    and (
      (target_product is null and tm.scope_type='project' and tm.product_id is null)
      or
      (target_product is not null and tm.scope_type='product' and tm.product_id=target_product)
    )
  order by tm.version desc
  limit 1;
$$;

create or replace function private.trust_effective_binding(
  target_project uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_subject_reference text
) returns public.data_policy_bindings
language sql
stable
security definer
set search_path=public,private
as $$
  select b
  from public.data_policy_bindings b
  where b.project_id=target_project
    and b.subject_type=target_subject_type
    and b.status='active'
    and coalesce(b.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
        =coalesce(target_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(b.subject_reference,'')=coalesce(target_subject_reference,'')
  order by b.approved_at desc nulls last,b.created_at desc
  limit 1;
$$;

create or replace function private.trust_has_active_retention_hold(
  target_project uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_subject_reference text
) returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select exists(
    select 1
    from public.retention_holds h
    where h.project_id=target_project
      and h.subject_type=target_subject_type
      and h.status='active'
      and coalesce(h.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
          =coalesce(target_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(h.subject_reference,'')=coalesce(target_subject_reference,'')
  );
$$;

create or replace function private.trust_lineage_state(
  target_project uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_subject_reference text
) returns jsonb
language sql
stable
security definer
set search_path=public,private
as $$
  select jsonb_build_object(
    'active_edges',
    count(*)::integer,
    'known',
    count(*)>0
  )
  from public.data_policy_lineage l
  where l.project_id=target_project
    and l.status='active'
    and (
      (
        l.source_subject_type=target_subject_type
        and coalesce(l.source_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
            =coalesce(target_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(l.source_subject_reference,'')=coalesce(target_subject_reference,'')
      )
      or
      (
        l.derived_subject_type=target_subject_type
        and coalesce(l.derived_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
            =coalesce(target_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(l.derived_subject_reference,'')=coalesce(target_subject_reference,'')
      )
    );
$$;

create or replace function private.trust_validate_manifest_evidence(
  target_manifest uuid
) returns void
language plpgsql
security definer
set search_path=public,private
as $$
declare
  manifest public.trust_manifests%rowtype;
begin
  select * into manifest from public.trust_manifests where id=target_manifest;
  if not found then raise exception 'Trust Manifest not found.'; end if;
  if manifest.evidence_state in ('planned','unknown') then
    raise exception 'Planned or unknown controls cannot be activated as current trust guarantees.';
  end if;
  if nullif(btrim(coalesce(manifest.evidence_reference,'')),'') is null then
    raise exception 'Trust Manifest activation requires evidence.';
  end if;
end;
$$;

create or replace function private.trust_validate_provider_profile(
  target_profile uuid
) returns void
language plpgsql
security definer
set search_path=public,private
as $$
declare
  profile public.provider_trust_profiles%rowtype;
begin
  select * into profile from public.provider_trust_profiles where id=target_profile;
  if not found then raise exception 'Provider Trust Profile not found.'; end if;
  if cardinality(profile.allowed_visibility_classes)=0 or cardinality(profile.allowed_purposes)=0 then
    raise exception 'Provider Trust Profile requires allowed visibility classes and purposes.';
  end if;
  if profile.evidence_state='unknown' then
    raise exception 'Provider Trust Profile requires reviewed evidence state.';
  end if;
  if nullif(btrim(coalesce(profile.retention_posture,'')),'') is null
     or nullif(btrim(coalesce(profile.training_reuse_posture,'')),'') is null then
    raise exception 'Provider Trust Profile requires retention and training/reuse posture.';
  end if;
  if profile.review_due_at is not null and profile.review_due_at<=now() then
    raise exception 'Provider Trust Profile review is overdue.';
  end if;
end;
$$;

create or replace function private.trust_provider_key_for_connection(
  target_project uuid,
  target_provider_connection uuid
) returns text
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  conn public.ai_provider_connections%rowtype;
begin
  select * into conn
  from public.ai_provider_connections
  where id=target_provider_connection
    and project_id=target_project;

  if not found then
    raise exception 'Provider connection project mismatch.';
  end if;

  return lower(btrim(conn.provider))||':'||lower(btrim(conn.endpoint_host));
end;
$$;

create or replace function private.trust_resolve_effective_policy(
  target_project uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_subject_reference text
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private
as $$
declare
  binding public.data_policy_bindings%rowtype;
  manifest public.trust_manifests%rowtype;
begin
  select * into binding
  from private.trust_effective_binding(
    target_project,target_subject_type,target_subject_id,target_subject_reference
  );

  if target_subject_type='product' and target_subject_id is not null then
    select * into manifest from private.trust_active_manifest(target_project,target_subject_id);
  end if;
  if manifest.id is null then
    select * into manifest from private.trust_active_manifest(target_project,null);
  end if;

  if binding.id is not null then
    return jsonb_build_object(
      'resolved',true,
      'visibility_class',binding.visibility_class,
      'reuse_state',binding.reuse_state,
      'publication_authorized',binding.publication_authorized,
      'binding_id',binding.id,
      'manifest_id',manifest.id,
      'manifest_version',manifest.version,
      'retention_policy_id',manifest.retention_policy_id,
      'enforcement_mode',coalesce(manifest.enforcement_mode,'report_only'),
      'approved_provider_keys',coalesce(to_jsonb(manifest.approved_provider_keys),'[]'::jsonb),
      'policy_version','binding:'||binding.id::text
    );
  end if;

  if manifest.id is not null then
    return jsonb_build_object(
      'resolved',true,
      'visibility_class',manifest.default_visibility_class,
      'reuse_state',manifest.default_reuse_state,
      'publication_authorized',false,
      'binding_id',null,
      'manifest_id',manifest.id,
      'manifest_version',manifest.version,
      'retention_policy_id',manifest.retention_policy_id,
      'enforcement_mode',manifest.enforcement_mode,
      'approved_provider_keys',to_jsonb(manifest.approved_provider_keys),
      'policy_version',manifest.policy_version
    );
  end if;

  return jsonb_build_object(
    'resolved',false,
    'visibility_class','high_sensitivity',
    'reuse_state','runtime_only',
    'publication_authorized',false,
    'binding_id',null,
    'manifest_id',null,
    'manifest_version',null,
    'retention_policy_id',null,
    'enforcement_mode','report_only',
    'approved_provider_keys','[]'::jsonb,
    'policy_version','unresolved'
  );
end;
$$;

create or replace function public.propose_data_policy_binding_v1(
  target_project uuid,
  target_subject_type text,
  target_visibility_class text,
  target_reuse_state text,
  target_rationale text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_publication_authorized boolean default false,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  new_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  perform private.trust_validate_subject(target_project,target_subject_type,target_subject_id,target_subject_reference);
  if nullif(btrim(coalesce(target_rationale,'')),'') is null then raise exception 'Policy rationale is required.'; end if;
  if target_publication_authorized and target_visibility_class<>'public' then
    raise exception 'Publication authority requires public visibility.';
  end if;

  insert into public.data_policy_bindings(
    project_id,subject_type,subject_id,subject_reference,visibility_class,reuse_state,
    publication_authorized,status,rationale,evidence_reference,proposed_by
  ) values(
    target_project,target_subject_type,target_subject_id,nullif(btrim(coalesce(target_subject_reference,'')),''),
    target_visibility_class,target_reuse_state,target_publication_authorized,'proposed',
    btrim(target_rationale),nullif(btrim(coalesce(target_evidence_reference,'')),''),caller
  ) returning id into new_id;

  perform private.record_trust_policy_event(
    target_project,'DATA_POLICY_PROPOSED',caller,
    jsonb_build_object('binding_id',new_id,'subject_type',target_subject_type,'visibility_class',target_visibility_class,'reuse_state',target_reuse_state)
  );
  return new_id;
end;
$$;

create or replace function public.approve_data_policy_binding_v1(
  target_binding uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  target public.data_policy_bindings%rowtype;
  prior_id uuid;
  high_impact boolean;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.data_policy_bindings where id=target_binding for update;
  if not found then raise exception 'Data policy proposal not found.'; end if;
  if target.status<>'proposed' then raise exception 'Only proposed data policy may be approved.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  high_impact:=target.visibility_class='public'
    or target.reuse_state in ('platform_learning_eligible','datanest_certified_knowledge','publicly_reusable')
    or target.publication_authorized;

  if high_impact and target.proposed_by=caller then
    raise exception 'A proposer cannot approve their own high-impact policy widening.';
  end if;

  select id into prior_id
  from public.data_policy_bindings
  where project_id=target.project_id
    and subject_type=target.subject_type
    and status='active'
    and coalesce(subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
        =coalesce(target.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(subject_reference,'')=coalesce(target.subject_reference,'')
  for update;

  if prior_id is not null then
    update public.data_policy_bindings set status='superseded' where id=prior_id;
  end if;

  update public.data_policy_bindings
  set status='active',approved_by=caller,approved_at=now(),supersedes_binding_id=prior_id
  where id=target.id;

  perform private.record_trust_policy_event(
    target.project_id,'DATA_POLICY_APPROVED',caller,
    jsonb_build_object('binding_id',target.id,'supersedes_binding_id',prior_id)
  );
  return target.id;
end;
$$;

create or replace function public.reject_data_policy_binding_v1(
  target_binding uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  target public.data_policy_bindings%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.data_policy_bindings where id=target_binding for update;
  if not found or target.status<>'proposed' then raise exception 'Only proposed data policy may be rejected.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  update public.data_policy_bindings
  set status='rejected',approved_by=caller,approved_at=now(),
      rationale=rationale||E'\nRejected: '||btrim(coalesce(target_reason,'No reason supplied.'))
  where id=target.id;
  perform private.record_trust_policy_event(target.project_id,'DATA_POLICY_REJECTED',caller,jsonb_build_object('binding_id',target.id));
  return target.id;
end;
$$;

create or replace function public.create_trust_manifest_draft_v1(
  target_project uuid,
  target_scope_type text,
  target_default_visibility_class text,
  target_default_reuse_state text,
  target_policy_version text,
  target_enforcement_mode text default 'report_only',
  target_product uuid default null,
  target_retention_policy uuid default null,
  target_approved_provider_keys text[] default '{}'::text[],
  target_publication_policy text default 'governed_only',
  target_export_policy text default 'governed_only',
  target_certified_memory_policy text default 'existing_governed_pipeline',
  target_evidence_state text default 'unknown',
  target_evidence_reference text default null,
  target_known_limitations text default null,
  target_review_due_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  next_version integer;
  new_id uuid;
  normalized_provider_keys text[];
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  if target_scope_type not in ('project','product') then raise exception 'Unsupported Trust Manifest scope.'; end if;
  if target_enforcement_mode not in ('report_only','enforced') then raise exception 'Unsupported Trust Manifest enforcement mode.'; end if;
  if target_certified_memory_policy<>'existing_governed_pipeline' then
    raise exception 'Certified memory authority remains on the existing governed pipeline.';
  end if;
  if target_scope_type='project' and target_product is not null then raise exception 'Project Trust Manifest cannot target a product.'; end if;
  if target_scope_type='product' then
    if target_product is null or not exists(
      select 1 from public.products p where p.id=target_product and p.project_id=target_project
    ) then
      raise exception 'Product subject not found in project.';
    end if;
  end if;
  if target_retention_policy is not null and not exists(
    select 1 from public.retention_policies rp where rp.id=target_retention_policy and rp.project_id=target_project
  ) then
    raise exception 'Retention policy project mismatch.';
  end if;

  select coalesce(array_agg(distinct lower(btrim(provider_key))) filter (where nullif(btrim(provider_key),'') is not null),'{}'::text[])
  into normalized_provider_keys
  from unnest(coalesce(target_approved_provider_keys,'{}'::text[])) provider_key;

  select coalesce(max(version),0)+1 into next_version
  from public.trust_manifests
  where project_id=target_project
    and scope_type=target_scope_type
    and coalesce(product_id,'00000000-0000-0000-0000-000000000000'::uuid)
        =coalesce(target_product,'00000000-0000-0000-0000-000000000000'::uuid);

  insert into public.trust_manifests(
    project_id,scope_type,product_id,version,status,default_visibility_class,default_reuse_state,
    publication_policy,export_policy,certified_memory_policy,evidence_state,evidence_reference,
    known_limitations,policy_version,retention_policy_id,enforcement_mode,approved_provider_keys,
    review_due_at,created_by
  ) values(
    target_project,target_scope_type,target_product,next_version,'draft',
    target_default_visibility_class,target_default_reuse_state,target_publication_policy,target_export_policy,
    target_certified_memory_policy,target_evidence_state,
    nullif(btrim(coalesce(target_evidence_reference,'')),''),
    nullif(btrim(coalesce(target_known_limitations,'')),''),
    btrim(target_policy_version),target_retention_policy,target_enforcement_mode,normalized_provider_keys,
    target_review_due_at,caller
  ) returning id into new_id;

  perform private.record_trust_policy_event(
    target_project,'TRUST_MANIFEST_DRAFTED',caller,
    jsonb_build_object('manifest_id',new_id,'version',next_version,'enforcement_mode',target_enforcement_mode)
  );
  return new_id;
end;
$$;

create or replace function public.activate_trust_manifest_v1(
  target_manifest uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  target public.trust_manifests%rowtype;
  prior_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.trust_manifests where id=target_manifest for update;
  if not found or target.status<>'draft' then raise exception 'Only draft Trust Manifest may be activated.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if target.created_by=caller then raise exception 'A Trust Manifest author cannot activate their own draft.'; end if;
  perform private.trust_validate_manifest_evidence(target.id);

  if target.enforcement_mode='enforced' then
    if not exists(
      select 1
      from public.data_policy_bindings b
      where b.project_id=target.project_id
        and b.subject_type='project'
        and b.subject_id=target.project_id
        and b.status='active'
    ) then
      raise exception 'Enforced Trust Manifest requires an active project-level policy binding.';
    end if;

    if target.retention_policy_id is null or not exists(
      select 1
      from public.retention_policies rp
      where rp.id=target.retention_policy_id
        and rp.project_id=target.project_id
        and rp.status='active'
    ) then
      raise exception 'Enforced Trust Manifest requires an active referenced retention policy.';
    end if;

    if exists(
      select 1
      from public.ai_provider_connections c
      where c.project_id=target.project_id
        and c.status='active'
        and (
          not (private.trust_provider_key_for_connection(target.project_id,c.id)=any(target.approved_provider_keys))
          or not exists(
            select 1
            from public.provider_trust_profiles pp
            where pp.project_id=target.project_id
              and pp.provider_connection_id=c.id
              and pp.provider_key=private.trust_provider_key_for_connection(target.project_id,c.id)
              and pp.status in ('active','restricted')
              and (pp.review_due_at is null or pp.review_due_at>now())
          )
        )
    ) then
      raise exception 'Enforced Trust Manifest requires complete reviewed route coverage for active ai_provider_connections and approved_provider_keys.';
    end if;
  end if;

  select id into prior_id
  from public.trust_manifests
  where project_id=target.project_id
    and status='active'
    and scope_type=target.scope_type
    and coalesce(product_id,'00000000-0000-0000-0000-000000000000'::uuid)
        =coalesce(target.product_id,'00000000-0000-0000-0000-000000000000'::uuid)
  for update;

  if prior_id is not null then update public.trust_manifests set status='superseded' where id=prior_id; end if;
  update public.trust_manifests
  set status='active',approved_by=caller,approved_at=now(),effective_from=coalesce(effective_from,now()),supersedes_manifest_id=prior_id
  where id=target.id;

  perform private.record_trust_policy_event(
    target.project_id,'TRUST_MANIFEST_ACTIVATED',caller,
    jsonb_build_object('manifest_id',target.id,'supersedes_manifest_id',prior_id,'enforcement_mode',target.enforcement_mode)
  );
  return target.id;
end;
$$;

create or replace function public.reject_trust_manifest_v1(
  target_manifest uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); target public.trust_manifests%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.trust_manifests where id=target_manifest for update;
  if not found or target.status<>'draft' then raise exception 'Only draft Trust Manifest may be rejected.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.'; end if;
  update public.trust_manifests
  set status='rejected',approved_by=caller,approved_at=now(),
      known_limitations=concat_ws(E'\n',known_limitations,'Rejected: '||btrim(coalesce(target_reason,'No reason supplied.')))
  where id=target.id;
  perform private.record_trust_policy_event(target.project_id,'TRUST_MANIFEST_REJECTED',caller,jsonb_build_object('manifest_id',target.id));
  return target.id;
end;
$$;

create or replace function public.create_provider_trust_profile_v1(
  target_project uuid,
  target_provider_key text,
  target_provider_category text,
  target_policy_version text,
  target_allowed_visibility_classes text[],
  target_allowed_purposes text[],
  target_retention_posture text,
  target_training_reuse_posture text,
  target_provider_connection uuid default null,
  target_prohibited_purposes text[] default '{}'::text[],
  target_allowed_regions text[] default '{}'::text[],
  target_security_evidence_reference text default null,
  target_contractual_evidence_reference text default null,
  target_data_locality_guarantees text default null,
  target_credential_boundary_description text default null,
  target_evidence_state text default 'unknown',
  target_known_limitations text default null,
  target_review_due_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  new_id uuid;
  resolved_provider_key text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;

  if target_provider_connection is not null then
    resolved_provider_key:=private.trust_provider_key_for_connection(target_project,target_provider_connection);
    if nullif(btrim(coalesce(target_provider_key,'')),'') is not null
       and lower(btrim(target_provider_key))<>resolved_provider_key then
      raise exception 'Provider key does not match the current project-scoped provider connection.';
    end if;
  else
    resolved_provider_key:=lower(btrim(target_provider_key));
  end if;
  if nullif(resolved_provider_key,'') is null then raise exception 'Provider key is required.'; end if;

  insert into public.provider_trust_profiles(
    project_id,provider_connection_id,provider_key,provider_category,status,
    allowed_visibility_classes,allowed_purposes,prohibited_purposes,allowed_regions,
    retention_posture,training_reuse_posture,security_evidence_reference,contractual_evidence_reference,
    data_locality_guarantees,credential_boundary_description,evidence_state,policy_version,review_due_at,
    known_limitations,created_by
  ) values(
    target_project,target_provider_connection,resolved_provider_key,target_provider_category,'draft',
    coalesce(target_allowed_visibility_classes,'{}'::text[]),coalesce(target_allowed_purposes,'{}'::text[]),
    coalesce(target_prohibited_purposes,'{}'::text[]),coalesce(target_allowed_regions,'{}'::text[]),
    nullif(btrim(coalesce(target_retention_posture,'')),''),nullif(btrim(coalesce(target_training_reuse_posture,'')),''),
    nullif(btrim(coalesce(target_security_evidence_reference,'')),''),nullif(btrim(coalesce(target_contractual_evidence_reference,'')),''),
    nullif(btrim(coalesce(target_data_locality_guarantees,'')),''),nullif(btrim(coalesce(target_credential_boundary_description,'')),''),
    target_evidence_state,btrim(target_policy_version),target_review_due_at,
    nullif(btrim(coalesce(target_known_limitations,'')),''),caller
  ) returning id into new_id;

  perform private.record_trust_policy_event(
    target_project,'PROVIDER_TRUST_PROFILE_DRAFTED',caller,
    jsonb_build_object('profile_id',new_id,'provider_key',resolved_provider_key)
  );
  return new_id;
end;
$$;

create or replace function public.activate_provider_trust_profile_v1(
  target_profile uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  target public.provider_trust_profiles%rowtype;
  prior_id uuid;
  expected_key text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.provider_trust_profiles where id=target_profile for update;
  if not found or target.status<>'draft' then raise exception 'Only draft Provider Trust Profile may be activated.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.'; end if;
  if target.created_by=caller then raise exception 'A Provider Trust Profile author cannot activate their own draft.'; end if;
  perform private.trust_validate_provider_profile(target.id);

  if target.provider_connection_id is not null then
    select lower(c.provider)||':'||lower(c.endpoint_host) into expected_key
    from public.ai_provider_connections c
    where c.id=target.provider_connection_id and c.project_id=target.project_id;
    if expected_key is null then raise exception 'Provider connection project mismatch.'; end if;
    if target.provider_key<>expected_key then
      raise exception 'Provider key must match provider: endpoint_host for the selected connection.';
    end if;
  end if;

  select id into prior_id
  from public.provider_trust_profiles
  where project_id=target.project_id
    and id<>target.id
    and status in ('active','restricted','suspended')
    and provider_key=target.provider_key
    and coalesce(provider_connection_id,'00000000-0000-0000-0000-000000000000'::uuid)
        =coalesce(target.provider_connection_id,'00000000-0000-0000-0000-000000000000'::uuid)
  for update;

  if prior_id is not null then
    update public.provider_trust_profiles
    set status='retired',
        known_limitations=concat_ws(E'\n',known_limitations,'Superseded by reviewed Provider Trust Profile '||target.id::text)
    where id=prior_id;
  end if;

  update public.provider_trust_profiles
  set status='active',approved_by=caller,approved_at=now(),effective_from=coalesce(effective_from,now()),supersedes_profile_id=prior_id
  where id=target.id;

  perform private.record_trust_policy_event(
    target.project_id,'PROVIDER_TRUST_PROFILE_ACTIVATED',caller,
    jsonb_build_object('profile_id',target.id,'supersedes_profile_id',prior_id,'provider_key',target.provider_key)
  );
  return target.id;
end;
$$;

create or replace function public.suspend_provider_trust_profile_v1(
  target_profile uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); target public.provider_trust_profiles%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.provider_trust_profiles where id=target_profile for update;
  if not found or target.status not in ('active','restricted') then raise exception 'Only active or restricted Provider Trust Profile may be suspended.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.'; end if;
  update public.provider_trust_profiles set status='suspended',known_limitations=concat_ws(E'\n',known_limitations,'Suspended: '||btrim(coalesce(target_reason,'No reason supplied.'))) where id=target.id;
  perform private.record_trust_policy_event(target.project_id,'PROVIDER_TRUST_PROFILE_SUSPENDED',caller,jsonb_build_object('profile_id',target.id));
  return target.id;
end;
$$;

create or replace function public.retire_provider_trust_profile_v1(
  target_profile uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); target public.provider_trust_profiles%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.provider_trust_profiles where id=target_profile for update;
  if not found then raise exception 'Provider Trust Profile not found.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.'; end if;
  update public.provider_trust_profiles set status='retired',known_limitations=concat_ws(E'\n',known_limitations,'Retired: '||btrim(coalesce(target_reason,'No reason supplied.'))) where id=target.id;
  perform private.record_trust_policy_event(target.project_id,'PROVIDER_TRUST_PROFILE_RETIRED',caller,jsonb_build_object('profile_id',target.id));
  return target.id;
end;
$$;

create or replace function public.propose_retention_policy_v1(
  target_project uuid,
  target_policy_key text,
  target_default_disposition_intent text,
  target_requires_lineage_review boolean,
  target_applicable_visibility_classes text[] default '{}'::text[],
  target_applicable_reuse_states text[] default '{}'::text[],
  target_applicable_subject_types text[] default '{}'::text[],
  target_default_retention_days integer default null,
  target_review_interval_days integer default null,
  target_rules jsonb default '{}'::jsonb,
  target_minimum_evidence jsonb default '{}'::jsonb,
  target_authority_basis text default null,
  target_evidence_reference text default null,
  target_review_due_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); next_version integer; new_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;

  select coalesce(max(version),0)+1 into next_version
  from public.retention_policies
  where project_id=target_project and policy_key=btrim(target_policy_key);

  insert into public.retention_policies(
    project_id,policy_key,version,status,applicable_visibility_classes,applicable_reuse_states,applicable_subject_types,
    default_retention_days,review_interval_days,default_disposition_intent,rules,minimum_evidence,requires_lineage_review,
    authority_basis,evidence_reference,status_reason,review_due_at,created_by
  ) values(
    target_project,btrim(target_policy_key),next_version,'draft',
    coalesce(target_applicable_visibility_classes,'{}'::text[]),
    coalesce(target_applicable_reuse_states,'{}'::text[]),
    coalesce(target_applicable_subject_types,'{}'::text[]),
    target_default_retention_days,target_review_interval_days,target_default_disposition_intent,
    coalesce(target_rules,'{}'::jsonb),coalesce(target_minimum_evidence,'{}'::jsonb),
    target_requires_lineage_review,
    nullif(btrim(coalesce(target_authority_basis,'')),''),
    nullif(btrim(coalesce(target_evidence_reference,'')),''),
    null,target_review_due_at,caller
  ) returning id into new_id;

  perform private.record_trust_policy_event(
    target_project,'RETENTION_POLICY_PROPOSED',caller,
    jsonb_build_object('retention_policy_id',new_id,'policy_key',btrim(target_policy_key),'version',next_version)
  );
  return new_id;
end;
$$;

create or replace function public.approve_retention_policy_v1(
  target_policy uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); target public.retention_policies%rowtype; prior_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.retention_policies where id=target_policy for update;
  if not found or target.status<>'draft' then raise exception 'Only draft retention policy may be approved.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.'; end if;
  if target.default_disposition_intent='delete_when_authorized' and target.created_by=caller then
    raise exception 'A proposer cannot approve their own future deletion policy.';
  end if;
  select id into prior_id from public.retention_policies where project_id=target.project_id and policy_key=target.policy_key and status='active' for update;
  if prior_id is not null then update public.retention_policies set status='superseded' where id=prior_id; end if;
  update public.retention_policies
  set status='active',approved_by=caller,approved_at=now(),effective_from=coalesce(effective_from,now()),supersedes_policy_id=prior_id
  where id=target.id;
  perform private.record_trust_policy_event(target.project_id,'RETENTION_POLICY_APPROVED',caller,jsonb_build_object('retention_policy_id',target.id,'supersedes_policy_id',prior_id));
  return target.id;
end;
$$;

create or replace function public.reject_retention_policy_v1(
  target_policy uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); target public.retention_policies%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.retention_policies where id=target_policy for update;
  if not found or target.status<>'draft' then raise exception 'Only draft retention policy may be rejected.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.'; end if;
  update public.retention_policies set status='rejected',approved_by=caller,approved_at=now(),status_reason=btrim(coalesce(target_reason,'Rejected.')) where id=target.id;
  perform private.record_trust_policy_event(target.project_id,'RETENTION_POLICY_REJECTED',caller,jsonb_build_object('retention_policy_id',target.id));
  return target.id;
end;
$$;

create or replace function public.place_retention_hold_v1(
  target_project uuid,
  target_subject_type text,
  target_hold_type text,
  target_reason text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); new_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  perform private.trust_validate_subject(target_project,target_subject_type,target_subject_id,target_subject_reference);
  if nullif(btrim(coalesce(target_reason,'')),'') is null then raise exception 'Retention hold reason is required.'; end if;
  insert into public.retention_holds(
    project_id,subject_type,subject_id,subject_reference,hold_type,reason,evidence_reference,status,placed_by
  ) values(
    target_project,target_subject_type,target_subject_id,nullif(btrim(coalesce(target_subject_reference,'')),''),
    target_hold_type,btrim(target_reason),nullif(btrim(coalesce(target_evidence_reference,'')),''),'active',caller
  ) returning id into new_id;
  perform private.record_trust_policy_event(
    target_project,'RETENTION_HOLD_PLACED',caller,jsonb_build_object('hold_id',new_id,'hold_type',target_hold_type)
  );
  return new_id;
end;
$$;

create or replace function public.release_retention_hold_v1(
  target_hold uuid,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); target public.retention_holds%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into target from public.retention_holds where id=target_hold for update;
  if not found or target.status<>'active' then raise exception 'Active retention hold not found.'; end if;
  if not private.has_project_role(target.project_id,array['owner','admin']) then raise insufficient_privilege using message='Owner or admin access is required.'; end if;
  update public.retention_holds set status='released',released_by=caller,released_at=now(),release_reason=btrim(coalesce(target_reason,'Released.')) where id=target.id;
  perform private.record_trust_policy_event(target.project_id,'RETENTION_HOLD_RELEASED',caller,jsonb_build_object('hold_id',target.id));
  return target.id;
end;
$$;

create or replace function public.request_retention_review_v1(
  target_project uuid,
  target_subject_type text,
  target_proposed_disposition text,
  target_rationale text,
  target_subject_id uuid default null,
  target_subject_reference text default null,
  target_retention_policy uuid default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  policy public.retention_policies%rowtype;
  new_id uuid;
  hold_count integer;
  lineage jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  perform private.trust_validate_subject(target_project,target_subject_type,target_subject_id,target_subject_reference);
  if nullif(btrim(coalesce(target_rationale,'')),'') is null then raise exception 'Retention review rationale is required.'; end if;

  if target_retention_policy is not null then
    select * into policy
    from public.retention_policies
    where id=target_retention_policy and project_id=target_project and status='active';
  else
    select * into policy
    from public.retention_policies
    where project_id=target_project and status='active'
    order by effective_from desc nulls last,created_at desc
    limit 1;
  end if;
  if not found then raise exception 'An active retention policy is required for review.'; end if;

  select count(*)::integer into hold_count
  from public.retention_holds h
  where h.project_id=target_project and h.subject_type=target_subject_type and h.status='active'
    and coalesce(h.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(target_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(h.subject_reference,'')=coalesce(target_subject_reference,'');
  lineage:=private.trust_lineage_state(target_project,target_subject_type,target_subject_id,target_subject_reference);

  insert into public.retention_reviews(
    project_id,subject_type,subject_id,subject_reference,retention_policy_id,status,proposed_disposition,policy_version,
    rationale,hold_state_snapshot,lineage_state_snapshot,due_at,requested_by,evidence_reference
  ) values(
    target_project,target_subject_type,target_subject_id,nullif(btrim(coalesce(target_subject_reference,'')),''),
    policy.id,'pending',target_proposed_disposition,policy.policy_key||':'||policy.version::text,btrim(target_rationale),
    jsonb_build_object('active_hold_count',hold_count),lineage,policy.review_due_at,caller,
    nullif(btrim(coalesce(target_evidence_reference,'')),'')
  ) returning id into new_id;

  perform private.record_trust_policy_event(
    target_project,'RETENTION_REVIEW_REQUESTED',caller,
    jsonb_build_object('retention_review_id',new_id,'proposed_disposition',target_proposed_disposition)
  );
  return new_id;
end;
$$;

create or replace function public.resolve_retention_review_v1(
  target_review uuid,
  target_status text,
  target_reason text,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  review public.retention_reviews%rowtype;
  policy public.retention_policies%rowtype;
  blocked_hold boolean;
  lineage jsonb;
  lineage_resolved boolean;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if target_status not in ('keep','blocked','approved_for_future_disposition') then
    raise exception 'Unsupported retention review resolution.';
  end if;

  select * into review from public.retention_reviews where id=target_review for update;
  if not found or review.status<>'pending' then raise exception 'Pending retention review not found.'; end if;
  if not private.has_project_role(review.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if review.retention_policy_id is not null then
    select * into policy from public.retention_policies
    where id=review.retention_policy_id and project_id=review.project_id;
  end if;

  blocked_hold:=private.trust_has_active_retention_hold(
    review.project_id,review.subject_type,review.subject_id,review.subject_reference
  );
  lineage:=private.trust_lineage_state(
    review.project_id,review.subject_type,review.subject_id,review.subject_reference
  );
  lineage_resolved:=coalesce((lineage->>'known')::boolean,false)
    or coalesce(policy.requires_lineage_review,false)=false;

  if target_status='approved_for_future_disposition' then
    if blocked_hold then raise exception 'Retention hold blocks future disposition.'; end if;
    if review.proposed_disposition in ('archive','minimize','delete_when_authorized') and not lineage_resolved then
      raise exception 'Lineage review is unresolved and blocks future disposition.';
    end if;
  end if;

  update public.retention_reviews
  set status=target_status,reviewed_by=caller,reviewed_at=now(),
      rationale=concat_ws(E'\n',rationale,btrim(target_reason)),
      evidence_reference=coalesce(nullif(btrim(coalesce(target_evidence_reference,'')),''),evidence_reference),
      hold_state_snapshot=hold_state_snapshot||jsonb_build_object('active_at_resolution',blocked_hold),
      lineage_state_snapshot=lineage_state_snapshot||lineage||jsonb_build_object('resolved',lineage_resolved)
  where id=review.id;

  perform private.record_trust_policy_event(
    review.project_id,'RETENTION_REVIEW_RESOLVED',caller,
    jsonb_build_object('retention_review_id',review.id,'status',target_status,'lineage_resolved',lineage_resolved)
  );
  return review.id;
end;
$$;

create or replace function public.record_data_policy_lineage_v1(
  target_project uuid,
  target_source_subject_type text,
  target_derived_subject_type text,
  target_relation_type text,
  target_source_subject_id uuid default null,
  target_source_subject_reference text default null,
  target_derived_subject_id uuid default null,
  target_derived_subject_reference text default null,
  target_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid(); new_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_role(target_project,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Owner, admin, or operator access is required.';
  end if;
  perform private.trust_validate_subject(target_project,target_source_subject_type,target_source_subject_id,target_source_subject_reference);
  perform private.trust_validate_subject(target_project,target_derived_subject_type,target_derived_subject_id,target_derived_subject_reference);
  insert into public.data_policy_lineage(
    project_id,source_subject_type,source_subject_id,source_subject_reference,
    derived_subject_type,derived_subject_id,derived_subject_reference,relation_type,status,evidence_reference,created_by
  ) values(
    target_project,target_source_subject_type,target_source_subject_id,nullif(btrim(coalesce(target_source_subject_reference,'')),''),
    target_derived_subject_type,target_derived_subject_id,nullif(btrim(coalesce(target_derived_subject_reference,'')),''),
    target_relation_type,'active',nullif(btrim(coalesce(target_evidence_reference,'')),''),caller
  ) returning id into new_id;
  perform private.record_trust_policy_event(
    target_project,'DATA_POLICY_LINEAGE_RECORDED',caller,
    jsonb_build_object('lineage_id',new_id,'relation_type',target_relation_type)
  );
  return new_id;
end;
$$;

create or replace function public.get_trust_policy_workspace_v1(
  target_project uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth
as $$
declare caller uuid:=auth.uid();
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.has_project_access(target_project) then raise insufficient_privilege using message='Project access is required.'; end if;
  return jsonb_build_object(
    'active_manifest',(
      select to_jsonb(tm) from public.trust_manifests tm
      where tm.project_id=target_project and tm.scope_type='project' and tm.status='active'
      order by tm.version desc limit 1
    ),
    'manifests',coalesce((select jsonb_agg(to_jsonb(tm) order by tm.created_at desc) from public.trust_manifests tm where tm.project_id=target_project),'[]'::jsonb),
    'provider_profiles',coalesce((select jsonb_agg(to_jsonb(pp) order by pp.created_at desc) from public.provider_trust_profiles pp where pp.project_id=target_project),'[]'::jsonb),
    'bindings',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.data_policy_bindings b where b.project_id=target_project),'[]'::jsonb),
    'retention_policies',coalesce((select jsonb_agg(to_jsonb(rp) order by rp.created_at desc) from public.retention_policies rp where rp.project_id=target_project),'[]'::jsonb),
    'retention_holds',coalesce((select jsonb_agg(to_jsonb(h) order by h.placed_at desc) from public.retention_holds h where h.project_id=target_project and h.status='active'),'[]'::jsonb),
    'retention_reviews',coalesce((select jsonb_agg(to_jsonb(rv) order by rv.created_at desc) from public.retention_review_view rv where rv.project_id=target_project),'[]'::jsonb),
    'can_propose',private.has_project_role(target_project,array['owner','admin','operator']),
    'can_approve',private.has_project_role(target_project,array['owner','admin'])
  );
end;
$$;

create or replace function public.service_evaluate_data_policy_v1(target_project uuid,target_actor_user uuid,target_subject_type text,target_purpose text,target_requested_operation text,target_trace_id text,target_subject_id uuid default null,target_subject_reference text default null,target_provider_connection uuid default null,target_provider_key text default null,target_hard_learning_exclusion boolean default false)returns jsonb language plpgsql security definer set search_path=public,private,auth as $$ declare policy jsonb;profile public.provider_trust_profiles%rowtype;rollout_manifest public.trust_manifests%rowtype;outcome text:='allow';reason_code text:='policy_allow';decision_trace text:=coalesce(nullif(btrim(coalesce(target_trace_id,'')),''),'DN-POL-'||replace(gen_random_uuid()::text,'-',''));decision_record_id uuid;visibility text;reuse_state text;publication_allowed boolean;lineage jsonb;hold_count integer:=0;enforcement_mode text:='report_only';resolved_provider_key text;manifest_id uuid;binding_id uuid;retention_policy_id uuid;begin if target_purpose not in('job_execution','user_requested_analysis','certification_review','project_learning','platform_learning','product_operation','external_provider_processing','publication','audit','security_investigation','export','retention_management')then raise exception'Unsupported data policy purpose.';end if;if target_requested_operation not in('process','reuse','publish','export','audit','future_disposition')then raise exception'Unsupported data policy operation.';end if;perform private.trust_validate_subject(target_project,target_subject_type,target_subject_id,target_subject_reference);policy:=private.trust_resolve_effective_policy(target_project,target_subject_type,target_subject_id,target_subject_reference);visibility:=policy->>'visibility_class';reuse_state:=policy->>'reuse_state';publication_allowed:=coalesce((policy->>'publication_authorized')::boolean,false);binding_id:=nullif(policy->>'binding_id','')::uuid;manifest_id:=nullif(policy->>'manifest_id','')::uuid;if manifest_id is not null then select*into rollout_manifest from public.trust_manifests where id=manifest_id;end if;if not found then select*into rollout_manifest from public.trust_manifests where project_id=target_project and scope_type='project' and status='active' order by version desc limit 1;end if;if found then enforcement_mode:=rollout_manifest.enforcement_mode;retention_policy_id:=rollout_manifest.retention_policy_id;end if;if not coalesce((policy->>'resolved')::boolean,false)and(target_provider_connection is not null or target_purpose in('external_provider_processing','project_learning','platform_learning','publication','retention_management')or target_requested_operation in('reuse','publish','future_disposition'))then outcome:='review_required';reason_code:='policy_unresolved';end if;if target_provider_connection is not null then resolved_provider_key:=private.trust_provider_key_for_connection(target_project,target_provider_connection);if nullif(btrim(coalesce(target_provider_key,'')),'')is not null and lower(btrim(target_provider_key))<>resolved_provider_key then outcome:='deny';reason_code:='provider_key_mismatch';elsif outcome='allow' and visibility='local_only' then outcome:='deny';reason_code:='local_only_external_denied';elsif outcome='allow' and rollout_manifest.id is not null and rollout_manifest.enforcement_mode='enforced' and not(resolved_provider_key=any(rollout_manifest.approved_provider_keys))then outcome:='deny';reason_code:='provider_not_manifest_approved';elsif outcome='allow' then select*into profile from public.provider_trust_profiles pp where pp.project_id=target_project and pp.provider_connection_id=target_provider_connection and pp.provider_key=resolved_provider_key order by pp.created_at desc limit 1;if not found then outcome:='deny';reason_code:='provider_profile_missing';elsif profile.status not in('active','restricted')or(profile.review_due_at is not null and profile.review_due_at<=now())then outcome:='deny';reason_code:='provider_profile_inactive';elsif not(visibility=any(profile.allowed_visibility_classes))then outcome:='deny';reason_code:='provider_visibility_denied';elsif target_purpose=any(profile.prohibited_purposes)or not(target_purpose=any(profile.allowed_purposes))then outcome:='deny';reason_code:='provider_purpose_denied';end if;end if;end if;if outcome='allow' and target_hard_learning_exclusion and(target_purpose in('project_learning','platform_learning')or target_requested_operation='reuse')then outcome:='deny';reason_code:='hard_learning_exclusion';end if;if outcome='allow' and target_purpose='project_learning' and reuse_state<>'project_learning_eligible' then outcome:='deny';reason_code:='project_learning_not_authorized';end if;if outcome='allow' and target_purpose='platform_learning' and reuse_state<>'platform_learning_eligible' then outcome:='deny';reason_code:='platform_learning_not_authorized';end if;if outcome='allow' and(target_purpose='publication' or target_requested_operation='publish')and(visibility<>'public' or not publication_allowed)then outcome:='deny';reason_code:='publication_not_authorized';end if;if target_requested_operation='future_disposition' then select count(*)::integer into hold_count from public.retention_holds h where h.project_id=target_project and h.subject_type=target_subject_type and h.status='active' and coalesce(h.subject_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(target_subject_id,'00000000-0000-0000-0000-000000000000'::uuid)and coalesce(h.subject_reference,'')=coalesce(target_subject_reference,'');if hold_count>0 then outcome:='deny';reason_code:='retention_hold_active';elsif outcome='allow' then lineage:=private.trust_lineage_state(target_project,target_subject_type,target_subject_id,target_subject_reference);if not coalesce((lineage->>'known')::boolean,false)then outcome:='review_required';reason_code:='lineage_review_unresolved';end if;end if;end if;insert into public.data_policy_decisions(project_id,trace_id,actor_user_id,subject_type,subject_id,subject_reference,purpose,requested_operation,outcome,reason_code,effective_visibility_class,effective_reuse_state,publication_authorized,manifest_id,binding_id,provider_profile_id,retention_policy_id,enforcement_mode,policy_version)values(target_project,decision_trace,target_actor_user,target_subject_type,target_subject_id,target_subject_reference,target_purpose,target_requested_operation,outcome,reason_code,visibility,reuse_state,publication_allowed,coalesce(manifest_id,rollout_manifest.id),binding_id,profile.id,retention_policy_id,enforcement_mode,coalesce(policy->>'policy_version','unresolved'))on conflict(project_id,trace_id,purpose,requested_operation)do nothing returning id into decision_record_id;if decision_record_id is null then select id into decision_record_id from public.data_policy_decisions where project_id=target_project and trace_id=decision_trace and purpose=target_purpose and requested_operation=target_requested_operation;end if;perform private.record_trust_policy_event(target_project,'DATA_POLICY_EVALUATED',target_actor_user,jsonb_build_object('decision_trace',decision_trace,'decision_record_id',decision_record_id,'subject_type',target_subject_type,'subject_id',target_subject_id,'subject_reference',target_subject_reference,'purpose',target_purpose,'operation',target_requested_operation,'outcome',outcome,'reason_code',reason_code,'visibility_class',visibility,'reuse_state',reuse_state,'binding_id',binding_id,'manifest_id',coalesce(manifest_id,rollout_manifest.id),'provider_profile_id',profile.id,'retention_policy_id',retention_policy_id,'retention_hold_count',hold_count,'enforcement_mode',enforcement_mode,'policy_version',policy->>'policy_version'));return jsonb_build_object('outcome',outcome,'reason_code',reason_code,'visibility_class',visibility,'reuse_state',reuse_state,'publication_authorized',publication_allowed,'binding_id',binding_id,'manifest_id',coalesce(manifest_id,rollout_manifest.id),'manifest_version',coalesce((policy->>'manifest_version')::integer,rollout_manifest.version),'provider_profile_id',profile.id,'retention_policy_id',retention_policy_id,'retention_hold_count',hold_count,'policy_version',policy->>'policy_version','enforcement_mode',enforcement_mode,'decision_trace',decision_trace,'decision_record_id',decision_record_id);end;$$;revoke all on function private.record_trust_policy_event(uuid,text,uuid,jsonb)from public,anon,authenticated;revoke all on function private.trust_validate_subject(uuid,text,uuid,text)from public,anon,authenticated;revoke all on function private.trust_active_manifest(uuid,uuid)from public,anon,authenticated;revoke all on function private.trust_effective_binding(uuid,text,uuid,text)from public,anon,authenticated;revoke all on function private.trust_has_active_retention_hold(uuid,text,uuid,text)from public,anon,authenticated;revoke all on function private.trust_lineage_state(uuid,text,uuid,text)from public,anon,authenticated;revoke all on function private.trust_validate_manifest_evidence(uuid)from public,anon,authenticated;revoke all on function private.trust_validate_provider_profile(uuid)from public,anon,authenticated;revoke all on function private.trust_provider_key_for_connection(uuid,uuid)from public,anon,authenticated;revoke all on function private.trust_resolve_effective_policy(uuid,text,uuid,text)from public,anon,authenticated;revoke all on function public.propose_data_policy_binding_v1(uuid,text,text,text,text,uuid,text,boolean,text)from public,anon;revoke all on function public.approve_data_policy_binding_v1(uuid)from public,anon;revoke all on function public.reject_data_policy_binding_v1(uuid,text)from public,anon;revoke all on function public.create_trust_manifest_draft_v1(uuid,text,text,text,text,text,uuid,uuid,text[],text,text,text,text,text,text,timestamptz)from public,anon;revoke all on function public.activate_trust_manifest_v1(uuid)from public,anon;revoke all on function public.reject_trust_manifest_v1(uuid,text)from public,anon;revoke all on function public.create_provider_trust_profile_v1(uuid,text,text,text,text[],text[],text,text,uuid,text[],text[],text,text,text,text,text,text,timestamptz)from public,anon;revoke all on function public.activate_provider_trust_profile_v1(uuid)from public,anon;revoke all on function public.suspend_provider_trust_profile_v1(uuid,text)from public,anon;revoke all on function public.retire_provider_trust_profile_v1(uuid,text)from public,anon;revoke all on function public.propose_retention_policy_v1(uuid,text,text,boolean,text[],text[],text[],integer,integer,jsonb,jsonb,text,text,timestamptz)from public,anon;revoke all on function public.approve_retention_policy_v1(uuid)from public,anon;revoke all on function public.reject_retention_policy_v1(uuid,text)from public,anon;revoke all on function public.place_retention_hold_v1(uuid,text,text,text,uuid,text,text)from public,anon;revoke all on function public.release_retention_hold_v1(uuid,text)from public,anon;revoke all on function public.request_retention_review_v1(uuid,text,text,text,uuid,text,uuid,text)from public,anon;revoke all on function public.resolve_retention_review_v1(uuid,text,text,text)from public,anon;revoke all on function public.record_data_policy_lineage_v1(uuid,text,text,text,uuid,text,uuid,text,text)from public,anon;revoke all on function public.get_trust_policy_workspace_v1(uuid)from public,anon;revoke all on function public.service_evaluate_data_policy_v1(uuid,uuid,text,text,text,text,uuid,text,uuid,text,boolean)from public,anon,authenticated;grant execute on function public.propose_data_policy_binding_v1(uuid,text,text,text,text,uuid,text,boolean,text)to authenticated,service_role;grant execute on function public.approve_data_policy_binding_v1(uuid)to authenticated,service_role;grant execute on function public.reject_data_policy_binding_v1(uuid,text)to authenticated,service_role;grant execute on function public.create_trust_manifest_draft_v1(uuid,text,text,text,text,text,uuid,uuid,text[],text,text,text,text,text,text,timestamptz)to authenticated,service_role;grant execute on function public.activate_trust_manifest_v1(uuid)to authenticated,service_role;grant execute on function public.reject_trust_manifest_v1(uuid,text)to authenticated,service_role;grant execute on function public.create_provider_trust_profile_v1(uuid,text,text,text,text[],text[],text,text,uuid,text[],text[],text,text,text,text,text,text,timestamptz)to authenticated,service_role;grant execute on function public.activate_provider_trust_profile_v1(uuid)to authenticated,service_role;grant execute on function public.suspend_provider_trust_profile_v1(uuid,text)to authenticated,service_role;grant execute on function public.retire_provider_trust_profile_v1(uuid,text)to authenticated,service_role;grant execute on function public.propose_retention_policy_v1(uuid,text,text,boolean,text[],text[],text[],integer,integer,jsonb,jsonb,text,text,timestamptz)to authenticated,service_role;grant execute on function public.approve_retention_policy_v1(uuid)to authenticated,service_role;grant execute on function public.reject_retention_policy_v1(uuid,text)to authenticated,service_role;grant execute on function public.place_retention_hold_v1(uuid,text,text,text,uuid,text,text)to authenticated,service_role;grant execute on function public.release_retention_hold_v1(uuid,text)to authenticated,service_role;grant execute on function public.request_retention_review_v1(uuid,text,text,text,uuid,text,uuid,text)to authenticated,service_role;grant execute on function public.resolve_retention_review_v1(uuid,text,text,text)to authenticated,service_role;grant execute on function public.record_data_policy_lineage_v1(uuid,text,text,text,uuid,text,uuid,text,text)to authenticated,service_role;grant execute on function public.get_trust_policy_workspace_v1(uuid)to authenticated,service_role;grant execute on function public.service_evaluate_data_policy_v1(uuid,uuid,text,text,text,text,uuid,text,uuid,text,boolean)to service_role;commit;