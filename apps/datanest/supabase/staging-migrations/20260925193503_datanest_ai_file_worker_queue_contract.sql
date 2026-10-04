alter table public.datanest_chunks
  add column if not exists identity_sha256 text;

alter table public.datanest_chunks
  drop constraint if exists datanest_chunks_identity_sha256_check;
alter table public.datanest_chunks
  add constraint datanest_chunks_identity_sha256_check
  check (identity_sha256 is null or identity_sha256 ~ '^[a-f0-9]{64}$');

create unique index if not exists datanest_chunks_artifact_identity_key
  on public.datanest_chunks(artifact_id,identity_sha256)
  where identity_sha256 is not null;

create or replace function public.service_claim_datanest_file_items(
  target_limit integer default 5,
  visibility_seconds integer default 120
) returns table(
  msg_id bigint,
  read_ct bigint,
  message jsonb
)
language plpgsql
security definer
set search_path=public,pgmq,auth
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_limit < 1 or target_limit > 20 then
    raise exception 'Worker claim limit must be between 1 and 20.';
  end if;
  if visibility_seconds < 30 or visibility_seconds > 900 then
    raise exception 'Worker visibility timeout must be between 30 and 900 seconds.';
  end if;

  return query
  select r.msg_id, r.read_ct::bigint, r.message
  from pgmq.read('datanest_file_ingestion',visibility_seconds,target_limit) r;
end;
$$;

create or replace function public.service_ack_datanest_file_item(
  target_message bigint
) returns boolean
language plpgsql
security definer
set search_path=public,pgmq,auth
as $$
declare
  deleted boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_message is null then
    raise exception 'Queue message id is required.';
  end if;

  select pgmq.delete('datanest_file_ingestion',target_message) into deleted;
  return coalesce(deleted,false);
end;
$$;

revoke execute on function public.service_claim_datanest_file_items(integer,integer)
  from public,anon,authenticated;
grant execute on function public.service_claim_datanest_file_items(integer,integer)
  to service_role;

revoke execute on function public.service_ack_datanest_file_item(bigint)
  from public,anon,authenticated;
grant execute on function public.service_ack_datanest_file_item(bigint)
  to service_role;
