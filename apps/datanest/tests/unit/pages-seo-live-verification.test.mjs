import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/pages.yml", "utf8");

test("live Pages SEO verification accepts canonical robots directive casing", () => {
  assert.match(workflow, /grep -qi '\^User-agent:' \/tmp\/datanest-robots\.txt/);
  assert.match(
    workflow,
    /grep -Fq 'Sitemap: https:\/\/datanest-supository\.github\.io\/DataNest\/sitemap\.xml' \/tmp\/datanest-robots\.txt/
  );
  assert.match(
    workflow,
    /<loc>https:\/\/datanest-supository\.github\.io\/DataNest\/assurance\/<\/loc>/
  );
});
