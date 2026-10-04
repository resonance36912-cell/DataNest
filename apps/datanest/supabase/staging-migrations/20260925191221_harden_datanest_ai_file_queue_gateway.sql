alter table public.ai_file_submission_items
  add column if not exists client_index integer;

update public.ai_file_submission_items
set client_index=0
where client_index is null;

alter table public.ai_file_submission_items
  alter column client_index set not null;

alter table public.ai_file_submission_items
  add constraint ai_file_submission_items_client_index_check
  check (client_index between 0 and 9);

create unique index if not exists ai_file_submission_items_submission_client_idx
  on public.ai_file_submission_items(submission_id,client_index);

create or replace function public.service_enqueue_datanest_file_item(
  target_queue text,
  target_item uuid
) returns bigint
language plpgsql
security definer
set search_path=public,pgmq,auth
as $$
declare
  queued_id bigint;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Service role required.';
  end if;
  if target_queue not in ('datanest_file_ingestion','datanest_file_analysis') then
    raise exception 'Unsupported DataNest file queue.';
  end if;
  if target_item is null then
    raise exception 'File item id is required.';
  end if;

  select id into queued_id
  from pgmq.send(target_queue,jsonb_build_object('itemId',target_item::text))
  as id;

  return queued_id;
end;
$$;

revoke execute on function public.service_enqueue_datanest_file_item(text,uuid)
  from public,anon,authenticated;
grant execute on function public.service_enqueue_datanest_file_item(text,uuid)
  to service_role;
