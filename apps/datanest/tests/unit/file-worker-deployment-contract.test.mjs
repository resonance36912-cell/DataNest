import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config=readFileSync("supabase/config.toml","utf8");
const workflow=readFileSync(".github/workflows/datanest-ai-file-worker-deploy.yml","utf8");
const validation=readFileSync(".github/workflows/edge-function-validation.yml","utf8");

test("heavy file worker stays out of Supabase batch auto-deploy",()=>{
  assert.doesNotMatch(config,/\[functions\.datanest-ai-file-worker\]/);
});

test("heavy file worker keeps governed validation and dedicated local-bundle deployment",()=>{
  assert.match(validation,/datanest-ai-file-worker/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/datanest-ai-file-worker/);
  assert.match(workflow,/--no-verify-jwt/);
  assert.match(workflow,/--use-docker/);
  assert.match(workflow,/SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow,/DATANEST_FILE_WORKER_TOKEN/);
  assert.match(workflow,/supabase secrets set --env-file/);
  assert.match(workflow,/supabase secrets list --project-ref/);
  assert.match(workflow,/DATANEST_FILE_WORKER_TOKEN is required before file-worker deployment/);
  assert.match(workflow,/sgqdmfgjbprsoqsmgigi/);
});
