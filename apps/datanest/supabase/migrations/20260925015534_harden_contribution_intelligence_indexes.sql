begin;

create index if not exists contribution_anomaly_user_idx
  on public.contribution_anomaly_signals(user_id,project_id,status,detected_at desc);

create index if not exists stakeholder_progression_subject_idx
  on public.stakeholder_progression_recommendations(user_id,project_id,status,created_at desc);

drop policy if exists n0nymous_squad_no_direct_access on public.n0nymous_squad_memberships;
create policy n0nymous_squad_no_direct_access
on public.n0nymous_squad_memberships for select to authenticated
using (false);

commit;
