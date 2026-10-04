import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const app=fs.readFileSync(path.join(root,"src/components/DataNestApp.tsx"),"utf8");
const dashboard=fs.readFileSync(path.join(root,"src/components/DataNestDashboard.tsx"),"utf8");
const css=fs.readFileSync(path.join(root,"src/app/globals.css"),"utf8");

test("DataNest exposes a dedicated Control Center workspace",()=>{
  assert.match(app,/type ViewKey = "dashboard"\|/);
  assert.match(app,/key:"dashboard",label:"Control Center"/);
  assert.match(app,/import\("@\/components\/DataNestDashboard"\)/);
  assert.match(app,/view==="dashboard"&&<DataNestDashboard/);
});

test("Control Center combines operations, governance and evidence without bypassing authority",()=>{
  assert.match(dashboard,/DATANEST CONTROL CENTER/);
  assert.match(dashboard,/get_owner_optimizer_workspace_v1/);
  assert.match(dashboard,/get_owner_governance_control_monitor_v1/);
  assert.match(dashboard,/Human approval/);
  assert.match(dashboard,/AI vote/);
  assert.match(dashboard,/Not allowed/);
  assert.match(dashboard,/Auto deploy/);
});

test("Owner-only governance telemetry stays restricted by role",()=>{
  assert.match(dashboard,/const isOwner=role==="owner"/);
  assert.match(dashboard,/Owner controls restricted/);
  assert.match(dashboard,/isOwner&&<div className="controlCenterGovernance"/);
});

test("Control Center provides responsive dashboard styling",()=>{
  assert.match(css,/\/\* DataNest Control Center dashboard \*\//);
  assert.match(css,/\.controlCenterMetrics\{display:grid/);
  assert.match(css,/@container datanest-main \(max-width:820px\)/);
  assert.match(css,/\.controlCenterGrid\{grid-template-columns:1fr\}/);
});
