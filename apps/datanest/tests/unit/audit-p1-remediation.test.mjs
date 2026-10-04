import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  replayContentMatches,
  chronologicalFromNewestFirst
} from "../../supabase/functions/_shared/datanestAiContinuity.ts";

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");

test("external AI replay accepts A/A and rejects A/B",()=>{
  assert.equal(replayContentMatches("hash-a","hash-a"),true);
  assert.equal(replayContentMatches("hash-a","hash-b"),false);
  assert.equal(replayContentMatches("","hash-b"),false);
});

test("recent AI context keeps the latest 100 events and restores chronological order",()=>{
  const all=Array.from({length:130},(_,index)=>({id:index+1}));
  const databaseNewestFirst=[...all].reverse().slice(0,100);
  const context=chronologicalFromNewestFirst(databaseNewestFirst);
  assert.equal(context.length,100);
  assert.equal(context[0].id,31);
  assert.equal(context.at(-1).id,130);
  assert.equal(context.some(item=>item.id===125),true);
  assert.equal(context.some(item=>item.id===1),false);
});

test("chat source queries newest events before applying the bounded context window",()=>{
  const source=fs.readFileSync(
    path.join(repoRoot,"supabase/functions/datanest-ai-chat/index.ts"),
    "utf8"
  );
  assert.match(source,/\.order\("created_at",\{ascending:false\}\)\s*\.limit\(100\)/);
  assert.match(source,/chronologicalFromNewestFirst/);
});

test("linked external AI replay verifies staged content before returning idempotent success",()=>{
  const source=fs.readFileSync(
    path.join(repoRoot,"supabase/functions/datanest-ai-intake/index.ts"),
    "utf8"
  );
  const hashIndex=source.indexOf("const contentHash=await sha256Text(content)");
  const replayIndex=source.indexOf("if(session.staging_event_id)");
  const matchIndex=source.indexOf("replayContentMatches",replayIndex);
  assert.ok(hashIndex>=0&&replayIndex>hashIndex,"content must be hashed before linked replay");
  assert.ok(matchIndex>replayIndex,"linked replay must compare content identity");
});

test("Think Tank ignores responses from superseded thread loads",()=>{
  const source=fs.readFileSync(
    path.join(repoRoot,"src/components/ThinkTankWorkspace.tsx"),
    "utf8"
  );
  assert.match(source,/threadLoadGeneration=useRef\(0\)/);
  assert.match(source,/requestGeneration=\+\+threadLoadGeneration\.current/);
  assert.match(source,/if\(requestGeneration!==threadLoadGeneration\.current\)return/);
});

test("Pages publication runs unit tests before type checking and build",()=>{
  const source=fs.readFileSync(
    path.join(repoRoot,".github/workflows/pages.yml"),
    "utf8"
  );
  const tests=source.indexOf("- run: npm test");
  const check=source.indexOf("- run: npm run check");
  const build=source.indexOf("- run: npm run build");
  assert.ok(tests>=0&&check>tests&&build>check);
});
