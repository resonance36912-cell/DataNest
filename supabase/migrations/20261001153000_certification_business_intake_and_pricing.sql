begin;

alter table public.products
  add column if not exists service_category text;

update public.products
set service_category='certification_assurance'
where slug='resonance-certification-assurance'
  and project_id='c2aa30c1-fc82-4524-8510-021ac0fef967';

create table if not exists public.certification_service_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  request_key uuid not null,
  service_code text not null check (service_code in (
    'RCS-SVC-01','RCS-SVC-02','RCS-SVC-03','RCS-SVC-04','RCS-SVC-05'
  )),
  certification_code text check (certification_code is null or certification_code ~ '^RCS-[A-Z]+-[0-9]{2}$'),
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  target_name text not null,
  target_kind text not null check (target_kind in ('website','application','repository','product','project','document','organization','service','other')),
  target_reference text,
  scope_summary text not null,
  jurisdiction text,
  status text not null default 'inquiry' check (status in (
    'inquiry','qualified','scoped','accepted','declined','converted','cancelled','completed'
  )),
  commercial_status text not null default 'pricing_required' check (commercial_status in (
    'pricing_required','price_published','quote_required','quote_sent','quote_accepted','quote_declined','not_applicable'
  )),
  quoted_currency text,
  quoted_amount numeric(14,2),
  quote_reference text,
  assessment_id uuid references public.external_audit_assessments(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,request_key),
  constraint certification_service_request_target_nonempty
    check (char_length(btrim(target_name)) between 1 and 240),
  constraint certification_service_request_scope_nonempty
    check (char_length(btrim(scope_summary)) between 1 and 5000),
  constraint certification_service_request_quote_positive
    check (quoted_amount is null or quoted_amount >= 0)
);

create index if not exists certification_service_requests_project_status_idx
  on public.certification_service_requests(project_id,status,created_at desc);

create index if not exists certification_service_requests_service_idx
  on public.certification_service_requests(service_code,status,created_at desc);

create index if not exists certification_service_requests_requester_idx
  on public.certification_service_requests(requester_user_id,created_at desc);

alter table public.certification_service_requests enable row level security;

revoke all on table public.certification_service_requests from anon,authenticated;
grant select,insert on table public.certification_service_requests to authenticated;
grant select,insert,update,delete on table public.certification_service_requests to service_role;

create policy certification_service_requests_select
  on public.certification_service_requests for select to authenticated
  using (
    requester_user_id=auth.uid()
    or private.has_project_role(project_id,array['owner','admin','operator'])
  );

create policy certification_service_requests_insert
  on public.certification_service_requests for insert to authenticated
  with check (
    requester_user_id=auth.uid()
    and (
      private.is_project_member(project_id)
      or private.is_project_stakeholder(project_id)
    )
  );

create policy certification_service_requests_update
  on public.certification_service_requests for update to authenticated
  using (
    private.has_project_role(project_id,array['owner','admin','operator'])
  )
  with check (
    private.has_project_role(project_id,array['owner','admin','operator'])
  );

create or replace function private.certification_service_request_touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists certification_service_request_touch_updated_at on public.certification_service_requests;
create trigger certification_service_request_touch_updated_at
before update on public.certification_service_requests
for each row execute function private.certification_service_request_touch_updated_at();

create or replace function public.create_certification_service_request_v1(
  target_project uuid,
  target_request_key uuid,
  target_service_code text,
  target_certification_code text,
  target_target_name text,
  target_target_kind text,
  target_target_reference text,
  target_scope_summary text,
  target_jurisdiction text
) returns table(request_id uuid,status text)
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  existing public.certification_service_requests%rowtype;
  created public.certification_service_requests%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if target_request_key is null then raise exception 'Request key is required.'; end if;
  if target_service_code not in ('RCS-SVC-01','RCS-SVC-02','RCS-SVC-03','RCS-SVC-04','RCS-SVC-05') then
    raise exception 'Unsupported certification service.';
  end if;
  if nullif(btrim(coalesce(target_target_name,'')),'') is null
     or nullif(btrim(coalesce(target_scope_summary,'')),'') is null then
    raise exception 'Target name and scope summary are required.';
  end if;
  if not private.is_project_member(target_project) and not private.is_project_stakeholder(target_project) then
    raise insufficient_privilege using message='Project participation is required to submit a certification service request.';
  end if;

  if target_certification_code is not null and not target_certification_code ~ '^RCS-[A-Z]+-[0-9]{2}$' then
    raise exception 'Invalid certification class.';
  end if;

  select * into existing
  from public.certification_service_requests
  where project_id=target_project and request_key=target_request_key;

  if found then
    if existing.service_code is distinct from target_service_code
       or existing.target_name is distinct from btrim(target_target_name)
       or existing.target_kind is distinct from btrim(target_target_kind)
       or existing.target_reference is distinct from nullif(btrim(coalesce(target_target_reference,'')),'')
       or existing.scope_summary is distinct from btrim(target_scope_summary)
       or existing.jurisdiction is distinct from nullif(btrim(coalesce(target_jurisdiction,'')),'') then
      raise exception 'Request key already exists with a different payload.';
    end if;
    return query select existing.id,existing.status;
    return;
  end if;

  insert into public.certification_service_requests(
    project_id,request_key,service_code,certification_code,requester_user_id,
    target_name,target_kind,target_reference,scope_summary,jurisdiction,
    status,commercial_status
  ) values (
    target_project,target_request_key,target_service_code,
    nullif(btrim(coalesce(target_certification_code,'')),''),
    caller,btrim(target_target_name),btrim(target_target_kind),
    nullif(btrim(coalesce(target_target_reference,'')),''),
    btrim(target_scope_summary),
    nullif(btrim(coalesce(target_jurisdiction,'')),''),
    'inquiry','price_published'
  ) returning * into created;

  return query select created.id,created.status;
end;
$$;

revoke all on function public.create_certification_service_request_v1(
  uuid,uuid,text,text,text,text,text,text,text
) from public,anon;
grant execute on function public.create_certification_service_request_v1(
  uuid,uuid,text,text,text,text,text,text,text
) to authenticated;

insert into public.product_records(
  id,project_id,product_id,record_type,code,name,status,sort_order,payload
)
select
  gen_random_uuid(),
  p.project_id,p.id,'service_pricing',x.code,x.name,'published',x.sort_order,x.payload
from public.products p
cross join (values
  ('RCS-PRICE-01','Certification Readiness Assessment',1,
    jsonb_build_object('currency','ZAR','price_model','fixed_introductory','amount',12500,'display_price','ZAR 12,500','reference_usd',750,'scope_note','Includes readiness report, applicability profile, evidence plan and remediation register.')),
  ('RCS-PRICE-02','Resonance Certification Assessment',2,
    jsonb_build_object('currency','ZAR','price_model','starting_at','amount',58500,'display_price','From ZAR 58,500','reference_usd',3500,'scope_note','Final quote depends on scope, certification class count, evidence volume and assessment complexity.')),
  ('RCS-PRICE-03','Certification & Evidence Pack',3,
    jsonb_build_object('currency','ZAR','price_model','fixed_introductory','amount',12500,'display_price','ZAR 12,500','reference_usd',750,'scope_note','Standalone evidence-pack preparation; included in a full certification engagement where explicitly quoted.')),
  ('RCS-PRICE-04','Surveillance & Renewal',4,
    jsonb_build_object('currency','ZAR','price_model','starting_at','amount',25000,'display_price','From ZAR 25,000','reference_usd',1500,'scope_note','Final quote depends on prior certification scope, changes and evidence refresh requirements.')),
  ('RCS-PRICE-05','Standards Alignment Review',5,
    jsonb_build_object('currency','ZAR','price_model','starting_at','amount',21000,'display_price','From ZAR 21,000','reference_usd',1250,'scope_note','Alignment assessment only; does not create an external accreditation claim.'))
) as x(code,name,sort_order,payload)
where p.project_id='c2aa30c1-fc82-4524-8510-021ac0fef967'
  and p.slug='resonance-certification-assurance'
on conflict do nothing;

commit;
