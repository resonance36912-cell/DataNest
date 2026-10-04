// Current-main convergence guard.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const chatPath=path.join(root,"supabase/functions/datanest-ai-chat/index.ts");
const intakePath=path.join(root,"supabase/functions/datanest-ai-intake/index.ts");
const migrationPath=path.join(
  root,
  "supabase/staging-migrations/20260927164500_enforce_datanest_ai_intake_append_only.sql"
);
const acceptancePath=path.join(root,"tests/sql/datanest_ai_staging_acceptance.sql");

function intakeMutationPattern(){
  return /\.from\("ai_intake_events"\)[\s\S]{0,240}?\.update\(/;
}

test("DataNest AI intake writers are append-only after event creation",()=>{
  const chat=fs.readFileSync(chatPath,"utf8");
  const intake=fs.readFileSync(intakePath,"utf8");

  assert.doesNotMatch(chat,intakeMutationPattern());
  assert.doesNotMatch(intake,intakeMutationPattern());
  assert.match(chat,/learning_eligible:finalLearningEligible/);
  assert.match(intake,/learning_eligible:learningEligible/);
});

test("staging migration preserves service-role intake inserts but removes mutation authority",()=>{
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    "append-only intake migration must exist"
  );
  const migration=fs.readFileSync(migrationPath,"utf8");

  assert.match(
    migration,
    /revoke\s+update\s*,\s*delete\s*,\s*truncate\s+on\s+table\s+public\.ai_intake_events\s+from\s+service_role/i
  );
  assert.match(
    migration,
    /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.ai_intake_events\s+to\s+service_role/i
  );
});

test("staging acceptance proves service-role insert and mutation denial transactionally",()=>{
  const acceptance=fs.readFileSync(acceptancePath,"utf8");

  assert.match(acceptance,/has_table_privilege\('service_role','public\.ai_intake_events','INSERT'\)/);
  assert.match(acceptance,/has_table_privilege\('service_role','public\.ai_intake_events','UPDATE'\)/);
  assert.match(acceptance,/has_table_privilege\('service_role','public\.ai_intake_events','DELETE'\)/);
  assert.match(acceptance,/has_table_privilege\('service_role','public\.ai_intake_events','TRUNCATE'\)/);
  assert.match(acceptance,/set\s+local\s+role\s+service_role/i);
  assert.match(acceptance,/insert\s+into\s+public\.ai_intake_events/i);
  assert.match(acceptance,/rollback/i);
  assert.doesNotMatch(acceptance,/\bdo \$\s*\n/i);
  assert.doesNotMatch(acceptance,/\bas \$\s*\n/i);
  assert.match(acceptance,/\bdo \$datanest\$\s*\nbegin[\s\S]*service_role must retain append-only INSERT access/i);
  assert.match(acceptance,/create function pg_temp\.assert_datanest_intake_mutations_denied[\s\S]*\bas \$datanest\$\s*\nbegin/i);
});
