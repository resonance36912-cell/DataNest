
create table if not exists public.stakeholder_profiles (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','removed')),
  origin text not null default 'invite' check (origin in ('owner','invite','promoted')),
  first_accepted_at timestamptz,
  legal_equity_percent numeric(7,4),
  legal_equity_status text not null default 'not_assigned' check (legal_equity_status in ('not_assigned','proposed','agreed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id,user_id)
);

create table if not exists public.stake_policies (
  project_id uuid primary key references public.projects(id) on delete cascade,
  stakeholder_pool_percent numeric(7,4),
  currency text not null default 'ZAR',
  formula_version text not null default 'contribution-pool-v1',
  weights jsonb not null default '{
    "human_input":2.0,
    "development_update":4.0,
    "test_run":3.0,
    "review":3.0,
    "dispatched_prompt":2.0,
    "ai_token_1k":0.5,
    "manual_ai_credit_unit":0.25,
    "manual_ai_credit_currency":0.10
  }'::jsonb,
  non_binding boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_provider_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','openai_compatible')),
  label text not null,
  api_base_url text not null,
  model text not null,
  secret_id uuid not null,
  status text not null default 'active' check (status in ('active','disabled','error')),
  is_default boolean not null default true,
  last_used_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,user_id,label)
);

create table if not exists public.contribution_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  contribution_type text not null check (contribution_type in (
    'human_input','development_update','test_run','review','dispatched_prompt',
    'ai_usage','manual_ai_credit'
  )),
  quantity numeric(18,6) not null default 1,
  unit text not null default 'event',
  points numeric(18,6) not null default 0,
  monetary_value_minor bigint,
  currency text,
  verified boolean not null default false,
  verification_source text,
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists contribution_ledger_source_unique
  on public.contribution_ledger(project_id,user_id,contribution_type,source_ref)
  where source_ref is not null;

create table if not exists public.product_surfaces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  url text not null,
  environment text not null default 'preview' check (environment in ('local','preview','staging','production')),
  status text not null default 'active' check (status in ('active','paused','archived')),
  description text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_test_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  surface_id uuid references public.product_surfaces(id) on delete cascade,
  title text not null,
  description text,
  expected_result text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_test_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  surface_id uuid references public.product_surfaces(id) on delete cascade,
  test_case_id uuid not null references public.product_test_cases(id) on delete cascade,
  tester_user_id uuid not null references auth.users(id),
  result text not null check (result in ('pass','fail','blocked')),
  notes text,
  evidence_url text,
  created_at timestamptz not null default now()
);

alter table public.stakeholder_profiles enable row level security;
alter table public.stake_policies enable row level security;
alter table public.ai_provider_connections enable row level security;
alter table public.contribution_ledger enable row level security;
alter table public.product_surfaces enable row level security;
alter table public.product_test_cases enable row level security;
alter table public.product_test_runs enable row level security;

create or replace function private.is_project_stakeholder(target_project uuid)returns boolean language sql stable security definer set search_path=private,public,auth as $$ select exists(select 1 from public.stakeholder_profiles sp where sp.project_id=target_project and sp.user_id=auth.uid()and sp.status='active');$$;revoke all on function private.is_project_stakeholder(uuid)from public;grant execute on function private.is_project_stakeholder(uuid)to authenticated,service_role;insert into public.stake_policies(project_id,updated_by)select p.id,pm.user_id from public.projects p join public.project_members pm on pm.project_id=p.id and pm.role='owner' and pm.status='active' where p.slug='resonance-datanest' on conflict(project_id)do nothing;insert into public.stakeholder_profiles(project_id,user_id,status,origin,first_accepted_at)select pm.project_id,pm.user_id,'active','owner',now()from public.project_members pm join public.projects p on p.id=pm.project_id where p.slug='resonance-datanest' and pm.role='owner' and pm.status='active' on conflict(project_id,user_id)do update set status='active',origin='owner',updated_at=now();create or replace function private.activate_stakeholder_from_collaborator()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status='accepted' and new.user_id is not null then
    insert into public.stakeholder_profiles(
      project_id,user_id,status,origin,first_accepted_at
    )
    values(
      new.project_id,new.user_id,'active','invite',coalesce(new.accepted_at,now())
    )
    on conflict (project_id,user_id) do update
    set status='active',
        first_accepted_at=coalesce(public.stakeholder_profiles.first_accepted_at,excluded.first_accepted_at),
        updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists activate_stakeholder_from_collaborator on public.job_collaborators;
create trigger activate_stakeholder_from_collaborator
after insert or update of status on public.job_collaborators
for each row execute function private.activate_stakeholder_from_collaborator();

insert into public.stakeholder_profiles(project_id,user_id,status,origin,first_accepted_at)
select distinct project_id,user_id,'active','invite',coalesce(accepted_at,now())
from public.job_collaborators
where status='accepted' and user_id is not null
on conflict (project_id,user_id) do nothing;

create or replace function private.contribution_weight(target_project uuid, weight_key text)
returns numeric
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce((sp.weights->>weight_key)::numeric,0)
  from public.stake_policies sp
  where sp.project_id=target_project;
$$;

create or replace function private.insert_contribution(
  target_project uuid,
  target_job uuid,
  target_user uuid,
  target_type text,
  target_quantity numeric,
  target_unit text,
  target_points numeric,
  target_verified boolean,
  target_source_ref text,
  target_metadata jsonb default '{}'::jsonb,
  target_monetary_value_minor bigint default null,
  target_currency text default null,
  target_verification_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare new_id uuid;
begin
  if target_user is null then return null; end if;

  insert into public.contribution_ledger(
    project_id,job_id,user_id,contribution_type,quantity,unit,points,
    monetary_value_minor,currency,verified,verification_source,source_ref,metadata
  )
  values(
    target_project,target_job,target_user,target_type,
    coalesce(target_quantity,1),coalesce(target_unit,'event'),coalesce(target_points,0),
    target_monetary_value_minor,target_currency,coalesce(target_verified,false),
    target_verification_source,target_source_ref,coalesce(target_metadata,'{}'::jsonb)
  )
  on conflict (project_id,user_id,contribution_type,source_ref)
  where source_ref is not null
  do update set
    quantity=excluded.quantity,
    unit=excluded.unit,
    points=greatest(public.contribution_ledger.points,excluded.points),
    monetary_value_minor=coalesce(excluded.monetary_value_minor,public.contribution_ledger.monetary_value_minor),
    currency=coalesce(excluded.currency,public.contribution_ledger.currency),
    verified=public.contribution_ledger.verified or excluded.verified,
    metadata=public.contribution_ledger.metadata || excluded.metadata
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function private.track_job_input_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare pts numeric;
begin
  if new.user_id is null or new.input_type='chat' then return new; end if;
  pts := private.contribution_weight(new.project_id,'human_input');
  perform private.insert_contribution(
    new.project_id,new.job_id,new.user_id,'human_input',1,new.input_type,
    pts,true,new.id::text,
    jsonb_build_object('input_type',new.input_type,'status',new.status),
    null,null,'system_event'
  );
  return new;
end;
$$;

drop trigger if exists track_job_input_contribution on public.job_inputs;
create trigger track_job_input_contribution
after insert on public.job_inputs
for each row execute function private.track_job_input_contribution();

create or replace function private.track_development_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare pts numeric;
begin
  if new.created_by is null then return new; end if;
  pts := private.contribution_weight(new.project_id,'development_update');
  perform private.insert_contribution(
    new.project_id,new.job_id,new.created_by,'development_update',1,'update',
    pts,true,new.id::text,
    jsonb_build_object('stage',new.stage,'progress',new.progress),
    null,null,'system_event'
  );
  return new;
end;
$$;

drop trigger if exists track_development_contribution on public.ai_development_updates;
create trigger track_development_contribution
after insert on public.ai_development_updates
for each row execute function private.track_development_contribution();

create or replace function private.track_dispatched_prompt_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare contributor uuid; pts numeric;
begin
  if new.status='dispatched' and old.status is distinct from new.status then
    contributor := coalesce(new.clicked_by,new.created_by_user);
    if contributor is not null then
      pts := private.contribution_weight(new.project_id,'dispatched_prompt');
      perform private.insert_contribution(
        new.project_id,new.job_id,contributor,'dispatched_prompt',1,'prompt',
        pts,true,new.id::text,
        jsonb_build_object('suggestion_type',new.suggestion_type),
        null,null,'system_event'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists track_dispatched_prompt_contribution on public.ai_prompt_queue;
create trigger track_dispatched_prompt_contribution
after update of status on public.ai_prompt_queue
for each row execute function private.track_dispatched_prompt_contribution();

create or replace function private.track_product_test_contribution()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare pts numeric;
begin
  pts := private.contribution_weight(new.project_id,'test_run');
  perform private.insert_contribution(
    new.project_id,new.job_id,new.tester_user_id,'test_run',1,'test',
    pts,true,new.id::text,
    jsonb_build_object('result',new.result,'test_case_id',new.test_case_id,'surface_id',new.surface_id),
    null,null,'system_event'
  );
  return new;
end;
$$;

drop trigger if exists track_product_test_contribution on public.product_test_runs;
create trigger track_product_test_contribution
after insert on public.product_test_runs
for each row execute function private.track_product_test_contribution();

create or replace function private.submit_external_ai_credit(
  target_project uuid,
  target_job uuid,
  target_provider text,
  target_quantity numeric,
  target_unit text,
  target_monetary_value_minor bigint default null,
  target_currency text default null,
  target_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare caller uuid := auth.uid(); new_id uuid;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not private.is_project_stakeholder(target_project) then
    raise insufficient_privilege using message='Stakeholder access is required.';
  end if;
  if target_quantity is null or target_quantity <= 0 then
    raise exception 'Credit quantity must be greater than zero.';
  end if;

  insert into public.contribution_ledger(
    project_id,job_id,user_id,contribution_type,quantity,unit,points,
    monetary_value_minor,currency,verified,verification_source,source_ref,metadata
  )
  values(
    target_project,target_job,caller,'manual_ai_credit',target_quantity,
    coalesce(nullif(btrim(target_unit),''),'credit'),0,
    target_monetary_value_minor,target_currency,false,'self_reported',
    gen_random_uuid()::text,
    jsonb_build_object('provider',target_provider,'note',target_note)
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.submit_external_ai_credit(
  target_project uuid,
  target_job uuid,
  target_provider text,
  target_quantity numeric,
  target_unit text,
  target_monetary_value_minor bigint default null,
  target_currency text default null,
  target_note text default null
)
returns uuid
language sql
set search_path = public, private
as $$
  select private.submit_external_ai_credit(
    target_project,target_job,target_provider,target_quantity,target_unit,
    target_monetary_value_minor,target_currency,target_note
  );
$$;

create or replace function private.verify_contribution(target_contribution uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  c public.contribution_ledger%rowtype;
  policy public.stake_policies%rowtype;
  calculated_points numeric;
begin
  select * into c from public.contribution_ledger where id=target_contribution;
  if not found then raise exception 'Contribution not found.'; end if;
  if not private.has_project_role(c.project_id,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  select * into policy from public.stake_policies where project_id=c.project_id;

  if c.contribution_type='manual_ai_credit' then
    if c.monetary_value_minor is not null and c.currency=policy.currency then
      calculated_points := (c.monetary_value_minor::numeric/100)
        * coalesce((policy.weights->>'manual_ai_credit_currency')::numeric,0);
    else
      calculated_points := c.quantity
        * coalesce((policy.weights->>'manual_ai_credit_unit')::numeric,0);
    end if;
  else
    calculated_points := c.points;
  end if;

  update public.contribution_ledger
  set verified=true,
      points=calculated_points,
      verification_source='owner_verified',
      metadata=metadata || jsonb_build_object('verified_by',caller,'verified_at',now())
  where id=target_contribution;

  return target_contribution;
end;
$$;

create or replace function public.verify_contribution(target_contribution uuid)
returns uuid
language sql
set search_path = public, private
as $$ select private.verify_contribution(target_contribution); $$;

create or replace function private.set_stakeholder_pool(
  target_project uuid,
  target_pool_percent numeric
)
returns numeric
language plpgsql
security definer
set search_path = public, private, auth
as $$
begin
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if target_pool_percent is not null and (target_pool_percent < 0 or target_pool_percent > 100) then
    raise exception 'Stakeholder pool must be between 0 and 100 percent.';
  end if;

  update public.stake_policies
  set stakeholder_pool_percent=target_pool_percent,
      updated_by=auth.uid(),
      updated_at=now()
  where project_id=target_project;

  return target_pool_percent;
end;
$$;

create or replace function public.set_stakeholder_pool(
  target_project uuid,
  target_pool_percent numeric
)
returns numeric
language sql
set search_path = public, private
as $$ select private.set_stakeholder_pool(target_project,target_pool_percent); $$;

create or replace function private.get_stakeholder_summary(target_project uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  pool numeric;
  result jsonb;
begin
  if caller is null then raise insufficient_privilege using message='Authentication is required.'; end if;
  if not (
    private.is_project_member(target_project)
    or private.is_project_stakeholder(target_project)
  ) then
    raise insufficient_privilege using message='Stakeholder access is required.';
  end if;

  select stakeholder_pool_percent into pool
  from public.stake_policies where project_id=target_project;

  with contributions as (
    select
      sp.user_id,
      sp.status,
      sp.origin,
      sp.first_accepted_at,
      au.email,
      coalesce(sum(cl.points) filter (where cl.verified),0) as verified_points,
      coalesce(sum(cl.points),0) as tracked_points,
      count(*) filter (where cl.contribution_type='human_input') as human_inputs,
      count(*) filter (where cl.contribution_type='development_update') as development_updates,
      count(*) filter (where cl.contribution_type='test_run') as tests_run,
      count(*) filter (where cl.contribution_type='dispatched_prompt') as prompts_dispatched,
      coalesce(sum(cl.quantity) filter (where cl.contribution_type='ai_usage' and cl.verified),0) as ai_usage_units,
      coalesce(sum(cl.quantity) filter (where cl.contribution_type='manual_ai_credit'),0) as declared_ai_credit_units,
      count(*) filter (where cl.contribution_type='manual_ai_credit' and not cl.verified) as unverified_credit_entries
    from public.stakeholder_profiles sp
    left join auth.users au on au.id=sp.user_id
    left join public.contribution_ledger cl
      on cl.project_id=sp.project_id and cl.user_id=sp.user_id
    where sp.project_id=target_project and sp.status='active'
    group by sp.user_id,sp.status,sp.origin,sp.first_accepted_at,au.email
  ),
  totals as (
    select greatest(sum(verified_points),0) as total_verified_points from contributions
  )
  select jsonb_build_object(
    'stakeholder_pool_percent',pool,
    'non_binding',true,
    'formula_version',(select formula_version from public.stake_policies where project_id=target_project),
    'stakeholders',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',c.user_id,
        'email',c.email,
        'status',c.status,
        'origin',c.origin,
        'first_accepted_at',c.first_accepted_at,
        'verified_points',round(c.verified_points,4),
        'tracked_points',round(c.tracked_points,4),
        'human_inputs',c.human_inputs,
        'development_updates',c.development_updates,
        'tests_run',c.tests_run,
        'prompts_dispatched',c.prompts_dispatched,
        'ai_usage_units',round(c.ai_usage_units,4),
        'declared_ai_credit_units',round(c.declared_ai_credit_units,4),
        'unverified_credit_entries',c.unverified_credit_entries,
        'contribution_share_percent',
          case when t.total_verified_points>0
            then round((c.verified_points/t.total_verified_points)*100,4)
            else 0 end,
        'suggested_product_stake_percent',
          case when t.total_verified_points>0 and pool is not null
            then round((c.verified_points/t.total_verified_points)*pool,4)
            else null end
      )
      order by c.verified_points desc,c.email
    ),'[]'::jsonb)
  )
  into result
  from contributions c cross join totals t;

  return result;
end;
$$;

create or replace function public.get_stakeholder_summary(target_project uuid)
returns jsonb
language sql
set search_path = public, private
as $$ select private.get_stakeholder_summary(target_project); $$;

create or replace function public.service_upsert_ai_provider_connection(
  target_project uuid,
  target_user uuid,
  target_provider text,
  target_label text,
  target_api_base_url text,
  target_model text,
  target_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  existing public.ai_provider_connections%rowtype;
  sid uuid;
  cid uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_provider not in ('openai','openai_compatible') then raise exception 'Unsupported provider.'; end if;
  if target_api_base_url !~ '^https://[^ ]+$' then raise exception 'AI provider URL must use HTTPS.'; end if;
  if nullif(btrim(target_secret),'') is null then raise exception 'Provider credential is required.'; end if;

  select * into existing
  from public.ai_provider_connections
  where project_id=target_project and user_id=target_user and label=target_label;

  if found then
    perform vault.update_secret(
      existing.secret_id,target_secret,
      'datanest-ai-'||existing.id::text,
      'Encrypted DataNest stakeholder AI provider credential',
      null
    );
    update public.ai_provider_connections
    set provider=target_provider,
        api_base_url=target_api_base_url,
        model=target_model,
        status='active',
        last_error=null,
        updated_at=now()
    where id=existing.id
    returning id into cid;
  else
    sid := vault.create_secret(
      target_secret,
      'datanest-ai-'||gen_random_uuid()::text,
      'Encrypted DataNest stakeholder AI provider credential',
      null
    );
    insert into public.ai_provider_connections(
      project_id,user_id,provider,label,api_base_url,model,secret_id,status,is_default
    )
    values(
      target_project,target_user,target_provider,target_label,target_api_base_url,target_model,sid,'active',true
    )
    returning id into cid;
  end if;

  update public.ai_provider_connections
  set is_default=(id=cid)
  where project_id=target_project and user_id=target_user;

  return (
    select jsonb_build_object(
      'id',id,'provider',provider,'label',label,'api_base_url',api_base_url,
      'model',model,'status',status,'is_default',is_default,'updated_at',updated_at
    )
    from public.ai_provider_connections where id=cid
  );
end;
$$;

create or replace function public.service_get_ai_provider_connection(
  target_project uuid,
  target_user uuid,
  target_connection uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  select jsonb_build_object(
    'id',apc.id,
    'provider',apc.provider,
    'label',apc.label,
    'api_base_url',apc.api_base_url,
    'model',apc.model,
    'secret',vs.decrypted_secret
  )
  into result
  from public.ai_provider_connections apc
  join vault.decrypted_secrets vs on vs.id=apc.secret_id
  where apc.project_id=target_project
    and apc.user_id=target_user
    and apc.status='active'
    and (target_connection is null or apc.id=target_connection)
  order by (case when target_connection is not null and apc.id=target_connection then 0
                 when apc.is_default then 1 else 2 end),apc.updated_at desc
  limit 1;

  return result;
end;
$$;

create or replace function public.service_record_ai_usage(
  target_project uuid,
  target_job uuid,
  target_user uuid,
  target_connection uuid,
  target_provider text,
  target_model text,
  input_tokens bigint,
  output_tokens bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  total_tokens bigint := greatest(coalesce(input_tokens,0)+coalesce(output_tokens,0),0);
  qty numeric := total_tokens::numeric/1000;
  pts numeric;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  pts := qty * private.contribution_weight(target_project,'ai_token_1k');

  return private.insert_contribution(
    target_project,target_job,target_user,'ai_usage',qty,'1k_tokens',
    pts,true,gen_random_uuid()::text,
    jsonb_build_object(
      'provider',target_provider,'model',target_model,'connection_id',target_connection,
      'input_tokens',input_tokens,'output_tokens',output_tokens,'total_tokens',total_tokens
    ),
    null,null,'provider_reported_usage'
  );
end;
$$;

create or replace function public.service_disable_ai_provider_connection(
  target_project uuid,
  target_user uuid,
  target_connection uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  update public.ai_provider_connections
  set status='disabled',is_default=false,updated_at=now()
  where id=target_connection and project_id=target_project and user_id=target_user;
  return target_connection;
end;
$$;

revoke all on function public.service_upsert_ai_provider_connection(uuid,uuid,text,text,text,text,text) from public,authenticated,anon;
revoke all on function public.service_get_ai_provider_connection(uuid,uuid,uuid) from public,authenticated,anon;
revoke all on function public.service_record_ai_usage(uuid,uuid,uuid,uuid,text,text,bigint,bigint) from public,authenticated,anon;
revoke all on function public.service_disable_ai_provider_connection(uuid,uuid,uuid) from public,authenticated,anon;
grant execute on function public.service_upsert_ai_provider_connection(uuid,uuid,text,text,text,text,text) to service_role;
grant execute on function public.service_get_ai_provider_connection(uuid,uuid,uuid) to service_role;
grant execute on function public.service_record_ai_usage(uuid,uuid,uuid,uuid,text,text,bigint,bigint) to service_role;
grant execute on function public.service_disable_ai_provider_connection(uuid,uuid,uuid) to service_role;

create policy stakeholder_profiles_select on public.stakeholder_profiles
for select to authenticated
using (
  private.is_project_stakeholder(project_id)
  or private.has_project_role(project_id,array['owner','admin'])
);

create policy stake_policies_select on public.stake_policies
for select to authenticated
using (
  private.is_project_stakeholder(project_id)
  or private.is_project_member(project_id)
);

create policy ai_provider_connections_select on public.ai_provider_connections
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

create policy contribution_ledger_select on public.contribution_ledger
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

create policy product_surfaces_select on public.product_surfaces
for select to authenticated
using (
  private.is_project_stakeholder(project_id)
  or private.is_project_member(project_id)
);

create policy product_surfaces_insert on public.product_surfaces
for insert to authenticated
with check (private.has_project_role(project_id,array['owner','admin','operator']));

create policy product_surfaces_update on public.product_surfaces
for update to authenticated
using (private.has_project_role(project_id,array['owner','admin','operator']))
with check (private.has_project_role(project_id,array['owner','admin','operator']));

create policy product_test_cases_select on public.product_test_cases
for select to authenticated
using (
  private.is_project_stakeholder(project_id)
  or private.is_project_member(project_id)
);

create policy product_test_cases_insert on public.product_test_cases
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and (
    private.is_project_stakeholder(project_id)
    or private.is_project_member(project_id)
  )
);

create policy product_test_cases_update on public.product_test_cases
for update to authenticated
using (
  created_by=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin','operator'])
)
with check (
  created_by=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin','operator'])
);

create policy product_test_runs_select on public.product_test_runs
for select to authenticated
using (
  private.is_project_stakeholder(project_id)
  or private.is_project_member(project_id)
);

create policy product_test_runs_insert on public.product_test_runs
for insert to authenticated
with check (
  tester_user_id=(select auth.uid())
  and (
    private.is_project_stakeholder(project_id)
    or private.is_project_member(project_id)
  )
);

grant select on public.stakeholder_profiles,public.stake_policies,public.ai_provider_connections,
  public.contribution_ledger,public.product_surfaces,public.product_test_cases,public.product_test_runs
to authenticated;

grant insert,update on public.product_surfaces to authenticated;
grant insert,update on public.product_test_cases to authenticated;
grant insert on public.product_test_runs to authenticated;

grant execute on function public.submit_external_ai_credit(uuid,uuid,text,numeric,text,bigint,text,text) to authenticated;
grant execute on function public.verify_contribution(uuid) to authenticated;
grant execute on function public.set_stakeholder_pool(uuid,numeric) to authenticated;
grant execute on function public.get_stakeholder_summary(uuid) to authenticated;

alter policy projects_select on public.projects
using (
  private.is_project_member(id)
  or private.is_project_stakeholder(id)
  or exists (
    select 1 from public.job_collaborators jc
    where jc.project_id=id and jc.user_id=(select auth.uid()) and jc.status='accepted'
  )
);

create index if not exists stakeholder_profiles_user_idx on public.stakeholder_profiles(user_id);
create index if not exists contribution_ledger_project_user_idx on public.contribution_ledger(project_id,user_id,occurred_at desc);
create index if not exists ai_provider_connections_user_idx on public.ai_provider_connections(project_id,user_id,status);
create index if not exists product_surfaces_project_idx on public.product_surfaces(project_id,status);
create index if not exists product_test_cases_project_idx on public.product_test_cases(project_id,status);
create index if not exists product_test_runs_project_created_idx on public.product_test_runs(project_id,created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='product_surfaces'
  ) then alter publication supabase_realtime add table public.product_surfaces; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='product_test_cases'
  ) then alter publication supabase_realtime add table public.product_test_cases; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='product_test_runs'
  ) then alter publication supabase_realtime add table public.product_test_runs; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='contribution_ledger'
  ) then alter publication supabase_realtime add table public.contribution_ledger; end if;
end $$;
