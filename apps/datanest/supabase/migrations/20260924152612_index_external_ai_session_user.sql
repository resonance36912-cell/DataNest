
create index if not exists external_ai_sessions_user_idx
  on public.external_ai_sessions(user_id,launched_at desc);
