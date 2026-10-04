begin;

with target_project as (
  select id
  from public.projects
  where slug='resonance-datanest'
  order by created_at asc
  limit 1
),
upserted_product as (
  insert into public.products(
    id,project_id,slug,name,full_name,category,lifecycle_status,mission,
    operating_model,primary_runtime,commercial_mode,billing_enabled,as_of_date,
    source_payload,metadata,imported_at,created_at,updated_at
  )
  select
    '0c56a34e-1cc7-4d4d-bc30-1760c69cf9f1'::uuid,
    id,
    'legal-eagle',
    'Legal Eagle',
    'Resonance Assistance · Legal Eagle',
    'governed legal information and matter preparation',
    'live governed beta',
    'Help people understand, organize and prepare legal matters while keeping consequential legal decisions with humans.',
    'Job-scoped matter sessions with jurisdiction-first prompts, dual Angel''s Advocate / Devil''s Advocate reasoning, neutral synthesis and qualified-human escalation.',
    'DataNest · datanest-ai-chat · governed external provider route',
    'free promotion / no billing until pricing is established',
    false,
    date '2026-09-28',
    '{}'::jsonb,
    jsonb_build_object(
      'parent_platform','RESON8.DATANEST.LIFE',
      'execution_authority','DataNest',
      'product_mode','legal_eagle',
      'reuse_state','session_context',
      'automatic_project_learning',false,
      'dual_advocacy',true,
      'experience_path','?view=products#legal-eagle-title'
    ),
    now(),now(),now()
  from target_project
  on conflict(project_id,slug)
  do update set
    name=excluded.name,
    full_name=excluded.full_name,
    category=excluded.category,
    lifecycle_status=excluded.lifecycle_status,
    mission=excluded.mission,
    operating_model=excluded.operating_model,
    primary_runtime=excluded.primary_runtime,
    commercial_mode=excluded.commercial_mode,
    billing_enabled=excluded.billing_enabled,
    as_of_date=excluded.as_of_date,
    metadata=excluded.metadata,
    updated_at=now()
  returning id,project_id
)
delete from public.product_records pr
using upserted_product p
where pr.product_id=p.id
  and pr.code like 'LEGAL-EAGLE:%';

with product as (
  select id,project_id
  from public.products
  where slug='legal-eagle'
    and project_id=(select id from public.projects where slug='resonance-datanest' order by created_at asc limit 1)
)
insert into public.product_records(
  id,project_id,product_id,record_type,code,name,status,sort_order,payload,created_at,updated_at
)
select *
from (
  select
    'c20b0e4d-4f56-4de2-9df3-e6be00cb17a1'::uuid as id,
    p.project_id,p.id as product_id,
    'application'::text as record_type,
    'LEGAL-EAGLE:APP'::text as code,
    'Legal Eagle Matter Workspace'::text as name,
    'live'::text as status,
    10 as sort_order,
    jsonb_build_object(
      'description','Jurisdiction-first legal information and matter-preparation experience inside DataNest.',
      'location','DataNest Products · Legal Eagle',
      'route','?view=products#legal-eagle-title'
    ) as payload,
    now() as created_at,now() as updated_at
  from product p

  union all
  select
    'e0be9c11-5d5f-4900-ac27-2b3deab8ce86'::uuid,p.project_id,p.id,
    'component','LEGAL-EAGLE:DUAL','Dual Advocacy Reasoning','active',20,
    jsonb_build_object(
      'description','Returns Angel''s Advocate, Devil''s Advocate and a neutral synthesis for each substantive governed provider response.',
      'source','supabase/functions/_shared/dualAdvocacy.ts'
    ),now(),now()
  from product p

  union all
  select
    '132c4a0a-5459-4af8-bfe9-3e464c2bd730'::uuid,p.project_id,p.id,
    'component','LEGAL-EAGLE:SESSION','Matter Session Isolation','active',30,
    jsonb_build_object(
      'description','Legal matter context remains scoped to the selected Job and user session; it is not written into Development Command cumulative working memory.',
      'reuse_state','session_context'
    ),now(),now()
  from product p

  union all
  select
    '1fa52743-d8a0-4a97-9f80-f910630926f5'::uuid,p.project_id,p.id,
    'governance_control','LEGAL-EAGLE:JURISDICTION','Jurisdiction Required','active',40,
    jsonb_build_object(
      'rule','Substantive Legal Eagle assistance requires the user to provide the relevant jurisdiction before inference.'
    ),now(),now()
  from product p

  union all
  select
    '85ac4d6f-999a-450d-a2c3-c9e7ca89d623'::uuid,p.project_id,p.id,
    'governance_control','LEGAL-EAGLE:LEARNING','No Automatic Project Learning','active',50,
    jsonb_build_object(
      'rule','Legal Eagle uses session_context reuse and is excluded from automatic project-wide learning and certification promotion.'
    ),now(),now()
  from product p

  union all
  select
    'fb5bbf48-a918-4b9d-8752-b63ddd72426b'::uuid,p.project_id,p.id,
    'governance_control','LEGAL-EAGLE:HUMAN','Human Legal Authority','active',60,
    jsonb_build_object(
      'rule','Legal Eagle does not represent users, fabricate legal authority, promise outcomes or replace qualified local counsel for consequential decisions.'
    ),now(),now()
  from product p

  union all
  select
    '2f0103e4-b65d-47c6-89bd-62726fc505c9'::uuid,p.project_id,p.id,
    'source_authority','LEGAL-EAGLE:SOURCE','DataNest Source Authority','active',70,
    jsonb_build_object(
      'description','Product runtime and UI are governed from DataNest-Supository/DataNest.',
      'runtime_source','supabase/functions/datanest-ai-chat/index.ts',
      'ui_source','src/components/ProductsWorkspace.tsx'
    ),now(),now()
  from product p
) records;

commit;
