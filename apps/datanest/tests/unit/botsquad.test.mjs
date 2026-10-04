import test from "node:test";
import assert from "node:assert/strict";
import { buildBotWorkOrder, consolidateFeeds, normalizeAiResult } from "../../scripts/botsquad-orchestrator.mjs";

const bot={id:"ux-ease",branch:"automation/botsquad/ux-ease",purpose:"Reduce UX friction."};

test("BOTSQUAD work orders remain advisory and derive Knowledge categories",()=>{
  const order=buildBotWorkOrder(bot,{items:[
    {categories:["ux","testing"]},
    {categories:["ux"]}
  ],optimizationCandidates:[{category:"ux"}]},{findings:[{dimension:"runtime"}]});
  assert.equal(order.authority,"advisory");
  assert.equal(order.productionAuthorization,false);
  assert.equal(order.bot.id,"ux-ease");
  assert.equal(order.context.strongestKnowledgeCategories[0].category,"ux");
  assert.equal(order.context.strongestKnowledgeCategories[0].count,2);
});

test("AI results cannot elevate BOTSQUAD authority",()=>{
  const order=buildBotWorkOrder(bot,{},{});
  const feed=normalizeAiResult(order,{recommendations:["x"],uxEaseFeed:["y"],functionEvolutionFeed:["z"]});
  assert.equal(feed.authority,"advisory");
  assert.equal(feed.productionAuthorization,false);
  assert.deepEqual(feed.uxEaseFeed,["y"]);
});

test("consolidated feed preserves non-authorizing status",()=>{
  const feed=consolidateFeeds([
    {bot:{id:"ux-ease"},recommendations:["r"],uxEaseFeed:["u"],functionEvolutionFeed:[],risks:[]}
  ],"mirror");
  assert.equal(feed.target,"mirror");
  assert.equal(feed.productionAuthorization,false);
  assert.deepEqual(feed.sourceBots,["ux-ease"]);
});

test("BOTSQUAD work orders carry REGULATOR requirements without authority escalation",()=>{
  const order=buildBotWorkOrder(bot,{},{},{
    status:"attention",
    requirements:[{id:"req-1",title:"Audit runtime"}],
    instructions:["Audit","Stress-test"]
  });
  assert.equal(order.context.regulatorStatus,"attention");
  assert.equal(order.context.regulatorRequirementCount,1);
  assert.equal(order.context.regulatorRequirements[0].id,"req-1");
  assert.equal(order.productionAuthorization,false);
});
