begin;

-- DataNest AI intake evidence is append-only for the application service role.
-- Edge Functions retain SELECT/INSERT so governed intake can continue, but
-- already-staged evidence cannot be rewritten, deleted, or truncated.
revoke update, delete, truncate
on table public.ai_intake_events
from service_role;

grant select, insert
on table public.ai_intake_events
to service_role;

commit;
