begin;

create index if not exists certified_memory_usage_receipts_request_idx
  on public.certified_memory_usage_receipts(ai_usage_request_id)
  where ai_usage_request_id is not null;

commit;
