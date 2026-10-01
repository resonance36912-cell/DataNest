begin;

create table if not exists public.resonance_certification_credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  assessment_id uuid not null references public.external_audit_assessments(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  request_id uuid not null,
  certification_code text not null check (certification_code ~ '^RCS-[A-Z]+-[0-9]{2}$'),
  certificate_number text not null,
  subject_name text not null,
  scope_statement text not null,
  standard_ref text not null default 'RCS',
  standard_version text not null default '1.0',
  status text not null default 'issued'
    check (status in ('draft','issued','suspended','revoked','expired')),
  issued_at timestamptz,
  valid_until timestamptz not null,
  review_due_at timestamptz,
  evidence_reference text,
  public_reference text,
  limitations text,
  decision_notes text,
  issued_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,request_id),
  unique(project_id,certificate_number),
  constraint resonance_certification_subject_nonempty
    check (char_length(btrim(subject_name)) between 1 and 240),
  constraint resonance_certification_scope_nonempty
    check (char_length(btrim(scope_statement)) between 1 and 5000),
  constraint resonance_certification_temporal_order
    check (
      review_due_at is null
      or review_due_at <= valid_until
    )
);

create index if not exists resonance_certification_project_status_idx
  on public.resonance_certification_credentials(project_id,status,valid_until desc);

create index if not exists resonance_certification_assessment_idx
  on public.resonance_certification_credentials(assessment_id,created_at desc);

create index if not exists resonance_certification_product_idx
  on public.resonance_certification_credentials(product_id,created_at desc)
  where product_id is not null;

alter table public.resonance_certification_credentials enable row level security;

revoke all on table public.resonance_certification_credentials from anon,authenticated;
grant select on table public.resonance_certification_credentials to authenticated;
grant select,insert,update,delete on table public.resonance_certification_credentials to service_role;

create policy resonance_certification_credentials_select
  on public.resonance_certification_credentials
  for select
  to authenticated
  using (
    private.is_project_stakeholder(project_id)
    or private.is_project_member(project_id)
  );

create or replace function private.resonance_certification_touch_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists resonance_certification_touch_updated_at
  on public.resonance_certification_credentials;
create trigger resonance_certification_touch_updated_at
before update on public.resonance_certification_credentials
for each row execute function private.resonance_certification_touch_updated_at();

create or replace function public.issue_resonance_certification_v1(
  target_assessment uuid,
  target_request_key uuid,
  target_certification_code text,
  target_subject_name text,
  target_scope_statement text,
  target_valid_until timestamptz,
  target_review_due_at timestamptz default null,
  target_product_id uuid default null,
  target_public_reference text default null,
  target_evidence_reference text default null,
  target_limitations text default null,
  target_decision_notes text default null
) returns table (
  credential_id uuid,
  certificate_number text,
  status text
)
language plpgsql
security definer
set search_path=public,private,auth,extensions
as $$
declare
  caller uuid:=auth.uid();
  a public.external_audit_assessments%rowtype;
  existing public.resonance_certification_credentials%rowtype;
  approved_profile_exists boolean;
  captured_evidence_exists boolean;
  blocking_findings_exists boolean;
  created_id uuid;
  created_certificate_number text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_request_key is null then
    raise exception 'Request key is required.';
  end if;

  if target_valid_until is null or target_valid_until <= now() then
    raise exception 'A future certification validity boundary is required.';
  end if;

  if target_review_due_at is not null and target_review_due_at > target_valid_until then
    raise exception 'Review due date cannot be later than certification expiry.';
  end if;

  if not target_certification_code ~ '^RCS-[A-Z]+-[0-9]{2}$' then
    raise exception 'Invalid Resonance certification code.';
  end if;

  if nullif(btrim(coalesce(target_subject_name,'')),'') is null
     or nullif(btrim(coalesce(target_scope_statement,'')),'') is null then
    raise exception 'Subject and scope are required.';
  end if;

  select * into a
  from public.external_audit_assessments
  where id=target_assessment;

  if not found then
    raise exception 'Assessment not found.';
  end if;

  if not private.has_project_role(a.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to issue certification.';
  end if;

  select * into existing
  from public.resonance_certification_credentials
  where project_id=a.project_id
    and request_id=target_request_key;

  if found then
    if existing.assessment_id is distinct from a.id
       or existing.certification_code is distinct from btrim(target_certification_code)
       or existing.subject_name is distinct from btrim(target_subject_name)
       or existing.scope_statement is distinct from btrim(target_scope_statement)
       or existing.valid_until is distinct from target_valid_until
       or existing.review_due_at is distinct from target_review_due_at
       or existing.product_id is distinct from target_product_id then
      raise exception 'Request key already exists with a different certification payload.';
    end if;
    return query select existing.id,existing.certificate_number,existing.status;
    return;
  end if;

  if a.status<>'closed' then
    raise exception 'Assessment must be closed before certification issuance.';
  end if;

  select exists(
    select 1
    from public.external_audit_profiles p
    where p.assessment_id=a.id
      and p.revision=a.revision
      and p.approved_at is not null
  ) into approved_profile_exists;

  if not approved_profile_exists then
    raise exception 'An approved standards profile is required before certification issuance.';
  end if;

  select exists(
    select 1
    from public.external_audit_sources s
    where s.assessment_id=a.id
      and s.project_id=a.project_id
      and s.revision=a.revision
      and s.acquisition_state='captured'
  ) into captured_evidence_exists;

  if not captured_evidence_exists then
    raise exception 'Captured evidence is required before certification issuance.';
  end if;

  select exists(
    select 1
    from public.external_audit_findings f
    where f.assessment_id=a.id
      and f.project_id=a.project_id
      and f.revision=a.revision
      and f.state in ('draft','potential_gap','verified_nonconformity')
  ) into blocking_findings_exists;

  if blocking_findings_exists then
    raise exception 'Blocking assessment findings must be resolved before certification issuance.';
  end if;

  if target_product_id is not null and not exists(
    select 1
    from public.products p
    where p.id=target_product_id
      and p.project_id=a.project_id
  ) then
    raise exception 'Certification product must belong to the assessment project.';
  end if;

  created_certificate_number :=
    'RCS-' || extract(year from now())::text || '-' ||
    upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 12));

  insert into public.resonance_certification_credentials(
    project_id,assessment_id,product_id,request_id,certification_code,
    certificate_number,subject_name,scope_statement,standard_ref,
    standard_version,status,issued_at,valid_until,review_due_at,
    evidence_reference,public_reference,limitations,decision_notes,
    issued_by,created_by
  ) values (
    a.project_id,a.id,target_product_id,target_request_key,btrim(target_certification_code),
    created_certificate_number,btrim(target_subject_name),btrim(target_scope_statement),'RCS','1.0',
    'issued',now(),target_valid_until,target_review_due_at,
    nullif(btrim(coalesce(target_evidence_reference,'')), ''),
    nullif(btrim(coalesce(target_public_reference,'')), ''),
    nullif(btrim(coalesce(target_limitations,'')), ''),
    nullif(btrim(coalesce(target_decision_notes,'')), ''),
    caller,caller
  )
  returning id into created_id;

  insert into public.external_audit_events(
    assessment_id,project_id,revision,event_type,actor_user_id,payload
  ) values (
    a.id,a.project_id,a.revision,'CERTIFICATION_ISSUED',caller,
    jsonb_build_object(
      'credential_id',created_id,
      'certificate_number',created_certificate_number,
      'certification_code',btrim(target_certification_code),
      'standard_ref','RCS',
      'standard_version','1.0',
      'status','issued'
    )
  );

  return query
  select created_id,created_certificate_number,'issued'::text;
end;
$$;

create or replace function public.set_resonance_certification_status_v1(
  target_credential uuid,
  target_status text,
  target_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  c public.resonance_certification_credentials%rowtype;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_status not in ('suspended','revoked','expired') then
    raise exception 'Only suspension, revocation or expiry may be set through this lifecycle operation.';
  end if;

  if nullif(btrim(coalesce(target_reason,'')),'') is null then
    raise exception 'A status-change reason is required.';
  end if;

  select * into c
  from public.resonance_certification_credentials
  where id=target_credential
  for update;

  if not found then
    raise exception 'Certification credential not found.';
  end if;

  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required to change certification status.';
  end if;

  if c.status=target_status then
    return c.id;
  end if;

  if c.status in ('revoked','expired') then
    raise exception 'Revoked or expired credentials cannot be reactivated through this operation.';
  end if;

  update public.resonance_certification_credentials
  set status=target_status
  where id=c.id;

  insert into public.external_audit_events(
    assessment_id,project_id,revision,event_type,actor_user_id,payload
  )
  select
    c.assessment_id,a.project_id,a.revision,'CERTIFICATION_STATUS_CHANGED',caller,
    jsonb_build_object(
      'credential_id',c.id,
      'certificate_number',c.certificate_number,
      'from_status',c.status,
      'to_status',target_status,
      'reason',left(btrim(target_reason),2000)
    )
  from public.external_audit_assessments a
  where a.id=c.assessment_id;

  return c.id;
end;
$$;

revoke all on function public.issue_resonance_certification_v1(
  uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text,text
) from public,anon;
grant execute on function public.issue_resonance_certification_v1(
  uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text,text
) to authenticated;

revoke all on function public.set_resonance_certification_status_v1(uuid,text,text) from public,anon;
grant execute on function public.set_resonance_certification_status_v1(uuid,text,text) to authenticated;

do $$
declare
  target_project uuid:='c2aa30c1-fc82-4524-8510-021ac0fef967';
  certification_product uuid;
  portfolio_id uuid;
begin
  select id into certification_product
  from public.products
  where project_id=target_project and slug='resonance-certification-assurance';

  if certification_product is null then
    insert into public.products(
      id,project_id,slug,name,full_name,category,lifecycle_status,mission,
      operating_model,primary_runtime,commercial_mode,billing_enabled,as_of_date,
      source_payload,metadata
    ) values (
      gen_random_uuid(),
      target_project,
      'resonance-certification-assurance',
      'Resonance Certification & Assurance',
      'Resonance Certification & Assurance — A DataNest service by Resonance',
      'certification, assurance and standards services',
      'active governed service offering',
      'Evidence-led readiness assessment, certification, standards alignment, surveillance and governed evidence packs.',
      'DataNest-managed certification service using the existing external audit, standards, evidence and review control plane with human certification decisions.',
      'DataNest governance and evidence control plane',
      'free promotion / no billing until pricing is established',
      false,
      current_date,
      jsonb_build_object(
        'source_authority','DataNest-Supository/DataNest',
        'source_reference','docs/certification/RESONANCE_CERTIFICATION_STANDARD.md'
      ),
      jsonb_build_object(
        'parent_platform','Resonance DataNest',
        'product_role','governed_product',
        'service_kind','certification_assurance',
        'standard_id','RCS',
        'standard_version','1.0',
        'external_accreditation_claim',false,
        'execution_authority','DataNest',
        'promotion_authority','DataNest',
        'hosting_model','replaceable_delivery_infrastructure',
        'commercial_state','free_promotion'
      )
    ) returning id into certification_product;
  else
    update public.products
    set
      name='Resonance Certification & Assurance',
      full_name='Resonance Certification & Assurance — A DataNest service by Resonance',
      category='certification, assurance and standards services',
      lifecycle_status='active governed service offering',
      mission='Evidence-led readiness assessment, certification, standards alignment, surveillance and governed evidence packs.',
      operating_model='DataNest-managed certification service using the existing external audit, standards, evidence and review control plane with human certification decisions.',
      primary_runtime='DataNest governance and evidence control plane',
      commercial_mode='free promotion / no billing until pricing is established',
      billing_enabled=false,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'parent_platform','Resonance DataNest',
        'product_role','governed_product',
        'service_kind','certification_assurance',
        'standard_id','RCS',
        'standard_version','1.0',
        'external_accreditation_claim',false,
        'execution_authority','DataNest',
        'promotion_authority','DataNest',
        'hosting_model','replaceable_delivery_infrastructure',
        'commercial_state','free_promotion'
      ),
      updated_at=now()
    where id=certification_product;
  end if;

  insert into public.portfolio_items(
    id,project_id,slug,name,item_kind,review_state,current_lifecycle,
    linked_product_id,source_authority,source_reference,metadata
  ) values (
    gen_random_uuid(),target_project,'resonance-certification-assurance',
    'Resonance Certification & Assurance','capability','classified','active',
    certification_product,'DataNest-Supository/DataNest',
    'docs/certification/RESONANCE_CERTIFICATION_STANDARD.md',
    jsonb_build_object(
      'service_kind','certification_assurance',
      'standard','RCS 1.0',
      'external_accreditation_claim',false,
      'commercial_state','free_promotion'
    )
  )
  on conflict (project_id,slug) do update
    set name=excluded.name,
        item_kind=excluded.item_kind,
        review_state=excluded.review_state,
        current_lifecycle=excluded.current_lifecycle,
        linked_product_id=excluded.linked_product_id,
        source_authority=excluded.source_authority,
        source_reference=excluded.source_reference,
        metadata=excluded.metadata,
        updated_at=now();

  select id into portfolio_id
  from public.portfolio_items
  where project_id=target_project and slug='resonance-certification-assurance';

  insert into public.product_records(
    id,project_id,product_id,record_type,code,name,status,sort_order,payload
  ) values
  (gen_random_uuid(),target_project,certification_product,'service_offering','RCS-SVC-01','Certification Readiness Assessment','available_for_intake',1,
   jsonb_build_object('output','Readiness report, applicability profile, evidence plan and remediation register.','claim_boundary','Readiness assessment is not itself certification.')),
  (gen_random_uuid(),target_project,certification_product,'service_offering','RCS-SVC-02','Resonance Certification Assessment','available_for_intake',2,
   jsonb_build_object('output','Assessment record, findings/actions, review record and certification decision.','claim_boundary','Internal RCS certification only; not external accreditation.')),
  (gen_random_uuid(),target_project,certification_product,'service_offering','RCS-SVC-03','Certification & Evidence Pack','available_for_intake',3,
   jsonb_build_object('output','Certificate record plus human/machine-readable evidence pack.','claim_boundary','Certificate scope, state, dates and limitations must be disclosed.')),
  (gen_random_uuid(),target_project,certification_product,'service_offering','RCS-SVC-04','Surveillance & Renewal','available_for_intake',4,
   jsonb_build_object('output','Surveillance record and renewal, suspension, revocation or expiry decision.','claim_boundary','Renewal is a new governed decision, not an automatic extension.')),
  (gen_random_uuid(),target_project,certification_product,'service_offering','RCS-SVC-05','Standards Alignment Review','available_for_intake',5,
   jsonb_build_object('output','Alignment report and trace matrix.','claim_boundary','Standards alignment does not imply external certification or accreditation.')),
  (gen_random_uuid(),target_project,certification_product,'certification_class','RCS-GOV-01','Governance & Control Assurance','available_for_scope',10,
   jsonb_build_object('domain','governance','description','Identity, authority, accountability, human oversight and control traceability.')),
  (gen_random_uuid(),target_project,certification_product,'certification_class','RCS-PROD-01','Product & Software Assurance','available_for_scope',11,
   jsonb_build_object('domain','product','description','Product quality, accessibility, reliability, usability and release discipline.')),
  (gen_random_uuid(),target_project,certification_product,'certification_class','RCS-AI-01','AI Governance Assurance','available_for_scope',12,
   jsonb_build_object('domain','ai','description','AI purpose, authority boundaries, evaluation, memory/data controls and human oversight.')),
  (gen_random_uuid(),target_project,certification_product,'certification_class','RCS-DATA-01','Data & Privacy Assurance','available_for_scope',13,
   jsonb_build_object('domain','data_privacy','description','Data governance, access, minimization, disclosure and privacy controls.')),
  (gen_random_uuid(),target_project,certification_product,'certification_class','RCS-OPS-01','Operational & Release Assurance','available_for_scope',14,
   jsonb_build_object('domain','operations','description','Change, deployment, monitoring, recovery and post-release verification.')),
  (gen_random_uuid(),target_project,certification_product,'certification_class','RCS-MKT-01','Transparency & Market Integrity Assurance','available_for_scope',15,
   jsonb_build_object('domain','market_integrity','description','Truthful market claims, certification disclosure, evidence references and commercial-state transparency.')),
  (gen_random_uuid(),target_project,certification_product,'certification_gate','RCS-GATE-01','Scope & Assessment Identity','required',20,
   jsonb_build_object('requirement','Defined target, scope and assessment revision.')),
  (gen_random_uuid(),target_project,certification_product,'certification_gate','RCS-GATE-02','Approved Standards Profile','required',21,
   jsonb_build_object('requirement','Approved applicability and standards profile for the assessment revision.')),
  (gen_random_uuid(),target_project,certification_product,'certification_gate','RCS-GATE-03','Captured Traceable Evidence','required',22,
   jsonb_build_object('requirement','Evidence is captured, attributable and traceable to the assessment revision.')),
  (gen_random_uuid(),target_project,certification_product,'certification_gate','RCS-GATE-04','Human Certification Decision','required',23,
   jsonb_build_object('requirement','Authorized human owner/admin issues the certification decision; automation cannot self-issue.')),
  (gen_random_uuid(),target_project,certification_product,'certification_gate','RCS-GATE-05','Blocking Findings Resolved','required',24,
   jsonb_build_object('requirement','Draft, potential-gap and verified-nonconformity findings block issuance.')),
  (gen_random_uuid(),target_project,certification_product,'certification_gate','RCS-GATE-06','Time-Bounded Validity','required',25,
   jsonb_build_object('requirement','Every issued credential has an explicit future validity boundary and optional review date.')),
  (gen_random_uuid(),target_project,certification_product,'claim_boundary','RCS-BOUNDARY-01','Internal Certification Boundary','required',30,
   jsonb_build_object('rule','RCS certification is an internal Resonance assurance claim and must not be represented as ISO certification, accreditation, regulatory approval or third-party conformity certification.')),
  (gen_random_uuid(),target_project,certification_product,'commercial_policy','RCS-COMM-01','Free Promotion / Billing Off','required',31,
   jsonb_build_object('billing_enabled',false,'commercial_mode','free promotion / no billing until pricing is established')),
  (gen_random_uuid(),target_project,certification_product,'portfolio_link','RCS-PORT-01','DataNest Portfolio Capability','active',32,
   jsonb_build_object('portfolio_item_id',portfolio_id,'source_reference','docs/certification/RESONANCE_CERTIFICATION_STANDARD.md'))
  on conflict (project_id,product_id,record_type,code) where code is not null do update
    set name=excluded.name,status=excluded.status,sort_order=excluded.sort_order,payload=excluded.payload,updated_at=now();
end;
$$;

create unique index if not exists product_records_product_type_code_unique_idx
  on public.product_records(project_id,product_id,record_type,code)
  where code is not null;

commit;
