import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Removing or moving the mask below GITHUB_ENV must fail this security guard.
test("generated staging passwords are masked before export to later CI steps",()=>{
  const workflow=fs.readFileSync(new URL("../../.github/workflows/datanest-ai-certification.yml",import.meta.url),"utf8");
  const block=workflow.match(/- name: Create ephemeral governed E2E credentials\r?\n[\s\S]*?(?=\r?\n      - name:)/)?.[0];
  assert.ok(block,"Credential generation step must exist");
  const mask=block.indexOf('echo "::add-mask::$PASSWORD"');
  const exported=block.indexOf('echo "DATANEST_AI_E2E_PASSWORD=$PASSWORD" >> "$GITHUB_ENV"');
  assert.ok(mask>=0&&exported>mask,"Mask the generated password before exporting it to GITHUB_ENV");
});
