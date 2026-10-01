begin;

alter table public.certification_service_requests
  add column if not exists payment_method text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer')),
  add column if not exists settlement_currency text not null default 'ZAR'
    check (settlement_currency='ZAR'),
  add column if not exists requested_currency text not null default 'ZAR'
    check (requested_currency in ('ZAR','USD','EUR','GBP')),
  add column if not exists invoice_id uuid;

create table if not exists public.certification_service_invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id uuid not null references public.certification_service_requests(id) on delete restrict,
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date,
  invoice_currency text not null default 'ZAR' check (invoice_currency='ZAR'),
  invoice_amount numeric(14,2) not null check (invoice_amount>0),
  settlement_currency text not null default 'ZAR' check (settlement_currency='ZAR'),
  payment_method text not null default 'bank_transfer' check (payment_method='bank_transfer'),
  payment_reference text not null,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','payment_pending','paid','partially_paid','cancelled','refunded')),
  received_currency text check (received_currency is null or received_currency in ('ZAR','USD','EUR','GBP')),
  received_amount numeric(14,2) check (received_amount is null or received_amount>0),
  received_value_date date,
  bank_transaction_reference text,
  bank_details_reference text,
  tax_treatment text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,invoice_number),
  unique(project_id,payment_reference),
  unique(request_id),
  constraint certification_invoice_due_date check (due_date is null or due_date>=issue_date)
);

alter table public.certification_service_requests
  add constraint certification_request_invoice_fk
  foreign key (invoice_id) references public.certification_service_invoices(id) on delete set null;

create index if not exists certification_service_invoices_project_status_idx
  on public.certification_service_invoices(project_id,payment_status,issue_date desc);

create index if not exists certification_service_invoices_request_idx
  on public.certification_service_invoices(request_id);

alter table public.certification_service_invoices enable row level security;

revoke all on table public.certification_service_invoices from anon,authenticated;
grant select on table public.certification_service_invoices to authenticated;
grant select,insert,update,delete on table public.certification_service_invoices to service_role;

create policy certification_service_invoices_select
  on public.certification_service_invoices for select to authenticated
  using (
    private.has_project_role(project_id,array['owner','admin','operator'])
    or exists (
      select 1
      from public.certification_service_requests r
      where r.id=request_id
        and r.requester_user_id=auth.uid()
    )
  );

create or replace function private.certification_service_invoice_touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists certification_service_invoice_touch_updated_at on public.certification_service_invoices;
create trigger certification_service_invoice_touch_updated_at
before update on public.certification_service_invoices
for each row execute function private.certification_service_invoice_touch_updated_at();

create or replace function public.create_certification_service_invoice_v1(
  target_request_id uuid,
  target_invoice_currency text,
  target_invoice_amount numeric,
  target_due_date date default null,
  target_bank_details_reference text default null,
  target_tax_treatment text default null,
  target_notes text default null
) returns table(invoice_id uuid,invoice_number text,payment_reference text)
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  r public.certification_service_requests%rowtype;
  existing public.certification_service_invoices%rowtype;
  created_id uuid;
  created_number text;
  created_reference text;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;

  select * into r from public.certification_service_requests where id=target_request_id for update;
  if not found then raise exception 'Certification service request not found.'; end if;

  if not private.has_project_role(r.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required to issue an invoice.';
  end if;

  if target_invoice_currency is distinct from 'ZAR' then
    raise exception 'Certification invoices settle in ZAR. Foreign-currency quotes must be converted into the ZAR settlement amount before invoice issuance.';
  end if;

  if target_invoice_amount is null or target_invoice_amount<=0 then
    raise exception 'A positive invoice amount is required.';
  end if;

  select * into existing
  from public.certification_service_invoices
  where request_id=r.id;

  if found then
    return query select existing.id,existing.invoice_number,existing.payment_reference;
    return;
  end if;

  created_number:='RCS-INV-'||extract(year from now())::text||'-'||upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 10));
  created_reference:='RCS-'||upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 12));

  insert into public.certification_service_invoices(
    project_id,request_id,invoice_number,due_date,invoice_currency,invoice_amount,
    settlement_currency,payment_method,payment_reference,bank_details_reference,
    tax_treatment,notes,created_by
  ) values (
    r.project_id,r.id,created_number,target_due_date,target_invoice_currency,target_invoice_amount,
    'ZAR','bank_transfer',created_reference,
    nullif(btrim(coalesce(target_bank_details_reference,'')),''),
    nullif(btrim(coalesce(target_tax_treatment,'')),''),
    nullif(btrim(coalesce(target_notes,'')),''),caller
  ) returning id into created_id;

  update public.certification_service_requests
  set
    status='accepted',
    commercial_status='quote_sent',
    quoted_currency=target_invoice_currency,
    quoted_amount=target_invoice_amount,
    quote_reference=created_number,
    invoice_id=created_id,
    updated_at=now()
  where id=r.id;

  return query select created_id,created_number,created_reference;
end;
$$;

create or replace function public.record_certification_service_payment_v1(
  target_invoice_id uuid,
  target_received_currency text,
  target_received_amount numeric,
  target_value_date date,
  target_bank_transaction_reference text
) returns uuid
language plpgsql
security definer
set search_path=public,private,auth
as $$
declare
  caller uuid:=auth.uid();
  i public.certification_service_invoices%rowtype;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  select * into i from public.certification_service_invoices where id=target_invoice_id for update;
  if not found then raise exception 'Certification invoice not found.'; end if;
  if not private.has_project_role(i.project_id,array['owner','admin','operator']) then
    raise insufficient_privilege using message='Operator access is required to reconcile payment.';
  end if;
  if target_received_currency not in ('ZAR','USD','EUR','GBP') then
    raise exception 'Unsupported received currency.';
  end if;
  if target_received_amount is null or target_received_amount<=0 then
    raise exception 'A positive received amount is required.';
  end if;
  if nullif(btrim(coalesce(target_bank_transaction_reference,'')),'') is null then
    raise exception 'Bank transaction reference is required.';
  end if;

  update public.certification_service_invoices
  set
    payment_status=case
      when target_received_currency='ZAR' and target_received_amount>=i.invoice_amount then 'paid'
      when target_received_amount>0 then 'partially_paid'
      else 'payment_pending'
    end,
    received_currency=target_received_currency,
    received_amount=target_received_amount,
    received_value_date=target_value_date,
    bank_transaction_reference=btrim(target_bank_transaction_reference),
    updated_at=now()
  where id=i.id;

  return i.id;
end;
$$;

revoke all on function public.create_certification_service_invoice_v1(uuid,text,numeric,date,text,text,text) from public,anon;
grant execute on function public.create_certification_service_invoice_v1(uuid,text,numeric,date,text,text,text) to authenticated;

revoke all on function public.record_certification_service_payment_v1(uuid,text,numeric,date,text) from public,anon;
grant execute on function public.record_certification_service_payment_v1(uuid,text,numeric,date,text) to authenticated;

update public.product_records
set
  payload = payload || jsonb_build_object(
    'settlement_currency','ZAR',
    'payment_method','bank_transfer',
    'bank_details','provided_on_invoice',
    'payment_processor','business_bank_account',
    'foreign_currency_policy','quote_in_requested_currency; settle through the business bank at the bank-confirmed conversion/settlement rate'
  )
where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967'
  and record_type='service_pricing';

commit;
