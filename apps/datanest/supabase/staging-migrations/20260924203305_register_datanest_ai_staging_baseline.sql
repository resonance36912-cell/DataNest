-- Current long-lived staging was provisioned before Supabase migration history existed.
-- This migration does not create the governed schema. It validates the existing
-- staging baseline and records that baseline in Supabase migration history.
-- Fresh staging projects must apply 20260924230001_datanest_ai_staging.sql instead.

do $$
declare
  present_count integer;
  rls_count integer;
begin
  select count(*) into present_count
  from unnest(array[
    'ai_sessions','ai_intake_events','ai_reasoning_envelopes','ai_trend_clusters',
    'ai_trend_evidence','ai_learning_candidates','ai_candidate_evidence',
    'ai_validation_runs','ai_certification_decisions','ai_memory_supersessions'
  ]) n
  where to_regclass('public.'||n) is not null;

  if present_count <> 10 then
    raise exception 'DataNest AI staging baseline is incomplete: %/10 tables present', present_count;
  end if;

  select count(*) into rls_count
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in (
      'ai_sessions','ai_intake_events','ai_reasoning_envelopes','ai_trend_clusters',
      'ai_trend_evidence','ai_learning_candidates','ai_candidate_evidence',
      'ai_validation_runs','ai_certification_decisions','ai_memory_supersessions'
    )
    and c.relrowsecurity;

  if rls_count <> 10 then
    raise exception 'DataNest AI staging baseline RLS is incomplete: %/10 tables protected', rls_count;
  end if;

  if has_table_privilege('authenticated','public.ai_intake_events','INSERT')
     or has_table_privilege('anon','public.ai_intake_events','SELECT') then
    raise exception 'DataNest AI staging baseline exposes direct browser-role table privileges';
  end if;
end $$;
