import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const foundation=fs.readFileSync(
  "supabase/migrations/20260929073824_external_audit_foundations.sql",
  "utf8"
);
const migration=fs.readFileSync(
  "supabase/migrations/20260929092807_split_external_audit_reviewer_rls_policies.sql",
  "utf8"
);

test("external audit reviewer RLS keeps project-member read access and splits write commands",()=>{
  assert.match(
    foundation,
    /create policy external_audit_reviewers_select[\s\S]*?for select to authenticated using \(private\.is_project_member\(project_id\)\)/
  );
  assert.match(migration,/drop policy if exists external_audit_reviewers_write/);
  assert.match(migration,/create policy external_audit_reviewers_insert[\s\S]*?for insert/);
  assert.match(migration,/create policy external_audit_reviewers_update[\s\S]*?for update/);
  assert.match(migration,/create policy external_audit_reviewers_delete[\s\S]*?for delete/);
  assert.doesNotMatch(migration,/create policy\s+external_audit_reviewers_\w+[\s\S]*?for all/);
  assert.doesNotMatch(migration,/drop policy if exists external_audit_reviewers_select/);
});

const hardening=fs.readFileSync(
  "supabase/migrations/20261002101924_harden_external_audit_write_boundaries.sql",
  "utf8"
);

test("external audit browser roles are read-only and mutations stay behind governed RPCs",()=>{
  assert.match(
    hardening,
    /revoke insert, update, delete on[\s\S]*public\.external_audit_documents[\s\S]*from authenticated/
  );
  assert.match(
    hardening,
    /revoke all on[\s\S]*public\.external_audit_events[\s\S]*from anon/
  );
  assert.match(
    hardening,
    /grant select on[\s\S]*public\.external_audit_documents[\s\S]*to authenticated/
  );
  assert.doesNotMatch(hardening,/grant (?:insert|update|delete)[\s\S]*to authenticated/);
});
