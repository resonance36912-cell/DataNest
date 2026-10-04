begin;

create index if not exists think_tank_messages_project_idx
  on public.think_tank_messages(project_id,thread_id,created_at);

create index if not exists think_tank_decisions_project_idx
  on public.think_tank_decisions(project_id,status,created_at desc);

create index if not exists think_tank_actions_project_idx
  on public.think_tank_action_items(project_id,status,created_at desc);

commit;
