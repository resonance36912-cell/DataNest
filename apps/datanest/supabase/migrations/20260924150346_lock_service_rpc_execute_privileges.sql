
revoke all on function public.service_authorize_ai_request(uuid,uuid) from public,anon,authenticated;
revoke all on function public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text) from public,anon,authenticated;
revoke all on function public.service_get_ai_provider_connection_v2(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.service_upsert_ai_provider_connection_v2(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.service_delete_ai_provider_connection_v2(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.service_authorize_ai_request(uuid,uuid) to service_role;
grant execute on function public.service_finish_ai_request(uuid,text,bigint,bigint,bigint,bigint,bigint,text,text) to service_role;
grant execute on function public.service_get_ai_provider_connection_v2(uuid,uuid,uuid) to service_role;
grant execute on function public.service_upsert_ai_provider_connection_v2(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.service_delete_ai_provider_connection_v2(uuid,uuid,uuid) to service_role;
