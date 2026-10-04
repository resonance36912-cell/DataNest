begin;

update public.products
set
  commercial_mode='published introductory pricing / paid checkout not yet connected',
  billing_enabled=false,
  metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'commercial_state','introductory_pricing_published',
    'payment_state','checkout_not_connected'
  ),
  updated_at=now()
where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967'
  and slug='resonance-certification-assurance';

update public.product_records
set payload=payload || jsonb_build_object(
  'billing_enabled',false,
  'commercial_mode','published introductory pricing / paid checkout not yet connected',
  'payment_state','checkout_not_connected'
),updated_at=now()
where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967'
  and product_id=(select id from public.products where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967' and slug='resonance-certification-assurance')
  and record_type='commercial_policy'
  and code='RCS-COMM-01';

commit;
