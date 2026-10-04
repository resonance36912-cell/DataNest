create or replace function public.get_mutation_recovery_diagnostics_v1(target_project uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path='recovery','public','auth'
as $function$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null then
    raise insufficient_privilege using message='Authentication is required.';
  end if;

  if not exists(
    select 1
    from public.project_members pm
    where pm.project_id=target_project
      and pm.user_id=caller
      and pm.status='active'
  ) then
    raise insufficient_privilege using message='Active project membership is required.';
  end if;

  with own_rows as (
    select r.*
    from recovery.mutation_recovery_ledger r
    where r.project_id=target_project
      and r.user_id=caller
  ),
  unresolved as (
    select *
    from own_rows
    where resolved_at is null
  ),
  recent_resolved as (
    select *
    from own_rows
    where resolved_at is not null
      and resolved_at >= now()-interval '24 hours'
  ),
  unresolved_summary as (
    select
      count(*)::int as unresolved_total,
      count(*) filter (where verification_state='unverified')::int as unverified_total,
      count(*) filter (where verification_state='unconfirmed')::int as unconfirmed_total,
      count(*) filter (where verification_state='confirmed_absent')::int as safe_retry_total,
      count(*) filter (where now()-started_at < interval '15 minutes')::int as recent_total,
      count(*) filter (
        where now()-started_at >= interval '15 minutes'
          and now()-started_at < interval '1 hour'
      )::int as aging_total,
      count(*) filter (where now()-started_at >= interval '1 hour')::int as stale_total,
      coalesce(max(attempt_count),0)::int as max_attempt_count,
      min(started_at) as oldest_started_at
    from unresolved
  ),
  unresolved_items as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',u.id,
          'mutation_kind',u.mutation_kind,
          'request_suffix',right(u.request_key::text,8),
          'started_at',u.started_at,
          'age_seconds',greatest(0,floor(extract(epoch from now()-u.started_at)))::bigint,
          'verification_state',u.verification_state,
          'last_checked_at',u.last_checked_at,
          'attempt_count',u.attempt_count,
          'last_attempt_at',u.last_attempt_at
        )
        order by u.started_at
      ),
      '[]'::jsonb
    ) as items
    from unresolved u
  ),
  recent_resolution_items as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',rr.id,
          'mutation_kind',rr.mutation_kind,
          'request_suffix',right(rr.request_key::text,8),
          'resolution',rr.resolution,
          'started_at',rr.started_at,
          'resolved_at',rr.resolved_at,
          'elapsed_seconds',greatest(0,floor(extract(epoch from rr.resolved_at-rr.started_at)))::bigint,
          'attempt_count',rr.attempt_count
        )
        order by rr.resolved_at desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select *
      from recent_resolved
      order by resolved_at desc
      limit 10
    ) rr
  )
  select jsonb_build_object(
    'generated_at',now(),
    'unresolved_total',s.unresolved_total,
    'unverified_total',s.unverified_total,
    'unconfirmed_total',s.unconfirmed_total,
    'safe_retry_total',s.safe_retry_total,
    'recent_total',s.recent_total,
    'aging_total',s.aging_total,
    'stale_total',s.stale_total,
    'max_attempt_count',s.max_attempt_count,
    'oldest_started_at',s.oldest_started_at,
    'resolved_24h',(select count(*)::int from recent_resolved),
    'items',ui.items,
    'recent_resolutions',ri.items
  )
  into result
  from unresolved_summary s
  cross join unresolved_items ui
  cross join recent_resolution_items ri;

  return result;
end;
$function$;

revoke all on function public.get_mutation_recovery_diagnostics_v1(uuid) from public,anon;
grant execute on function public.get_mutation_recovery_diagnostics_v1(uuid) to authenticated;
