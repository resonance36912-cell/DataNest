import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/reson8Adt.ts"), "utf8");
const doc = fs.readFileSync(path.join(root, "docs/RESON8_ADT_IMPLEMENTATION.md"), "utf8");

test("JOB-00010 defines the required ADT capabilities", () => {
  for (const key of ["repository","command_runner","browser_runtime","desktop_connection","ai_chatbot","codex_functions"])
    assert.match(source, new RegExp('"'+key+'"'));
});

test("ADT keeps desktop control governed and non-autonomous", () => {
  assert.match(source, /desktop_connection/);
  assert.match(source, /autonomousExecutionAllowed/);
  assert.match(source, /key !== "desktop_connection"/);
  assert.match(doc, /autonomous interactive remote control is deliberately not enabled/i);
});

test("ADT requires traceable Job Manifest identity for launch descriptors", () => {
  assert.match(source, /jobId: string/);
  assert.match(source, /traceKey: string/);
  assert.match(source, /if \(!input\.jobId \|\| !input\.traceKey\)/);
});

test("implementation artifact contains acceptance evidence requirements", () => {
  assert.match(doc, /npm run check/);
  assert.match(doc, /npm test/);
  assert.match(doc, /browser-test result/);
  assert.match(doc, /source commit SHA/);
});

test("implementation artifact preserves current DataNest authorities", () => {
  assert.match(doc, /GitHub is source\/CI\/evidence authority/);
  assert.match(doc, /Supabase is backend\/auth authority/);
  assert.match(doc, /GitHub Pages is the public delivery target/);
});
