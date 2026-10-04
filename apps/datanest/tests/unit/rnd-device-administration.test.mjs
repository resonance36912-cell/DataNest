import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20260930070000_add_rnd_device_administration_v1.sql","utf8");
const component=readFileSync("src/components/RndDeviceAdministration.tsx","utf8");
const app=readFileSync("src/components/DataNestApp.tsx","utf8");

test("R&D device administration is server-enforced for owners/admins",()=>{
  assert.match(migration,/assert_rnd_admin_v1/);
  assert.match(migration,/pm\.role in \('owner','admin'\)/);
  assert.match(migration,/revoke all on table public\.rnd_devices from public,anon,authenticated/);
  assert.match(migration,/grant select on table public\.rnd_devices to authenticated/);
});

test("device grants are bounded to non-execution capabilities",()=>{
  for(const capability of ["inventory.read","report.read","report.submit","named_task.request"]){
    assert.match(migration,new RegExp(capability.replace(".","\\.")));
  }
  assert.doesNotMatch(migration,/capabilities[^\n]*remote\.execute/i);
  assert.match(migration,/Direct remote execution is not part of this grant/);
  assert.match(migration,/target_expires_at>now\(\)\+interval '30 days'/);
});

test("browser device administration uses governed RPCs instead of direct table writes",()=>{
  assert.match(component,/get_rnd_device_admin_workspace_v1/);
  assert.match(component,/enroll_rnd_device_v1/);
  assert.match(component,/grant_rnd_device_capabilities_v1/);
  assert.match(component,/revoke_rnd_device_grant_v1/);
  assert.match(component,/revoke_rnd_device_v1/);
  assert.doesNotMatch(component,/\.from\(["']rnd_/);
});

test("R&D device administration is only mounted for owner/admin memberships",()=>{
  assert.match(app,/membership\?\.role==="owner"\|\|membership\?\.role==="admin"/);
  assert.match(app,/RndDeviceAdministration/);
});
