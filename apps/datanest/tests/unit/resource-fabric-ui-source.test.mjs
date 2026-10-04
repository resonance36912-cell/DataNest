import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const libPath=path.join(root,"src/lib/resourceFabric.ts");
const panelPath=path.join(root,"src/components/ResourceFabricPanel.tsx");
const appPath=path.join(root,"src/components/DataNestApp.tsx");

test("shared Resource Fabric types expose resource, trust, health and role vocabulary",()=>{
  assert.equal(fs.existsSync(libPath),true);
  const source=fs.readFileSync(libPath,"utf8");
  for(const token of ["ResourceKind","ResourceTrustLevel","ResourceHealthStatus","ResourceBindingState","resourceKinds","resourceVisibilityClasses","canManageResourceFabric"]){
    assert.match(source,new RegExp(token));
  }
});

test("Resource Fabric panel reads governed workspace and mutates only via RPCs",()=>{
  assert.equal(fs.existsSync(panelPath),true);
  const source=fs.readFileSync(panelPath,"utf8");
  for(const fn of ["get_resource_fabric_workspace_v1","register_project_resource_v1","set_resource_project_binding_state_v1","upsert_sovereign_node_policy_v1"]){
    assert.match(source,new RegExp(fn));
  }
  assert.doesNotMatch(source,/from\("(?:resource_registry|resource_project_bindings|resource_health_observations|sovereign_node_policies)"\)\.(?:insert|update|delete)/);
});

test("Resource Fabric UI states sovereignty and authority boundaries explicitly",()=>{
  assert.equal(fs.existsSync(panelPath),true);
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/Registration ≠ remote control/);
  assert.match(source,/Resource match ≠ reservation ≠ Capability Lease/);
  assert.match(source,/Health evidence is service-recorded and read-only/i);
  assert.doesNotMatch(source,/Password|API key|Access token|Refresh token|Remote shell/i);
});

test("Resource Fabric mutation controls are owner/admin gated",()=>{
  const source=fs.readFileSync(panelPath,"utf8");
  assert.match(source,/canManageResourceFabric\(role\)/);
  assert.match(source,/Owner \/ admin/);
});

test("TranScheduler adds Resource Fabric as sibling mode while Gantt remains default",()=>{
  const source=fs.readFileSync(appPath,"utf8");
  assert.match(source,/type SchedulerViewMode = "queue"\|"gantt"\|"authority"\|"resources"/);
  assert.match(source,/useState<SchedulerViewMode>\("gantt"\)/);
  assert.match(source,/>Queue<\/button>/);
  assert.match(source,/>Gantt chart<\/button>/);
  assert.match(source,/>Authority & Execution<\/button>/);
  assert.match(source,/>Resource Fabric<\/button>/);
  assert.match(source,/viewMode==="resources"[\s\S]*ResourceFabricPanel/);
});

test("human queue controls remain unchanged and Resource Fabric does not call execution authorization",()=>{
  const source=fs.readFileSync(appPath,"utf8");
  assert.match(source,/onStatus\(job,"PAUSED"\)/);
  assert.match(source,/onStatus\(job,"READY"\)/);
  assert.match(source,/onStatus\(job,"CANCELLED"\)/);
  if(fs.existsSync(panelPath)){
    const panel=fs.readFileSync(panelPath,"utf8");
    assert.doesNotMatch(panel,/service_authorize_execution_v1/);
  }
});
