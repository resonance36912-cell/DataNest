import test from "node:test";
import assert from "node:assert/strict";
import { buildLibertyIndexes, isSensitivePath } from "../../scripts/liberty-in-all-indexer.mjs";

const config={
  canonicalPublicUrl:"https://datanest-supository.github.io/DataNest/",
  scope:{
    roots:["docs","public/transparency","config","liberty-in-all"],
    extensions:[".md",".json"],
    excludePrefixes:[],
    publicIndexRoots:["docs/","public/transparency/","liberty-in-all/"],
    publicConfigAllowlist:["config/liberty-in-all.standard.json"],
    sensitivePatterns:["(^|/)\\.env($|\\.)","secret","credential","private[-_]?key","access[-_]?token","password"]
  },
  evidenceSources:["docs/charter.md","config/liberty-in-all.standard.json"],
  audiences:{public:"safe",auditors:"traceable",regulators:"traceable"},
  standardsAlignment:[{id:"W3C-PROV",certificationClaim:false}],
  controls:{publishRecordContents:false,publishSecrets:false,merge:false,deployProduction:false},
  retention:{workflowArtifactsDays:90}
};

test("LIBERTY-IN-ALL detects sensitive path names",()=>{
  assert.equal(isSensitivePath("docs/secret-rotation.md",config),true);
  assert.equal(isSensitivePath("docs/public-charter.md",config),false);
});

test("public index contains digests and safe metadata but excludes sensitive records",()=>{
  const files=[
    {path:"docs/charter.md",content:"public charter"},
    {path:"docs/secret-rotation.md",content:"do not publish"},
    {path:"config/liberty-in-all.standard.json",content:"{}"}
  ];
  const {state,internalIndex,publicIndex}=buildLibertyIndexes({
    config,files,headSha:"abc123",generatedAt:"2026-10-01T10:00:00Z"
  });
  assert.equal(state.productionAuthorization,false);
  assert.equal(internalIndex.records.length,2);
  assert.equal(internalIndex.records.some(x=>x.path.includes("secret")),false);
  assert.equal(internalIndex.restrictedRecordCount,1);
  assert.match(internalIndex.restrictedEvidenceDigest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(publicIndex.records.some(x=>x.path.includes("secret")),false);
  assert.ok(publicIndex.records.every(x=>x.digest.startsWith("sha256:")));
  assert.equal(publicIndex.disclosure.recordContentsPublished,false);
});

test("missing evidence is visible rather than fabricated",()=>{
  const {state}=buildLibertyIndexes({
    config,files:[{path:"docs/charter.md",content:"x"}],headSha:"abc",generatedAt:"2026-10-01T10:00:00Z"
  });
  assert.equal(state.status,"attention");
  assert.deepEqual(state.missingEvidenceSources,["config/liberty-in-all.standard.json"]);
});
