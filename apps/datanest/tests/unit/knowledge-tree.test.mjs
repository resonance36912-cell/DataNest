import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeed,
  buildOptimizationCandidates,
  categorize,
  dedupeItems
} from "../../scripts/knowledge-tree.mjs";

const categories={
  security:["security","auth"],
  maintenance:["cleanup","streamline"],
  testing:["test","verify"]
};

test("categorizes repository evidence deterministically",()=>{
  assert.deepEqual(categorize("Security auth cleanup",categories),["security","maintenance"]);
  assert.deepEqual(categorize("Unrelated copy edit",categories),["other"]);
});

test("deduplicates exact evidence while preserving newest-first order",()=>{
  const items=[
    {id:"a",evidenceHash:"x",observedAt:"2026-10-01T00:00:00Z"},
    {id:"b",evidenceHash:"y",observedAt:"2026-10-01T02:00:00Z"},
    {id:"c",evidenceHash:"x",observedAt:"2026-10-01T03:00:00Z"}
  ];
  assert.deepEqual(dedupeItems(items).map((item)=>item.id),["b","a"]);
});

test("feeds remain provisional and target-filtered",()=>{
  const feed=buildFeed({
    target:"mirror",
    generatedAt:"2026-10-01T00:00:00Z",
    categories:["testing"],
    items:[
      {id:"1",categories:["testing"]},
      {id:"2",categories:["security"]}
    ]
  });
  assert.equal(feed.productionAuthorization,false);
  assert.equal(feed.certifiedMemory,false);
  assert.deepEqual(feed.items.map((item)=>item.id),["1"]);
});

test("repeated categories become review-required optimization candidates",()=>{
  const candidates=buildOptimizationCandidates([
    {categories:["maintenance"]},
    {categories:["maintenance"]},
    {categories:["other"]}
  ]);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].category,"maintenance");
  assert.equal(candidates[0].authority,"review_required");
});
