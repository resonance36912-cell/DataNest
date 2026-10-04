create or replace function public.service_get_ai_provider_connection_v3(
  target_project uuid,
  target_user uuid,
  target_connection uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public,vault,auth
as $$
declare
  result jsonb;
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
    'metadata',apc.metadata,
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

revoke execute on function public.service_get_ai_provider_connection_v3(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.service_get_ai_provider_connection_v3(uuid,uuid,uuid)
  to service_role;
