begin;

update public.products
set
  commercial_mode='published introductory pricing / bank transfer settlement',
  billing_enabled=false,
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'commercial_state','published_pricing_bank_transfer',
    'payment_method','bank_transfer',
    'settlement_currency','ZAR',
    'automated_checkout','disabled',
    'bank_details','provided_on_invoice',
    'pricing_currency','ZAR'
  ),
  updated_at=now()
where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967'
  and slug='resonance-certification-assurance';

update public.product_records
set payload=payload||jsonb_build_object(
  'settlement_currency','ZAR',
  'payment_method','bank_transfer',
  'automated_checkout','disabled'
)
where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967'
  and product_id=(select id from public.products where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967' and slug='resonance-certification-assurance')
  and record_type in ('service_offering','service_pricing');

create or replace function public.create_certification_service_request_v2(
  target_project uuid,
  target_request_key uuid,
  target_service_code text,
  target_certification_code text,
  target_target_name text,
  target_target_kind text,
  target_target_reference text,
  target_scope_summary text,
  target_jurisdiction text,
  target_requested_currency text default 'ZAR'
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
  if target_requested_currency not in ('ZAR','USD','EUR','GBP') then
    raise exception 'Unsupported quote currency.';
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
    return query select existing.id,existing.status;
    return;
  end if;

  insert into public.certification_service_requests(
    project_id,request_key,service_code,certification_code,requester_user_id,
    target_name,target_kind,target_reference,scope_summary,jurisdiction,
    status,commercial_status,requested_currency,payment_method,settlement_currency
  ) values (
    target_project,target_request_key,target_service_code,
    nullif(btrim(coalesce(target_certification_code,'')),''),
    caller,btrim(target_target_name),btrim(target_target_kind),
    nullif(btrim(coalesce(target_target_reference,'')),''),
    btrim(target_scope_summary),
    nullif(btrim(coalesce(target_jurisdiction,'')),''),
    'inquiry','price_published',target_requested_currency,'bank_transfer','ZAR'
  ) returning * into created;

  return query select created.id,created.status;
end;
$$;

revoke all on function public.create_certification_service_request_v2(uuid,uuid,text,text,text,text,text,text,text,text)
from public,anon;
grant execute on function public.create_certification_service_request_v2(uuid,uuid,text,text,text,text,text,text,text,text)
to authenticated;

commit;
