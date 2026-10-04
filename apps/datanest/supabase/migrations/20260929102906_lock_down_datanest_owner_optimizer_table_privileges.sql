begin;
revoke all on public.optimizer_settings,public.optimizer_runs,public.optimizer_suggestions
  from authenticated;
grant select on public.optimizer_settings,public.optimizer_runs,public.optimizer_suggestions
  to authenticated;
commit;