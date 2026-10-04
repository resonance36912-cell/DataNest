import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const optimizer=fs.readFileSync(
  path.join(root,"supabase/functions/audit-optimizer/index.ts"),
  "utf8"
);
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260930071134_enable_admin_system_optimizer_collaboration.sql"),
  "utf8"
);
const dashboard=fs.readFileSync(
  path.join(root,"src/components/OwnerOptimizerDashboard.tsx"),
  "utf8"
);
const app=fs.readFileSync(
  path.join(root,"src/components/DataNestApp.tsx"),
  "utf8"
);
const controlCenter=fs.readFileSync(
  path.join(root,"src/components/DataNestDashboard.tsx"),
  "utf8"
);

test("DataNest AI coordinates the three governed optimization lanes",()=>{
  assert.match(optimizer,/DataNest AI System Optimizer/);
  assert.match(optimizer,/Audit Optimizer/);
  assert.match(optimizer,/Workflow Reviewer/);
  assert.match(optimizer,/Code Cleaner/);
  assert.match(optimizer,/reviewLanes=new Set\(\["audit_optimizer","workflow_reviewer","code_cleaner","cross_system"\]\)/);
  assert.match(optimizer,/noAutomaticCodeChanges:true/);
  assert.match(optimizer,/Do not invent source-code defects/);
});

test("active project admins may run optimizer analysis without gaining owner approval authority",()=>{
  assert.match(optimizer,/!\["owner","admin"\]\.includes/);
  assert.match(optimizer,/triggerKind=membership\.role==="owner"\?"owner":"admin"/);
  assert.match(migration,/trigger_kind in \('cron','owner','admin'\)/);
  assert.match(migration,/pm\.role in \('owner','admin'\)/);
  assert.match(migration,/'admin_can_run',true/);
  assert.match(migration,/'admin_can_approve',false/);
  assert.match(migration,/'owner_can_approve',true/);
});

test("system optimizer is visible in Admin settings with owner-only review controls",()=>{
  assert.match(app,/\["owner","admin"\]\.includes\(membership\.role\)/);
  assert.match(app,/DataNest AI System Optimizer Administration/);
  assert.match(dashboard,/DataNest AI System Optimizer/);
  assert.match(dashboard,/workspace\?\.can_approve\?<\>/);
  assert.match(dashboard,/Admin review is read-only at this gate/);
  assert.match(dashboard,/Code Cleaner produces evidence-linked patch plans only/);
  assert.match(controlCenter,/Admin can configure and run the DataNest AI System Optimizer in Admin settings/);
  assert.match(controlCenter,/\(role==="owner"\|\|role==="admin"\)/);
});
