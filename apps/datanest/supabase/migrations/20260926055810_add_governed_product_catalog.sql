create table public.products (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null,
  name text not null,
  full_name text,
  category text,
  lifecycle_status text,
  mission text,
  operating_model text,
  primary_runtime text,
  commercial_mode text,
  billing_enabled boolean not null default false,
  as_of_date date,
  import_export_id uuid,
  source_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_slug_nonempty check (length(btrim(slug)) between 1 and 120),
  constraint products_name_nonempty check (length(btrim(name)) between 1 and 180),
  constraint products_project_slug_key unique (project_id, slug)
);
create index products_project_status_idx on public.products(project_id, lifecycle_status);
create table public.product_records (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  record_type text not null,
  code text,
  name text,
  status text,
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_records_type_nonempty check (length(btrim(record_type)) between 1 and 80)
);
create index product_records_product_type_idx on public.product_records(product_id, record_type, sort_order);
create index product_records_project_type_idx on public.product_records(project_id, record_type);
alter table public.products enable row level security;
alter table public.product_records enable row level security;
grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.product_records to authenticated;
grant select, insert, update, delete on table public.products to service_role;
grant select, insert, update, delete on table public.product_records to service_role;
create policy products_select on public.products for select to authenticated
  using (private.is_project_stakeholder(project_id) or private.is_project_member(project_id));
create policy products_insert on public.products for insert to authenticated
  with check (private.has_project_role(project_id, array['owner','admin','operator']::text[]));
create policy products_update on public.products for update to authenticated
  using (private.has_project_role(project_id, array['owner','admin','operator']::text[]))
  with check (private.has_project_role(project_id, array['owner','admin','operator']::text[]));
create policy products_delete on public.products for delete to authenticated
  using (private.has_project_role(project_id, array['owner','admin']::text[]));
create policy product_records_select on public.product_records for select to authenticated
  using (private.is_project_stakeholder(project_id) or private.is_project_member(project_id));
create policy product_records_insert on public.product_records for insert to authenticated
  with check (
    private.has_project_role(project_id, array['owner','admin','operator']::text[])
    and exists (select 1 from public.products p where p.id=product_id and p.project_id=product_records.project_id)
  );
create policy product_records_update on public.product_records for update to authenticated
  using (private.has_project_role(project_id, array['owner','admin','operator']::text[]))
  with check (
    private.has_project_role(project_id, array['owner','admin','operator']::text[])
    and exists (select 1 from public.products p where p.id=product_id and p.project_id=product_records.project_id)
  );
create policy product_records_delete on public.product_records for delete to authenticated
  using (private.has_project_role(project_id, array['owner','admin']::text[]));
