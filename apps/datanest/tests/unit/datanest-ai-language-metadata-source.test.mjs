import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("chat intake records declared language provenance without treating it as comprehension",()=>{
  const source=read("supabase/functions/datanest-ai-chat/index.ts");
  assert.match(source,/buildEvidenceLanguageMetadata/);
  assert.match(source,/hasOwnProperty\.call\(body,"sourceLanguage"\)/);
  assert.match(source,/declaredBasis:"user_declared"/);
  assert.match(source,/\.\.\.inputLanguageMetadata/);
  assert.match(source,/buildEvidenceLanguageMetadata\(\{content:provider\.content\}\)/);
});

test("external AI intake validates and preserves language metadata across idempotent replay",()=>{
  const source=read("supabase/functions/datanest-ai-intake/index.ts");
  assert.match(source,/declaredBasis:"user_declared_for_external_evidence"/);
  assert.match(source,/external AI evidence is already staged with different language metadata/i);
  assert.match(source,/\.\.\.sourceLanguageMetadata/);
});

test("file-derived evidence records review metadata without claiming detected language",()=>{
  const source=read("supabase/functions/_shared/datanestFileAnalysisRuntime.ts");
  assert.match(source,/buildEvidenceLanguageMetadata\(\{content:proposition\.text\}\)/);
});

test("language metadata helper keeps missing source language absent",()=>{
  const source=read("supabase/functions/_shared/datanestLanguageMetadata.ts");
  assert.match(source,/language_metadata_status:provided\?"declared":"not_supplied"/);
  assert.match(source,/metadata\.source_language=sourceLanguage/);
  assert.doesNotMatch(source,/detectLanguage|language_detector|languageDetection/i);
});
