import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../../supabase/functions/send-job-invite/index.ts",import.meta.url),"utf8");
const config=readFileSync(new URL("../../supabase/config.toml",import.meta.url),"utf8");
const validation=readFileSync(new URL("../../.github/workflows/edge-function-validation.yml",import.meta.url),"utf8");

test("send-job-invite remains canonical, authenticated, and validated",()=>{
  assert.match(source,/Deno\.serve/);
  assert.match(source,/resolve_auth_user_id_by_email/);
  assert.match(source,/register_job_invite/);
  assert.match(source,/Operator access is required/);
  assert.match(source,/Invite rate limit reached/);
  assert.match(config,/\[functions\.send-job-invite\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(validation,/\n\s*- send-job-invite\n/);
});
