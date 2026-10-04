import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../../src/components/AdminRndModeToggle.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../supabase/migrations/20261001035708_enforce_mirror_product_surface_release_identity.sql",import.meta.url),"utf8");

test("Mirror Product Lab lookup is keyed by exact release and build identity",()=>{
  assert.match(source,/\.eq\("build_commit",manifest\.commit\)/);
  assert.match(source,/\.eq\("release_id",manifest\.releaseId\)/);
  assert.doesNotMatch(source,/\.from\("product_surfaces"\)\s*\n\s*\.update\(surfacePayload\)/);
});

test("Mirror Product Lab identity is append-only and race-safe",()=>{
  assert.match(source,/insertError\.code==="23505"/);
  assert.match(source,/immutable surface/);
  assert.match(migration,/create unique index if not exists product_surfaces_mirror_release_identity_idx/);
  assert.match(migration,/where name = 'Mirror-DataNest Production Candidate'/);
});
