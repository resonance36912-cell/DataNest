begin;

do $$
declare
  ronsas_product public.products%rowtype;
  ronsas_item_id uuid;
  owner_id uuid;
  owner_actor text;
  app record;
  existing_item public.portfolio_items%rowtype;
  app_item_id uuid;
  base_slug text;
  chosen_slug text;
  suffix text;
begin
  select p.* into ronsas_product
  from public.products p
  join public.projects pr on pr.id=p.project_id
  where p.slug='ronsas'
    and pr.slug='resonance-datanest'
  order by p.created_at
  limit 1;

  if not found then
    if exists(
      select 1
      from public.products p
      join public.projects pr on pr.id=p.project_id
      where pr.slug='resonance-datanest'
    ) then
      raise exception 'RONSAS governed product was not found for the Resonance DataNest project portfolio baseline backfill.';
    end if;
    return;
  end if;

  select pm.user_id,coalesce(u.email,pm.user_id::text)
  into owner_id,owner_actor
  from public.project_members pm
  left join auth.users u on u.id=pm.user_id
  where pm.project_id=ronsas_product.project_id
    and pm.role='owner'
    and pm.status='active'
  order by pm.user_id
  limit 1;

  if owner_id is null then
    raise exception 'RONSAS portfolio baseline requires an active project owner.';
  end if;

  select * into existing_item
  from public.portfolio_items
  where project_id=ronsas_product.project_id and slug='ronsas'
  for update;

  if found then
    if existing_item.linked_product_id is distinct from ronsas_product.id
       or existing_item.item_kind<>'governed_product' then
      raise exception 'Existing ronsas Portfolio Item conflicts with governed product authority.';
    end if;
    ronsas_item_id := existing_item.id;
  else
    insert into public.portfolio_items(
      project_id,slug,name,item_kind,review_state,current_lifecycle,linked_product_id,
      source_authority,source_reference,metadata,created_by
    )
    values(
      ronsas_product.project_id,'ronsas',ronsas_product.name,'governed_product','classified','active',
      ronsas_product.id,'products',ronsas_product.id::text,
      jsonb_build_object(
        'baseline','phase_b_20260927',
        'historical_product_slug',ronsas_product.slug
      ),
      owner_id
    )
    returning id into ronsas_item_id;
  end if;

  if exists(
    select 1 from public.portfolio_classifications c
    where c.portfolio_item_id=ronsas_item_id and c.status='active'
      and c.classification<>'independent_datanest_product'
  ) then
    raise exception 'Existing RONSAS Portfolio Item has a conflicting active classification.';
  end if;

  if not exists(
    select 1 from public.portfolio_classifications c
    where c.portfolio_item_id=ronsas_item_id
      and c.status='active'
      and c.classification='independent_datanest_product'
  ) then
    insert into public.portfolio_classifications(
      project_id,portfolio_item_id,classification,target_product_id,status,
      rationale,evidence_reference,proposed_by,approved_by,created_at,approved_at
    )
    values(
      ronsas_product.project_id,ronsas_item_id,'independent_datanest_product',null,'active',
      'Baseline governed-product classification from the approved DataNest > Products > RONSAS hierarchy.',
      'phase-b-baseline:ronsas',owner_id,owner_id,now(),now()
    );
  end if;

  if not exists(
    select 1 from public.portfolio_lifecycle_events e
    where e.portfolio_item_id=ronsas_item_id and e.status='approved' and e.to_state='active'
  ) then
    insert into public.portfolio_lifecycle_events(
      project_id,portfolio_item_id,from_state,to_state,status,reason,evidence_reference,
      proposed_by,approved_by,created_at,approved_at
    )
    values(
      ronsas_product.project_id,ronsas_item_id,null,'active','approved',
      'Baseline lifecycle for the existing governed RONSAS product.',
      'phase-b-baseline:ronsas',owner_id,owner_id,now(),now()
    );
  end if;

  if not exists(
    select 1 from public.events e
    where e.project_id=ronsas_product.project_id
      and e.event_type='PORTFOLIO_BASELINE_RONSAS_BACKFILLED'
      and e.payload->>'portfolio_item_id'=ronsas_item_id::text
  ) then
    insert into public.events(project_id,event_type,actor,payload)
    values(
      ronsas_product.project_id,'PORTFOLIO_BASELINE_RONSAS_BACKFILLED',owner_actor,
      jsonb_build_object(
        'portfolio_item_id',ronsas_item_id,
        'product_id',ronsas_product.id,
        'classification','independent_datanest_product',
        'lifecycle','active',
        'billing_state_preserved',true
      )
    );
  end if;

  for app in
    select pr.*
    from public.product_records pr
    where pr.product_id=ronsas_product.id
      and pr.project_id=ronsas_product.project_id
      and pr.record_type='application'
    order by pr.sort_order,pr.name,pr.id
  loop
    select * into existing_item
    from public.portfolio_items
    where project_id=ronsas_product.project_id
      and source_authority='product_records'
      and source_reference=app.id::text
    for update;

    if found then
      app_item_id := existing_item.id;
    else
      base_slug := lower(
        regexp_replace(
          regexp_replace(btrim(coalesce(app.name,'application')),'[^a-zA-Z0-9]+','-','g'),
          '(^-|-$)','',
          'g'
        )
      );
      if nullif(base_slug,'') is null then
        base_slug := 'application-'||substr(replace(app.id::text,'-',''),1,8);
      end if;

      chosen_slug := base_slug;
      if exists(
        select 1 from public.portfolio_items i
        where i.project_id=ronsas_product.project_id and i.slug=chosen_slug
      ) then
        suffix := substr(replace(app.id::text,'-',''),1,8);
        chosen_slug := base_slug||'-'||suffix;
        if exists(
          select 1 from public.portfolio_items i
          where i.project_id=ronsas_product.project_id and i.slug=chosen_slug
        ) then
          raise exception 'Historical application slug collision requires review for source record %.',app.id;
        end if;
      end if;

      insert into public.portfolio_items(
        project_id,slug,name,item_kind,review_state,current_lifecycle,linked_product_id,
        source_authority,source_reference,metadata,created_by
      )
      values(
        ronsas_product.project_id,chosen_slug,coalesce(app.name,'Unnamed application'),
        'application','pending_review',null,null,
        'product_records',app.id::text,
        jsonb_build_object(
          'historical_catalog',
          jsonb_build_object(
            'parent_product_id',ronsas_product.id,
            'record_id',app.id,
            'code',app.code,
            'status',app.status,
            'ownership_claim',app.payload->>'ownership',
            'payload',app.payload
          ),
          'architectural_ownership','pending_review'
        ),
        owner_id
      )
      on conflict (project_id,source_authority,source_reference)
      where source_reference is not null and source_authority is not null
      do update set
        name=excluded.name,
        metadata=public.portfolio_items.metadata || excluded.metadata,
        updated_at=now()
      returning id into app_item_id;
    end if;

    if not exists(
      select 1 from public.events e
      where e.project_id=ronsas_product.project_id
        and e.event_type='PORTFOLIO_BASELINE_APPLICATION_REGISTERED'
        and e.payload->>'source_record_id'=app.id::text
    ) then
      insert into public.events(project_id,event_type,actor,payload)
      values(
        ronsas_product.project_id,'PORTFOLIO_BASELINE_APPLICATION_REGISTERED',owner_actor,
        jsonb_build_object(
          'portfolio_item_id',app_item_id,
          'source_record_id',app.id,
          'historical_parent_product_id',ronsas_product.id,
          'historical_ownership_claim',app.payload->>'ownership',
          'review_state','pending_review',
          'active_classification',null
        )
      );
    end if;
  end loop;
end;
$$;

commit;
