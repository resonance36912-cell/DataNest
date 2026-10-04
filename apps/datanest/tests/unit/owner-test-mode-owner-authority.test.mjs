import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pages=readFileSync(
  new URL("../../.github/workflows/pages.yml",import.meta.url),
  "utf8"
);

test("Pages production uses the protected environment instead of Owner Test Mode checks",()=>{
  assert.match(pages,/environment:\n      name: github-pages/);
  assert.doesNotMatch(pages,/GITHUB_REPOSITORY_OWNER/);
  assert.equal(pages.includes("collaborators/$GITHUB_ACTOR/permission"),false);
  assert.doesNotMatch(pages,/Owner Test Mode authority verified from repository ownership/);
});

