begin;

-- Preserve existing read semantics for all authenticated project members,
-- while removing the overlapping SELECT branch from the owner/admin write policy.
drop policy if exists external_audit_reviewers_write
  on public.external_audit_reviewers;

drop policy if exists external_audit_reviewers_insert
  on public.external_audit_reviewers;
create policy external_audit_reviewers_insert
  on public.external_audit_reviewers
  for insert
  to authenticated
  with check (
    private.has_project_role(project_id,array['owner','admin'])
  );

drop policy if exists external_audit_reviewers_update
  on public.external_audit_reviewers;
create policy external_audit_reviewers_update
  on public.external_audit_reviewers
  for update
  to authenticated
  using (
    private.has_project_role(project_id,array['owner','admin'])
  )
  with check (
    private.has_project_role(project_id,array['owner','admin'])
  );

drop policy if exists external_audit_reviewers_delete
  on public.external_audit_reviewers;
create policy external_audit_reviewers_delete
  on public.external_audit_reviewers
  for delete
  to authenticated
  using (
    private.has_project_role(project_id,array['owner','admin'])
  );

commit;
