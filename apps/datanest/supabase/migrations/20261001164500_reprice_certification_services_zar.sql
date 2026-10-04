begin;

update public.product_records
set payload = case code
  when 'RCS-PRICE-01' then jsonb_build_object(
    'currency','ZAR','price_model','fixed_introductory','amount',12500,'display_price','ZAR 12,500','reference_usd',750,
    'scope_note','Fixed introductory scope; bank-transfer settlement.','settlement_currency','ZAR','payment_method','bank_transfer',
    'bank_details','provided_on_invoice','payment_processor','business_bank_account',
    'foreign_currency_policy','foreign-currency requests are quoted separately; issued invoices are denominated in ZAR and settled through the business bank'
  )
  when 'RCS-PRICE-02' then jsonb_build_object(
    'currency','ZAR','price_model','starting_at','amount',58500,'display_price','From ZAR 58,500','reference_usd',3500,
    'scope_note','Final quote depends on scope, certification class count, evidence volume and assessment complexity.','settlement_currency','ZAR','payment_method','bank_transfer',
    'bank_details','provided_on_invoice','payment_processor','business_bank_account',
    'foreign_currency_policy','foreign-currency requests are quoted separately; issued invoices are denominated in ZAR and settled through the business bank'
  )
  when 'RCS-PRICE-03' then jsonb_build_object(
    'currency','ZAR','price_model','fixed_introductory','amount',12500,'display_price','ZAR 12,500','reference_usd',750,
    'scope_note','Standalone evidence-pack preparation; included in a full certification engagement where explicitly quoted.','settlement_currency','ZAR','payment_method','bank_transfer',
    'bank_details','provided_on_invoice','payment_processor','business_bank_account',
    'foreign_currency_policy','foreign-currency requests are quoted separately; issued invoices are denominated in ZAR and settled through the business bank'
  )
  when 'RCS-PRICE-04' then jsonb_build_object(
    'currency','ZAR','price_model','starting_at','amount',25000,'display_price','From ZAR 25,000','reference_usd',1500,
    'scope_note','Final quote depends on prior certification scope, changes and evidence refresh requirements.','settlement_currency','ZAR','payment_method','bank_transfer',
    'bank_details','provided_on_invoice','payment_processor','business_bank_account',
    'foreign_currency_policy','foreign-currency requests are quoted separately; issued invoices are denominated in ZAR and settled through the business bank'
  )
  when 'RCS-PRICE-05' then jsonb_build_object(
    'currency','ZAR','price_model','starting_at','amount',21000,'display_price','From ZAR 21,000','reference_usd',1250,
    'scope_note','Alignment assessment only; does not create an external accreditation claim.','settlement_currency','ZAR','payment_method','bank_transfer',
    'bank_details','provided_on_invoice','payment_processor','business_bank_account',
    'foreign_currency_policy','foreign-currency requests are quoted separately; issued invoices are denominated in ZAR and settled through the business bank'
  )
  else payload
end,
updated_at=now()
where project_id='c2aa30c1-fc82-4524-8510-021ac0fef967'
  and record_type='service_pricing'
  and code like 'RCS-PRICE-%';

commit;
