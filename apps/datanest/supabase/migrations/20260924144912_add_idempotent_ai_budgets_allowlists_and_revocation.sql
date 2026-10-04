
alter table public.ai_provider_connections
  add column if not exists endpoint_host text,
  add column if not exists last_rotated_at timestamptz;

update public.ai_provider_connections
set endpoint_host=lower(split_part(split_part(api_base_url,'://',2),'/',1))
where endpoint_host is null;

create table if not exists public.ai_provider_domain_allowlist (
  project_id uuid not null references public.projects(id) on delete cascade,
  hostname text not null,
  active boolean not null default true,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_id,hostname)
);

create table if not exists public.ai_budget_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  daily_request_limit integer not null default 100 check (daily_request_limit >= 0),
  monthly_token_limit bigint not null default 2000000 check (monthly_token_limit >= 0),
  monthly_cost_limit_minor bigint,
  max_output_tokens integer not null default 4000 check (max_output_tokens between 1 and 200000),
  concurrency_limit integer not null default 2 check (concurrency_limit between 1 and 100),
  allowed_providers text[] not null default array['openai','openai_compatible'],
  allowed_models text[] not null default array['*'],
  currency text not null default 'ZAR',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_budget_project_default_idx
  on public.ai_budget_policies(project_id)
  where user_id is null;

create unique index if not exists ai_budget_project_user_idx
  on public.ai_budget_policies(project_id,user_id)
  where user_id is not null;

create table if not exists public.ai_usage_requests (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.ai_provider_connections(id) on delete set null,
  provider text,
  model text,
  status text not null default 'pending'
    check (status in ('pending','succeeded','failed','unknown','embedded','denied')),
  provider_called boolean not null default false,
  user_message_id uuid references public.ai_messages(id) on delete set null,
  assistant_message_id uuid references public.ai_messages(id) on delete set null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  estimated_cost_minor bigint,
  provider_reported_cost_minor bigint,
  reconciled_cost_minor bigint,
  currency text,
  error_category text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,client_request_id)
);

create index if not exists ai_usage_requests_project_user_time_idx
  on public.ai_usage_requests(project_id,user_id,created_at desc);
create index if not exists ai_usage_requests_status_idx
  on public.ai_usage_requests(project_id,status,created_at desc);
create index if not exists ai_usage_requests_connection_idx
  on public.ai_usage_requests(connection_id,created_at desc);

alter table public.ai_provider_domain_allowlist enable row level security;
alter table public.ai_budget_policies enable row level security;
alter table public.ai_usage_requests enable row level security;

create policy ai_provider_domain_allowlist_select on public.ai_provider_domain_allowlist
for select to authenticated
using (private.has_project_access(project_id));

create policy ai_budget_policies_select on public.ai_budget_policies
for select to authenticated
using (
  private.has_project_access(project_id)
  and (user_id is null or user_id=(select auth.uid()) or private.has_project_role(project_id,array['owner','admin']))
);

create policy ai_usage_requests_select on public.ai_usage_requests
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_project_role(project_id,array['owner','admin'])
);

grant select on public.ai_provider_domain_allowlist,public.ai_budget_policies,public.ai_usage_requests
to authenticated;

insert into public.ai_provider_domain_allowlist(project_id,hostname,active,added_by)
select sp.project_id,'api.openai.com',true,sp.updated_by
from public.stake_policies sp
on conflict (project_id,hostname) do update set active=true,updated_at=now();

insert into public.ai_budget_policies(project_id,user_id,updated_by)
select sp.project_id,null,sp.updated_by
from public.stake_policies sp
where not exists (
  select 1 from public.ai_budget_policies bp
  where bp.project_id=sp.project_id and bp.user_id is null
);

create or replace function private.begin_ai_chat_request(
  target_job uuid,
  target_client_request_id uuid,
  message_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  j public.jobs%rowtype;
  existing public.ai_usage_requests%rowtype;
  request_row public.ai_usage_requests%rowtype;
  message_result jsonb;
  assistant_text text;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if target_client_request_id is null then
    raise exception 'client_request_id is required.';
  end if;

  select * into j from public.jobs where id=target_job;
  if not found then raise exception 'Job not found.'; end if;

  if not (
    private.is_project_member(j.project_id)
    or private.is_job_collaborator(j.id)
  ) then
    raise insufficient_privilege using message='Job collaboration access is required.';
  end if;

  select * into existing
  from public.ai_usage_requests
  where user_id=caller and client_request_id=target_client_request_id;

  if found then
    if existing.assistant_message_id is not null then
      select content into assistant_text
      from public.ai_messages where id=existing.assistant_message_id;
    end if;

    return jsonb_build_object(
      'id',existing.id,
      'is_new',false,
      'status',existing.status,
      'provider_called',existing.provider_called,
      'user_message_id',existing.user_message_id,
      'assistant_message_id',existing.assistant_message_id,
      'assistant',assistant_text,
      'error_category',existing.error_category,
      'error_message',existing.error_message
    );
  end if;

  insert into public.ai_usage_requests(
    client_request_id,project_id,job_id,user_id,status,provider_called,metadata
  )
  values(
    target_client_request_id,j.project_id,j.id,caller,'pending',false,
    jsonb_build_object('message_sha256',encode(digest(btrim(message_content),'sha256'),'hex'))
  )
  returning * into request_row;

  message_result := private.post_job_ai_message(target_job,message_content);

  update public.ai_usage_requests
  set user_message_id=(message_result->>'user_message_id')::uuid
  where id=request_row.id;

  return jsonb_build_object(
    'id',request_row.id,
    'is_new',true,
    'status','pending',
    'provider_called',false,
    'user_message_id',message_result->>'user_message_id'
  );
end;
$$;

create or replace function public.begin_ai_chat_request(
  target_job uuid,
  target_client_request_id uuid,
  message_content text
)
returns jsonb
language sql
set search_path = public, private
as $$ select private.begin_ai_chat_request(target_job,target_client_request_id,message_content); $$;

grant execute on function public.begin_ai_chat_request(uuid,uuid,text) to authenticated;

revoke execute on function public.post_job_ai_message(uuid,text) from authenticated;
revoke execute on function public.record_ai_assistant_response(uuid,text,text,jsonb) from authenticated;

create or replace function private.complete_ai_chat_request(
  target_request uuid,
  assistant_content text,
  provider_mode text,
  generated_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  caller uuid := auth.uid();
  req public.ai_usage_requests%rowtype;
  result jsonb;
  assistant_id uuid;
  final_status text;
begin
  select * into req from public.ai_usage_requests where id=target_request;
  if not found then raise exception 'AI request not found.'; end if;

  if req.user_id <> caller then
    raise insufficient_privilege using message='AI request ownership is required.';
  end if;

  if req.assistant_message_id is not null then
    return jsonb_build_object(
      'request_id',req.id,
      'assistant_message_id',req.assistant_message_id,
      'status',req.status,
      'idempotent',true
    );
  end if;

  result := private.record_ai_assistant_response(
    req.job_id,assistant_content,provider_mode,generated_suggestions
  );
  assistant_id := (result->>'ai_message_id')::uuid;

  final_status := case
    when provider_mode='external' then
      case when req.status='succeeded' then 'succeeded' else req.status end
    when req.provider_called and req.status in ('unknown','failed','denied') then req.status
    else 'embedded'
  end;

  update public.ai_usage_requests
  set assistant_message_id=assistant_id,
      status=final_status,
      completed_at=case when final_status in ('succeeded','embedded','failed','denied') then now() else completed_at end
  where id=req.id;

  return result || jsonb_build_object(
    'request_id',req.id,
    'request_status',final_status,
    'idempotent',false
  );
end;
$$;

create or replace function public.complete_ai_chat_request(
  target_request uuid,
  assistant_content text,
  provider_mode text,
  generated_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language sql
set search_path = public, private
as $$ select private.complete_ai_chat_request(target_request,assistant_content,provider_mode,generated_suggestions); $$;

grant execute on function public.complete_ai_chat_request(uuid,text,text,jsonb) to authenticated;

create or replace function private.resolve_ai_budget(
  target_project uuid,
  target_user uuid
)
returns public.ai_budget_policies
language sql
stable
security definer
set search_path = public, private
as $$
  select bp
  from public.ai_budget_policies bp
  where bp.project_id=target_project
    and (bp.user_id=target_user or bp.user_id is null)
  order by (bp.user_id is not null) desc
  limit 1;
$$;

create or replace function public.service_authorize_ai_request(
  target_request uuid,
  target_connection uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  req public.ai_usage_requests%rowtype;
  conn public.ai_provider_connections%rowtype;
  budget public.ai_budget_policies%rowtype;
  daily_count bigint;
  monthly_tokens bigint;
  monthly_cost bigint;
  concurrent_count bigint;
  model_allowed boolean;
  host_allowed boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  select * into req from public.ai_usage_requests where id=target_request for update;
  if not found then raise exception 'AI request not found.'; end if;

  if req.status <> 'pending' or req.provider_called then
    return jsonb_build_object(
      'allowed',false,
      'reason','request_already_started',
      'status',req.status,
      'provider_called',req.provider_called
    );
  end if;

  select * into conn
  from public.ai_provider_connections
  where id=target_connection
    and project_id=req.project_id
    and user_id=req.user_id
    and status='active';
  if not found then
    return jsonb_build_object('allowed',false,'reason','connection_unavailable');
  end if;

  if not exists (
    select 1 from public.stakeholder_profiles sp
    where sp.project_id=req.project_id and sp.user_id=req.user_id and sp.status='active'
  ) and not exists (
    select 1 from public.project_members pm
    where pm.project_id=req.project_id and pm.user_id=req.user_id and pm.status='active'
  ) then
    return jsonb_build_object('allowed',false,'reason','stakeholder_inactive');
  end if;

  host_allowed := (
    (conn.provider='openai' and conn.endpoint_host='api.openai.com')
    or exists (
      select 1 from public.ai_provider_domain_allowlist al
      where al.project_id=req.project_id
        and al.hostname=conn.endpoint_host
        and al.active=true
    )
  );
  if not host_allowed then
    return jsonb_build_object('allowed',false,'reason','provider_host_not_allowed');
  end if;

  select * into budget from private.resolve_ai_budget(req.project_id,req.user_id);
  if not found or not budget.enabled then
    return jsonb_build_object('allowed',false,'reason','budget_disabled');
  end if;

  if not (conn.provider=any(budget.allowed_providers)) then
    return jsonb_build_object('allowed',false,'reason','provider_not_allowed');
  end if;

  model_allowed := ('*'=any(budget.allowed_models) or conn.model=any(budget.allowed_models));
  if not model_allowed then
    return jsonb_build_object('allowed',false,'reason','model_not_allowed');
  end if;

  select count(*) into daily_count
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.provider_called=true
    and r.created_at >= date_trunc('day',now());

  if daily_count >= budget.daily_request_limit then
    update public.ai_usage_requests
    set status='denied',error_category='daily_request_limit',completed_at=now()
    where id=req.id;
    return jsonb_build_object('allowed',false,'reason','daily_request_limit');
  end if;

  select count(*) into concurrent_count
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.provider_called=true
    and r.status='pending';

  if concurrent_count >= budget.concurrency_limit then
    update public.ai_usage_requests
    set status='denied',error_category='concurrency_limit',completed_at=now()
    where id=req.id;
    return jsonb_build_object('allowed',false,'reason','concurrency_limit');
  end if;

  select coalesce(sum(total_tokens),0) into monthly_tokens
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.created_at >= date_trunc('month',now())
    and r.status in ('succeeded','unknown');

  if monthly_tokens >= budget.monthly_token_limit then
    update public.ai_usage_requests
    set status='denied',error_category='monthly_token_limit',completed_at=now()
    where id=req.id;
    return jsonb_build_object('allowed',false,'reason','monthly_token_limit');
  end if;

  select coalesce(sum(coalesce(reconciled_cost_minor,provider_reported_cost_minor,estimated_cost_minor,0)),0)
  into monthly_cost
  from public.ai_usage_requests r
  where r.project_id=req.project_id
    and r.user_id=req.user_id
    and r.created_at >= date_trunc('month',now())
    and r.status in ('succeeded','unknown');

  if budget.monthly_cost_limit_minor is not null
     and monthly_cost >= budget.monthly_cost_limit_minor then
    update public.ai_usage_requests
    set status='denied',error_category='monthly_cost_limit',completed_at=now()
    where id=req.id;
    return jsonb_build_object('allowed',false,'reason','monthly_cost_limit');
  end if;

  update public.ai_usage_requests
  set connection_id=conn.id,
      provider=conn.provider,
      model=conn.model,
      currency=budget.currency,
      provider_called=true,
      started_at=now(),
      metadata=metadata || jsonb_build_object(
        'budget_policy_id',budget.id,
        'max_output_tokens',budget.max_output_tokens,
        'authorized_at',now()
      )
  where id=req.id;

  return jsonb_build_object(
    'allowed',true,
    'request_id',req.id,
    'connection_id',conn.id,
    'provider',conn.provider,
    'model',conn.model,
    'max_output_tokens',budget.max_output_tokens,
    'currency',budget.currency
  );
end;
$$;

create or replace function public.service_finish_ai_request(
  target_request uuid,
  target_status text,
  input_tokens bigint default 0,
  output_tokens bigint default 0,
  estimated_cost_minor bigint default null,
  provider_reported_cost_minor bigint default null,
  reconciled_cost_minor bigint default null,
  target_error_category text default null,
  target_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  req public.ai_usage_requests%rowtype;
  total bigint;
  qty numeric;
  proposed numeric;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if target_status not in ('succeeded','failed','unknown','denied') then
    raise exception 'Invalid AI request terminal status.';
  end if;

  select * into req from public.ai_usage_requests where id=target_request for update;
  if not found then raise exception 'AI request not found.'; end if;

  if req.status in ('succeeded','embedded','failed','denied') and req.completed_at is not null then
    return req.id;
  end if;

  total := greatest(coalesce(input_tokens,0)+coalesce(output_tokens,0),0);

  update public.ai_usage_requests
  set status=target_status,
      input_tokens=greatest(coalesce(input_tokens,0),0),
      output_tokens=greatest(coalesce(output_tokens,0),0),
      total_tokens=total,
      estimated_cost_minor=estimated_cost_minor,
      provider_reported_cost_minor=provider_reported_cost_minor,
      reconciled_cost_minor=reconciled_cost_minor,
      error_category=target_error_category,
      error_message=case when target_error_message is null then null else left(target_error_message,500) end,
      completed_at=case when target_status in ('succeeded','failed','denied') then now() else completed_at end
  where id=req.id;

  if target_status='succeeded' and total > 0 then
    qty := total::numeric/1000;
    proposed := qty * private.contribution_weight(req.project_id,'ai_token_1k');

    perform private.insert_contribution(
      req.project_id,req.job_id,req.user_id,'ai_usage',qty,'1k_tokens',
      proposed,true,req.id::text,
      jsonb_build_object(
        'provider',req.provider,
        'model',req.model,
        'connection_id',req.connection_id,
        'request_id',req.id,
        'input_tokens',input_tokens,
        'output_tokens',output_tokens,
        'total_tokens',total,
        'usage_state','verified_not_accepted'
      ),
      reconciled_cost_minor,
      req.currency,
      'provider_reported_usage'
    );
  end if;

  return req.id;
end;
$$;

create or replace function public.service_get_ai_provider_connection_v2(
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

  if not exists (
    select 1 from public.stakeholder_profiles sp
    where sp.project_id=target_project and sp.user_id=target_user and sp.status='active'
  ) and not exists (
    select 1 from public.project_members pm
    where pm.project_id=target_project and pm.user_id=target_user and pm.status='active'
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'id',apc.id,
    'provider',apc.provider,
    'label',apc.label,
    'api_base_url',apc.api_base_url,
    'endpoint_host',apc.endpoint_host,
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
    and (
      (apc.provider='openai' and apc.endpoint_host='api.openai.com')
      or exists (
        select 1 from public.ai_provider_domain_allowlist al
        where al.project_id=apc.project_id
          and al.hostname=apc.endpoint_host
          and al.active=true
      )
    )
  order by
    case when target_connection is not null and apc.id=target_connection then 0
         when apc.is_default then 1 else 2 end,
    apc.updated_at desc
  limit 1;

  return result;
end;
$$;

create or replace function public.service_upsert_ai_provider_connection_v2(
  target_project uuid,
  target_user uuid,
  target_provider text,
  target_label text,
  target_api_base_url text,
  target_endpoint_host text,
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

  if target_provider not in ('openai','openai_compatible') then
    raise exception 'Unsupported provider.';
  end if;

  if target_provider='openai' and target_endpoint_host <> 'api.openai.com' then
    raise exception 'OpenAI connections must use api.openai.com.';
  end if;

  if target_provider='openai_compatible' and not exists (
    select 1 from public.ai_provider_domain_allowlist al
    where al.project_id=target_project
      and al.hostname=lower(target_endpoint_host)
      and al.active=true
  ) then
    raise exception 'Provider hostname is not in the project allowlist.';
  end if;

  if nullif(btrim(target_secret),'') is null then
    raise exception 'Provider credential is required.';
  end if;

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
        endpoint_host=lower(target_endpoint_host),
        model=target_model,
        status='active',
        last_error=null,
        last_rotated_at=now(),
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
      project_id,user_id,provider,label,api_base_url,endpoint_host,model,secret_id,
      status,is_default,last_rotated_at
    )
    values(
      target_project,target_user,target_provider,target_label,target_api_base_url,
      lower(target_endpoint_host),target_model,sid,'active',true,now()
    )
    returning id into cid;
  end if;

  update public.ai_provider_connections
  set is_default=(id=cid)
  where project_id=target_project and user_id=target_user;

  return (
    select jsonb_build_object(
      'id',id,
      'provider',provider,
      'label',label,
      'api_base_url',api_base_url,
      'endpoint_host',endpoint_host,
      'model',model,
      'status',status,
      'is_default',is_default,
      'last_rotated_at',last_rotated_at,
      'updated_at',updated_at
    )
    from public.ai_provider_connections where id=cid
  );
end;
$$;

create or replace function public.service_delete_ai_provider_connection_v2(
  target_project uuid,
  target_user uuid,
  target_connection uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare sid uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  select secret_id into sid
  from public.ai_provider_connections
  where id=target_connection
    and project_id=target_project
    and user_id=target_user;

  if sid is null then raise exception 'AI provider connection not found.'; end if;

  delete from public.ai_provider_connections
  where id=target_connection
    and project_id=target_project
    and user_id=target_user;

  delete from vault.secrets where id=sid;

  return target_connection;
end;
$$;

revoke execute on function public.service_get_ai_provider_connection(uuid,uuid,uuid) from service_role;
revoke execute on function public.service_upsert_ai_provider_connection(uuid,uuid,text,text,text,text,text) from service_role;
revoke execute on function public.service_record_ai_usage(uuid,uuid,uuid,uuid,text,text,bigint,bigint) from service_role;

grant execute on function public.service_authorize_ai_request(uuid,uuid) to service_role;
grant execute on function public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text) to service_role;
grant execute on function public.service_get_ai_provider_connection_v2(uuid,uuid,uuid) to service_role;
grant execute on function public.service_upsert_ai_provider_connection_v2(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.service_delete_ai_provider_connection_v2(uuid,uuid,uuid) to service_role;

create or replace function private.set_ai_provider_domain(
  target_project uuid,
  target_hostname text,
  target_active boolean
)
returns text
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare host text := lower(btrim(target_hostname));
begin
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if host !~ '^[a-z0-9.-]+$' or host like '%.local' or host in ('localhost','127.0.0.1','0.0.0.0') then
    raise exception 'Invalid provider hostname.';
  end if;

  insert into public.ai_provider_domain_allowlist(project_id,hostname,active,added_by)
  values(target_project,host,target_active,auth.uid())
  on conflict (project_id,hostname) do update
  set active=excluded.active,updated_at=now(),added_by=excluded.added_by;

  return host;
end;
$$;

create or replace function public.set_ai_provider_domain(
  target_project uuid,
  target_hostname text,
  target_active boolean
)
returns text
language sql
set search_path = public, private
as $$ select private.set_ai_provider_domain(target_project,target_hostname,target_active); $$;

create or replace function private.set_ai_budget_policy(
  target_project uuid,
  target_user uuid,
  target_daily_request_limit integer,
  target_monthly_token_limit bigint,
  target_monthly_cost_limit_minor bigint,
  target_max_output_tokens integer,
  target_concurrency_limit integer,
  target_allowed_providers text[],
  target_allowed_models text[],
  target_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare policy_id uuid;
begin
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if target_user is not null and not exists (
    select 1 from public.stakeholder_profiles sp
    where sp.project_id=target_project and sp.user_id=target_user
  ) then
    raise exception 'Stakeholder not found.';
  end if;

  insert into public.ai_budget_policies(
    project_id,user_id,enabled,daily_request_limit,monthly_token_limit,
    monthly_cost_limit_minor,max_output_tokens,concurrency_limit,
    allowed_providers,allowed_models,currency,updated_by
  )
  values(
    target_project,target_user,true,
    greatest(target_daily_request_limit,0),
    greatest(target_monthly_token_limit,0),
    target_monthly_cost_limit_minor,
    greatest(target_max_output_tokens,1),
    greatest(target_concurrency_limit,1),
    coalesce(target_allowed_providers,array['openai','openai_compatible']),
    coalesce(target_allowed_models,array['*']),
    coalesce(nullif(btrim(target_currency),''),'ZAR'),
    auth.uid()
  )
  on conflict (project_id,user_id)
  where user_id is not null
  do update set
    enabled=true,
    daily_request_limit=excluded.daily_request_limit,
    monthly_token_limit=excluded.monthly_token_limit,
    monthly_cost_limit_minor=excluded.monthly_cost_limit_minor,
    max_output_tokens=excluded.max_output_tokens,
    concurrency_limit=excluded.concurrency_limit,
    allowed_providers=excluded.allowed_providers,
    allowed_models=excluded.allowed_models,
    currency=excluded.currency,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning id into policy_id;

  if target_user is null then
    update public.ai_budget_policies
    set daily_request_limit=greatest(target_daily_request_limit,0),
        monthly_token_limit=greatest(target_monthly_token_limit,0),
        monthly_cost_limit_minor=target_monthly_cost_limit_minor,
        max_output_tokens=greatest(target_max_output_tokens,1),
        concurrency_limit=greatest(target_concurrency_limit,1),
        allowed_providers=coalesce(target_allowed_providers,array['openai','openai_compatible']),
        allowed_models=coalesce(target_allowed_models,array['*']),
        currency=coalesce(nullif(btrim(target_currency),''),'ZAR'),
        enabled=true,
        updated_by=auth.uid(),
        updated_at=now()
    where project_id=target_project and user_id is null
    returning id into policy_id;
  end if;

  return policy_id;
end;
$$;

create or replace function public.set_ai_budget_policy(
  target_project uuid,
  target_user uuid,
  target_daily_request_limit integer,
  target_monthly_token_limit bigint,
  target_monthly_cost_limit_minor bigint,
  target_max_output_tokens integer,
  target_concurrency_limit integer,
  target_allowed_providers text[],
  target_allowed_models text[],
  target_currency text
)
returns uuid
language sql
set search_path = public, private
as $$
  select private.set_ai_budget_policy(
    target_project,target_user,target_daily_request_limit,target_monthly_token_limit,
    target_monthly_cost_limit_minor,target_max_output_tokens,target_concurrency_limit,
    target_allowed_providers,target_allowed_models,target_currency
  );
$$;

create or replace function public.get_ai_budget_status(target_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare caller uuid := auth.uid(); bp public.ai_budget_policies%rowtype;
begin
  if caller is null or not private.has_project_access(target_project) then
    raise insufficient_privilege using message='Project access is required.';
  end if;

  select * into bp from private.resolve_ai_budget(target_project,caller);

  return jsonb_build_object(
    'policy_id',bp.id,
    'daily_request_limit',bp.daily_request_limit,
    'monthly_token_limit',bp.monthly_token_limit,
    'monthly_cost_limit_minor',bp.monthly_cost_limit_minor,
    'max_output_tokens',bp.max_output_tokens,
    'concurrency_limit',bp.concurrency_limit,
    'allowed_providers',bp.allowed_providers,
    'allowed_models',bp.allowed_models,
    'currency',bp.currency,
    'daily_requests_used',(
      select count(*) from public.ai_usage_requests r
      where r.project_id=target_project and r.user_id=caller
        and r.provider_called=true and r.created_at >= date_trunc('day',now())
    ),
    'monthly_tokens_used',(
      select coalesce(sum(total_tokens),0) from public.ai_usage_requests r
      where r.project_id=target_project and r.user_id=caller
        and r.created_at >= date_trunc('month',now())
        and r.status in ('succeeded','unknown')
    ),
    'monthly_cost_used_minor',(
      select coalesce(sum(coalesce(reconciled_cost_minor,provider_reported_cost_minor,estimated_cost_minor,0)),0)
      from public.ai_usage_requests r
      where r.project_id=target_project and r.user_id=caller
        and r.created_at >= date_trunc('month',now())
        and r.status in ('succeeded','unknown')
    )
  );
end;
$$;

grant execute on function public.set_ai_provider_domain(uuid,text,boolean) to authenticated;
grant execute on function public.set_ai_budget_policy(uuid,uuid,integer,bigint,bigint,integer,integer,text[],text[],text) to authenticated;
grant execute on function public.get_ai_budget_status(uuid) to authenticated;

create or replace function private.revoke_stakeholder_runtime_access()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status <> 'active' and old.status='active' then
    update public.ai_provider_connections
    set status='disabled',is_default=false,updated_at=now()
    where project_id=new.project_id and user_id=new.user_id;

    update public.job_collaborators
    set status='revoked',updated_at=now()
    where project_id=new.project_id
      and user_id=new.user_id
      and status='accepted';
  end if;
  return new;
end;
$$;

drop trigger if exists revoke_stakeholder_runtime_access on public.stakeholder_profiles;
create trigger revoke_stakeholder_runtime_access
after update of status on public.stakeholder_profiles
for each row execute function private.revoke_stakeholder_runtime_access();

create or replace function private.set_stakeholder_status(
  target_project uuid,
  target_user uuid,
  target_status text
)
returns text
language plpgsql
security definer
set search_path = public, private, auth
as $$
begin
  if not private.has_project_role(target_project,array['owner','admin']) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;
  if target_user=auth.uid() then
    raise insufficient_privilege using message='A stakeholder cannot change their own stakeholder status.';
  end if;
  if target_status not in ('active','paused','removed') then
    raise exception 'Invalid stakeholder status.';
  end if;

  update public.stakeholder_profiles
  set status=target_status,updated_at=now()
  where project_id=target_project and user_id=target_user;

  return target_status;
end;
$$;

create or replace function public.set_stakeholder_status(
  target_project uuid,
  target_user uuid,
  target_status text
)
returns text
language sql
set search_path = public, private
as $$ select private.set_stakeholder_status(target_project,target_user,target_status); $$;

grant execute on function public.set_stakeholder_status(uuid,uuid,text) to authenticated;
