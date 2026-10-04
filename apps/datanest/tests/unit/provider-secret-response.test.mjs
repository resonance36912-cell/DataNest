import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const edgeSource=fs.readFileSync(
  "supabase/functions/manage-ai-provider-v2/index.ts",
  "utf8"
);

const productionContract=JSON.parse(
  fs.readFileSync("config/production-contract.json","utf8")
);
const syncMigration=fs.readFileSync(
  productionContract.supabase.expectedMigration.sourceFile,
  "utf8"
);

test("provider-management responses strip decrypted credentials at the browser boundary",()=>{
  assert.match(
    edgeSource,
    /function publicConnection\(value:unknown\)\{[\s\S]*const \{secret:_secret,\.\.\.safe\}=value/
  );
  assert.match(edgeSource,/connection:publicConnection\(connection\)/);
  assert.match(edgeSource,/connection:publicConnection\(\{[\s\S]*processing_region:personalProcessingRegion/);
  assert.doesNotMatch(
    edgeSource,
    /return json\(\{ok:true,[\s\S]{0,120}connection\},200,origin\)/
  );
});

test("shared-provider sync RPC never returns the Vault-decrypted credential",()=>{
  assert.doesNotMatch(
    syncMigration,
    /'secret',v\.decrypted_secret/
  );
  assert.match(
    syncMigration,
    /return \(\s*select jsonb_build_object\(\s*'id',c\.id,[\s\S]*'metadata',c\.metadata\s*\)/
  );
  assert.match(
    syncMigration,
    /revoke all on function public\.service_sync_shared_ai_provider_connection_v1\(uuid,uuid\)/
  );
});
