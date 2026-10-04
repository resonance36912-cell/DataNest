import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("direct npm dependencies are exact-pinned",()=>{
  const pkg=JSON.parse(readFileSync("package.json","utf8"));
  const direct={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  const exact=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  for(const [name,version] of Object.entries(direct)){
    assert.match(version,exact,name+" must be exact-pinned");
  }
});

test("security workflow carries dependency review and SBOM controls",()=>{
  const workflow=readFileSync(".github/workflows/security-scan.yml","utf8");
  assert.match(workflow,/security:supply-chain/);
  assert.match(workflow,/npm audit --audit-level=high/);
  assert.match(workflow,/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294/);
  assert.match(workflow,/fail-on-severity: high/);
  assert.match(workflow,/anchore\/sbom-action@e22c389904149dbc22b58101806040fa8d37a610/);
  assert.match(workflow,/datanest-sbom-/);
});
