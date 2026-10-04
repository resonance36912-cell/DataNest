begin;

-- The sync helper only needs to report the connection metadata needed by the
-- trusted Edge Function. Never return the Vault-decrypted provider secret.
create or replace function public.service_sync_shared_ai_provider_connection_v1(target_project uuid, target_user uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path=public,vault,auth
as $function$
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
    where al.project_id=target_project and al.hostname=cfg.endpoint_host and al.active=true
  ) then
    return null;
  end if;

  select decrypted_secret into shared_secret
  from vault.decrypted_secrets
  where id=cfg.secret_id;
  if nullif(shared_secret,'') is null then return null; end if;

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
       or existing.status<>'active'
       or coalesce(existing.metadata->>'processing_region','')<>coalesce(
          nullif(lower(btrim(coalesce(cfg.metadata->>'processing_region',''))),''),
          ''
       ) then
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
            'managed_by','datanest',
            'processing_region',nullif(
              lower(btrim(coalesce(cfg.metadata->>'processing_region',''))),''
            )
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
      project_id,
      user_id,
      provider,
      label,
      api_base_url,
      endpoint_host,
      model,
      secret_id,
      status,
      is_default,
      last_rotated_at,
      metadata
    ) values(
      target_project,
      target_user,
      cfg.provider,
      cfg.label,
      cfg.api_base_url,
      cfg.endpoint_host,
      cfg.model,
      sid,
      'active',
      true,
      cfg.last_rotated_at,
      jsonb_build_object(
        'scope','project_shared_copy',
        'shared_config_id',cfg.id,
        'shared_config_updated_at',cfg_stamp,
        'managed_by','datanest',
        'processing_region',nullif(
          lower(btrim(coalesce(cfg.metadata->>'processing_region',''))),''
        )
      )
    )
    returning id into cid;

    update public.ai_provider_connections
    set is_default=(id=cid)
    where project_id=target_project
      and user_id=target_user;
  end if;

  return (
    select jsonb_build_object(
      'id',c.id,
      'provider',c.provider,
      'label',c.label,
      'api_base_url',c.api_base_url,
      'endpoint_host',c.endpoint_host,
      'model',c.model,
      'metadata',c.metadata
    )
    from public.ai_provider_connections c
    where c.id=cid
  );
end;
$function$;

revoke all on function public.service_sync_shared_ai_provider_connection_v1(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.service_sync_shared_ai_provider_connection_v1(uuid,uuid)
to service_role;

commit;
