import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=fs.readFileSync(
  path.join(root,"supabase/functions/send-project-member-invite/index.ts"),
  "utf8"
);
const config=fs.readFileSync(
  path.join(root,"supabase/config.toml"),
  "utf8"
);
const pages=fs.readFileSync(
  path.join(root,".github/workflows/pages.yml"),
  "utf8"
);

test("project-member invite gateway resends unconfirmed invites and uses recovery for confirmed accounts",()=>{
  assert.match(source,/let delivery: \"invite\" \| \"reinvite\" \| \"recovery\"\s*=\s*\"invite\"/);
  assert.match(source,/admin\.getUserById/);
  assert.match(source,/!existingAuthUser\?\.email_confirmed_at[\s\S]{0,700}delivery\s*=\s*existingUserId \? \"reinvite\" : \"invite\"[\s\S]{0,700}admin\.inviteUserByEmail/);
  assert.match(source,/else \{[\s\S]{0,500}delivery\s*=\s*\"recovery\"[\s\S]{0,500}resetPasswordForEmail/);
  assert.doesNotMatch(source,/signInWithOtp/);
});

test("project-member invite gateway keeps the canonical Pages redirect",()=>{
  assert.match(
    source,
    /const redirectTo\s*=\s*\"https:\/\/datanest-supository\.github\.io\/DataNest\/\";/
  );
});

test("project-member invite gateway requires authenticated callers and bounded roles",()=>{
  assert.match(source,/callerClient\.auth\.getUser\(\)/);
  assert.match(source,/\[\"admin\",\s*\"operator\",\s*\"viewer\"\]/);
  assert.match(source,/callerMembership\.status\s*!==\s*\"active\"/);
  assert.match(source,/\[\"owner\",\s*\"admin\"\]\.includes\(callerMembership\.role\)/);
});

test("project-member invite function remains JWT-protected and Pages-aligned",()=>{
  assert.match(config,/\[functions\.send-project-member-invite\][\s\S]*verify_jwt\s*=\s*true/);
  assert.ok(pages.includes("DATANEST_EDGE_PROJECT_INVITES: send-project-member-invite@3"));
});
