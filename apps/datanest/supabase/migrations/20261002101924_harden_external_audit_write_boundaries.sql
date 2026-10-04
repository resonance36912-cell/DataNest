begin;

-- Browser clients must use the governed RPCs for external-audit mutations.
-- RLS remains enabled for project-scoped reads; state transitions are authorized
-- and validated inside the dedicated SECURITY DEFINER RPCs.
revoke insert, update, delete on
  public.external_audit_assessments,
  public.external_audit_profiles,
  public.external_audit_sources,
  public.external_audit_findings,
  public.external_audit_actions,
  public.external_audit_reviewers,
  public.external_audit_documents
from authenticated;

revoke all on
  public.external_audit_assessments,
  public.external_audit_profiles,
  public.external_audit_sources,
  public.external_audit_findings,
  public.external_audit_actions,
  public.external_audit_reviewers,
  public.external_audit_events,
  public.external_audit_documents
from anon;

grant select on
  public.external_audit_assessments,
  public.external_audit_profiles,
  public.external_audit_sources,
  public.external_audit_findings,
  public.external_audit_actions,
  public.external_audit_reviewers,
  public.external_audit_documents
to authenticated;

grant select on public.external_audit_events to authenticated;

commit;
