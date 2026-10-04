import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const sourcePath="supabase/functions/send-job-invite/index.ts";
const uiPath="src/components/JobInviteForm.tsx";

test("send-job-invite production source remains canonical",()=>{
  assert.equal(existsSync(sourcePath),true,"send-job-invite source must exist in canonical repository");
  const source=readFileSync(sourcePath,"utf8");
  const ui=readFileSync(uiPath,"utf8");
  assert.match(ui,/functions\.invoke\("send-job-invite"/);
  assert.match(source,/Deno\.serve/);
  assert.match(source,/register_job_invite/);
  assert.match(source,/resolve_auth_user_id_by_email/);
  assert.match(source,/project_members/);
});
