-- Harden authenticated public gateways that intentionally delegate to the private schema.
-- Do not grant browser roles USAGE on schema private; keep the private schema non-exposed.

alter function public.accept_pending_job_invites()
  security definer;

alter function public.get_project_dashboard_summary(uuid)
  security definer;

alter function public.start_external_ai_sidebar_session(uuid,text,text)
  security definer;

-- Preserve the existing fixed search paths and execute ACLs. Each delegated
-- private routine performs its own auth.uid()/membership/role validation.
