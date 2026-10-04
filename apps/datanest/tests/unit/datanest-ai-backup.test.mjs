import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptBackup,
  decryptBackup,
  validateRestoreRefs
} from "../../scripts/lib/encrypted-backup.mjs";
import { assertDedicatedDataNestAiStaging } from "../../scripts/lib/datanest-ai-staging-environment.mjs";

test("staging backup encryption round-trips and does not expose plaintext", () => {
  const key=Buffer.alloc(32,7);
  const plaintext=Buffer.from(JSON.stringify({events:[{content:"sensitive raw input"}]}));
  const encrypted=encryptBackup(plaintext,key);
  assert.equal(encrypted.includes("sensitive raw input"),false);
  assert.deepEqual(decryptBackup(encrypted,key),plaintext);
});


test("staging backup decryption rejects shortened GCM authentication tags", () => {
  const key=Buffer.alloc(32,7);
  const envelope=JSON.parse(encryptBackup(Buffer.from("evidence"),key));
  envelope.tag=Buffer.from(envelope.tag,"base64").subarray(0,12).toString("base64");
  assert.throws(
    () => decryptBackup(JSON.stringify(envelope),key),
    /authentication tag must be exactly 16 bytes/i
  );
});


test("replacement staging project can restore an original staging backup", () => {
  assert.doesNotThrow(() => validateRestoreRefs({
    backupSourceRef:"staging-original",
    expectedSourceRef:"staging-original",
    targetRef:"staging-replacement",
    configuredStagingRef:"staging-replacement",
    productionRef:"production"
  }));
});

test("restore ref validation still rejects production and source mismatches", () => {
  assert.throws(() => validateRestoreRefs({
    backupSourceRef:"staging-original",
    expectedSourceRef:"staging-original",
    targetRef:"production",
    configuredStagingRef:"production",
    productionRef:"production"
  }),/production/i);
  assert.throws(() => validateRestoreRefs({
    backupSourceRef:"wrong-source",
    expectedSourceRef:"staging-original",
    targetRef:"staging-replacement",
    configuredStagingRef:"staging-replacement",
    productionRef:"production"
  }),/source/i);
});


test("staging backup environment requires the canonical dedicated project and origin",()=>{
  assert.deepEqual(
    assertDedicatedDataNestAiStaging({
      url:"https://qchttpcyqlqnhvahprhz.supabase.co/",
      projectRef:"qchttpcyqlqnhvahprhz"
    }),
    {url:"https://qchttpcyqlqnhvahprhz.supabase.co",projectRef:"qchttpcyqlqnhvahprhz"}
  );
  assert.throws(()=>assertDedicatedDataNestAiStaging({
    url:"https://sgqdmfgjbprsoqsmgigi.supabase.co",projectRef:"sgqdmfgjbprsoqsmgigi"
  }),/must not target the production project/i);
  assert.throws(()=>assertDedicatedDataNestAiStaging({
    url:"https://evil.example.com",projectRef:"qchttpcyqlqnhvahprhz"
  }),/canonical dedicated staging origin/i);
  assert.throws(()=>assertDedicatedDataNestAiStaging({
    url:"https://qchttpcyqlqnhvahprhz.supabase.co",projectRef:"foreign-staging-project"
  }),/dedicated staging project/i);
});
