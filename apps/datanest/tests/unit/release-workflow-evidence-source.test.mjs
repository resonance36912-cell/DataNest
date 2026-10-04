import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const pages=fs.readFileSync(path.join(root,".github/workflows/pages.yml"),"utf8");
const certification=fs.readFileSync(path.join(root,".github/workflows/datanest-ai-certification.yml"),"utf8");

test("Pages release verification uses the canonical database contract and current main SHA",()=>{
  assert.match(pages,/push:\n    branches:\n      - main/);
  assert.match(pages,/workflow_dispatch:/);
  assert.doesNotMatch(pages,/workflow_run:/);
  assert.ok(pages.includes("git rev-parse origin/main"));
  assert.match(pages,/verify-production-release-attestation\.mjs/);
  assert.match(pages,/Live database attestation is not verified/);
  assert.doesNotMatch(pages,/RELEASE_MODE/);
  assert.doesNotMatch(pages,/DATANEST_UI_MIRROR_PROMOTION_REF/);
});

test("manual DataNest AI certification dispatch writes classification evidence before upload",()=>{
  assert.match(
    certification,
    /if \[ "\$EVENT_NAME" = "workflow_dispatch" \]; then[\s\S]*reason=manual_dispatch[\s\S]*certification-artifacts\/datanest-ai-classification\.json[\s\S]*reason:"manual_dispatch"[\s\S]*exit 0/
  );
  assert.match(
    certification,
    /name: Preserve classification evidence[\s\S]*path: certification-artifacts\/datanest-ai-classification\.json[\s\S]*if-no-files-found: error/
  );
});
