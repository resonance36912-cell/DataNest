import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const contract=JSON.parse(
  fs.readFileSync("config/production-contract.json","utf8")
);

test("production contract tracks the live migration head and historical lineage",()=>{
  assert.equal(
    contract.supabase.expectedMigration.head,
    "20261002101955"
  );
  assert.equal(
    contract.supabase.expectedMigration.name,
    "harden_provider_sync_secret_boundary"
  );
  const lineage=contract.supabase.migrationLineage||[];
  assert.ok(
    lineage.some((entry)=>
      entry.databaseHead==="20261001142117" &&
      entry.repositoryEquivalentMigration==="20261001170000_certification_business_bank_settlement_launch.sql"
    )
  );
  assert.ok(
    fs.existsSync("supabase/migrations/20261001170000_certification_business_bank_settlement_launch.sql")
  );
  assert.ok(
    fs.existsSync("supabase/migrations/20261002101924_harden_external_audit_write_boundaries.sql")
  );
  assert.ok(
    fs.existsSync("supabase/migrations/20261002101955_harden_provider_sync_secret_boundary.sql")
  );
});
