begin;

create index if not exists certified_memory_consolidated_into_fk_idx
  on public.certified_memory(consolidated_into_memory_id)
  where consolidated_into_memory_id is not null;

create index if not exists certified_memory_consolidation_members_memory_fk_idx
  on public.certified_memory_consolidation_members(memory_id);

create index if not exists certified_memory_consolidations_proposed_by_idx
  on public.certified_memory_consolidations(proposed_by);

create index if not exists certified_memory_consolidations_decided_by_idx
  on public.certified_memory_consolidations(decided_by)
  where decided_by is not null;

commit;
