begin;

create table if not exists public.ai_shared_provider_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  provider text not null check (provider in ('openai_compatible')),
  label text not null check (length(btrim(label)) > 0),
  api_base_url text not null,
  endpoint_host text not null,
  model text not null check (length(btrim(model)) > 0),
  secret_id uuid not null unique,
  status text not null default 'active' check (status in ('active','disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  updated_by uuid not null,
  last_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_shared_provider_configs enable row level security;

revoke all on table public.ai_shared_provider_configs from anon, authenticated;

create index if not exists ai_shared_provider_configs_active_idx
  on public.ai_shared_provider_configs(project_id,status,updated_at desc);

create or replace function public.service_get_shared_ai_provider_status_v1(
  target_project uuid,
  target_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare cfg public.ai_shared_provider_configs%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id=target_project
      and pm.user_id=target_actor
      and pm.status='active'
      and pm.role in ('owner','admin')
  ) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  select * into cfg
  from public.ai_shared_provider_configs
  where project_id=target_project
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'id',cfg.id,
    'provider',cfg.provider,
    'label',cfg.label,
    'api_base_url',cfg.api_base_url,
    'endpoint_host',cfg.endpoint_host,
    'model',cfg.model,
    'status',cfg.status,
    'metadata',cfg.metadata,
    'last_rotated_at',cfg.last_rotated_at,
    'updated_at',cfg.updated_at
  );
end;
$$;

create or replace function public.service_upsert_shared_ai_provider_config_v1(
  target_project uuid,
  target_actor uuid,
  target_provider text,
  target_label text,
  target_api_base_url text,
  target_endpoint_host text,
  target_model text,
  target_secret text
) returns jsonb
language plpgsql
security definer
set search_path=public,vault,auth
as $$
declare
  cfg public.ai_shared_provider_configs%rowtype;
  sid uuid;
  cid uuid;
  normalized_host text:=lower(btrim(target_endpoint_host));
  url_host text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id=target_project
      and pm.user_id=target_actor
      and pm.status='active'
      and pm.role in ('owner','admin')
  ) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  if target_provider <> 'openai_compatible' then
    raise exception 'Project-shared providers must be openai_compatible.';
  end if;

  if nullif(btrim(target_label),'') is null
     or nullif(btrim(target_model),'') is null
     or nullif(normalized_host,'') is null
     or nullif(btrim(target_secret),'') is null then
    raise exception 'Label, model, endpoint host and provider credential are required.';
  end if;

  if target_api_base_url !~* '^https://[^/]+/.+' then
    raise exception 'Project-shared provider endpoint must use HTTPS and include a route path.';
  end if;

  url_host:=lower(split_part(split_part(split_part(target_api_base_url,'://',2),'/',1),':',1));
  if url_host<>normalized_host then
    raise exception 'Provider endpoint host does not match api_base_url.';
  end if;

  if not exists (
    select 1
    from public.ai_provider_domain_allowlist al
    where al.project_id=target_project
      and al.hostname=normalized_host
      and al.active=true
  ) then
    raise exception 'Provider hostname is not in the project allowlist.';
  end if;

  select * into cfg
  from public.ai_shared_provider_configs
  where project_id=target_project
  for update;

  if found then
    perform vault.update_secret(
      cfg.secret_id,
      target_secret,
      'datanest-shared-ai-'||cfg.id::text,
      'Encrypted DataNest project-shared AI provider credential',
      null
    );

    update public.ai_shared_provider_configs
    set provider=target_provider,
        label=btrim(target_label),
        api_base_url=target_api_base_url,
        endpoint_host=normalized_host,
        model=btrim(target_model),
        status='active',
        metadata=metadata || jsonb_build_object(
          'scope','project_shared',
          'managed_by','datanest'
        ),
        updated_by=target_actor,
        last_rotated_at=now(),
        updated_at=now()
    where id=cfg.id
    returning id into cid;
  else
    sid:=vault.create_secret(
      target_secret,
      'datanest-shared-ai-'||gen_random_uuid()::text,
      'Encrypted DataNest project-shared AI provider credential',
      null
    );

    insert into public.ai_shared_provider_configs(
      project_id,provider,label,api_base_url,endpoint_host,model,secret_id,status,
      metadata,created_by,updated_by,last_rotated_at
    )
    values(
      target_project,target_provider,btrim(target_label),target_api_base_url,
      normalized_host,btrim(target_model),sid,'active',
      jsonb_build_object('scope','project_shared','managed_by','datanest'),
      target_actor,target_actor,now()
    )
    returning id into cid;
  end if;

  return (
    select jsonb_build_object(
      'id',id,
      'provider',provider,
      'label',label,
      'api_base_url',api_base_url,
      'endpoint_host',endpoint_host,
      'model',model,
      'status',status,
      'metadata',metadata,
      'last_rotated_at',last_rotated_at,
      'updated_at',updated_at
    )
    from public.ai_shared_provider_configs
    where id=cid
  );
end;
$$;

create or replace function public.service_disable_shared_ai_provider_config_v1(
  target_project uuid,
  target_actor uuid
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare cfg_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id=target_project
      and pm.user_id=target_actor
      and pm.status='active'
      and pm.role in ('owner','admin')
  ) then
    raise insufficient_privilege using message='Owner or admin access is required.';
  end if;

  update public.ai_shared_provider_configs
  set status='disabled',updated_by=target_actor,updated_at=now()
  where project_id=target_project
  returning id into cfg_id;

  if cfg_id is null then
    raise exception 'Project-shared provider is not configured.';
  end if;

  update public.ai_provider_connections
  set status='disabled',
      is_default=false,
      updated_at=now(),
      metadata=metadata || jsonb_build_object('shared_config_disabled_at',now())
  where project_id=target_project
    and metadata->>'scope'='project_shared_copy';

  return cfg_id;
end;
$$;

create or replace function public.service_sync_shared_ai_provider_connection_v1(
  target_project uuid,
  target_user uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,vault,auth
as $$
declare
  cfg public.ai_shared_provider_configs%rowtype;
  existing public.ai_provider_connections%rowtype;
  shared_secret text;
  sid uuid;
  cid uuid;
  cfg_stamp text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;

  if not exists (
    select 1 from public.project_members pm
    where pm.project_id=target_project and pm.user_id=target_user and pm.status='active'
  ) and not exists (
    select 1 from public.stakeholder_profiles sp
    where sp.project_id=target_project and sp.user_id=target_user and sp.status='active'
  ) then
    return null;
  end if;

  select * into cfg
  from public.ai_shared_provider_configs
  where project_id=target_project and status='active'
  limit 1;

  if not found then return null; end if;

  if not exists (
    select 1 from public.ai_provider_domain_allowlist al
    where al.project_id=target_project
      and al.hostname=cfg.endpoint_host
      and al.active=true
  ) then
    return null;
  end if;

  select decrypted_secret into shared_secret
  from vault.decrypted_secrets
  where id=cfg.secret_id;

  if nullif(shared_secret,'') is null then
    return null;
  end if;

  cfg_stamp:=cfg.updated_at::text;

  select * into existing
  from public.ai_provider_connections
  where project_id=target_project
    and user_id=target_user
    and metadata->>'scope'='project_shared_copy'
  order by updated_at desc
  limit 1
  for update;

  if found then
    if coalesce(existing.metadata->>'shared_config_updated_at','')<>cfg_stamp
       or existing.provider<>cfg.provider
       or existing.label<>cfg.label
       or existing.api_base_url<>cfg.api_base_url
       or existing.endpoint_host<>cfg.endpoint_host
       or existing.model<>cfg.model
       or existing.status<>'active' then
      perform vault.update_secret(
        existing.secret_id,
        shared_secret,
        'datanest-ai-'||existing.id::text,
        'Encrypted DataNest project-shared AI provider copy',
        null
      );

      update public.ai_provider_connections
      set provider=cfg.provider,
          label=cfg.label,
          api_base_url=cfg.api_base_url,
          endpoint_host=cfg.endpoint_host,
          model=cfg.model,
          status='active',
          last_error=null,
          last_rotated_at=cfg.last_rotated_at,
          metadata=metadata || jsonb_build_object(
            'scope','project_shared_copy',
            'shared_config_id',cfg.id,
            'shared_config_updated_at',cfg_stamp,
            'managed_by','datanest'
          ),
          updated_at=now()
      where id=existing.id
      returning id into cid;
    else
      cid:=existing.id;
    end if;
  else
    sid:=vault.create_secret(
      shared_secret,
      'datanest-ai-'||gen_random_uuid()::text,
      'Encrypted DataNest project-shared AI provider copy',
      null
    );

    insert into public.ai_provider_connections(
      project_id,user_id,provider,label,api_base_url,endpoint_host,model,secret_id,
      status,is_default,last_rotated_at,metadata
    )
    values(
      target_project,target_user,cfg.provider,cfg.label,cfg.api_base_url,cfg.endpoint_host,
      cfg.model,sid,'active',true,cfg.last_rotated_at,
      jsonb_build_object(
        'scope','project_shared_copy',
        'shared_config_id',cfg.id,
        'shared_config_updated_at',cfg_stamp,
        'managed_by','datanest'
      )
    )
    returning id into cid;

    update public.ai_provider_connections
    set is_default=(id=cid)
    where project_id=target_project and user_id=target_user;
  end if;

  return (
    select jsonb_build_object(
      'id',c.id,
      'provider',c.provider,
      'label',c.label,
      'api_base_url',c.api_base_url,
      'endpoint_host',c.endpoint_host,
      'model',c.model,
      'metadata',c.metadata,
      'secret',v.decrypted_secret
    )
    from public.ai_provider_connections c
    join vault.decrypted_secrets v on v.id=c.secret_id
    where c.id=cid
  );
end;
$$;

revoke execute on function public.service_get_shared_ai_provider_status_v1(uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.service_upsert_shared_ai_provider_config_v1(uuid,uuid,text,text,text,text,text,text)
  from public,anon,authenticated;
revoke execute on function public.service_disable_shared_ai_provider_config_v1(uuid,uuid)
  from public,anon,authenticated;
revoke execute on function public.service_sync_shared_ai_provider_connection_v1(uuid,uuid)
  from public,anon,authenticated;

grant execute on function public.service_get_shared_ai_provider_status_v1(uuid,uuid) to service_role;
grant execute on function public.service_upsert_shared_ai_provider_config_v1(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.service_disable_shared_ai_provider_config_v1(uuid,uuid) to service_role;
grant execute on function public.service_sync_shared_ai_provider_connection_v1(uuid,uuid) to service_role;

commit;
