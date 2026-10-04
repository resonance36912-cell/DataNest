import test from "node:test";
import assert from "node:assert/strict";
import { buildSuggesterFeed } from "../../scripts/suggester-engine.mjs";

const config={automationClasses:{autonomousSafe:["heal-redundant-branches","heal-byte-safe-source-noise"]},controls:{mayMutateCanonicalMain:false}};

const generatedAt="2026-10-01T10:00:00Z";
function buildFeed(input){
  const schemas={guardian:"guardian-snapshot",knowledge:"knowledge-feed",environment:"environment-feed",enforcer:"enforcer-assessment",botsquad:"botsquad-consolidated-feed",conductor:"conductor-state",calmer:"calmer-feed",regulator:"regulator-state",visibility:"visibility-utility-feed"};
  const sources=Object.fromEntries(Object.entries(schemas).map(([key,schema])=>[key,{
    schemaVersion:"datanest-"+schema+"-v1",productionAuthorization:false,generatedAt,
    ...(key==="visibility"?{seoScore:90,visibilityScore:90,missingInputs:[],routes:[]}:{}),
    ...input[key]
  }]));
  return buildSuggesterFeed({...input,...sources,generatedAt});
}

function safeInputs(){
  return {config,
    guardian:{status:"healing",headSha:"a".repeat(40),observed:{branches:{redundantBranchCount:1,redundantBranches:["merged-a"]},source:{safeRefinementCount:0}},drift:{optimalConditionDrift:[]}},
    knowledge:{itemCount:1},environment:{environmentCompatible:true},enforcer:{status:"pass"},
    botsquad:{recommendations:[]},conductor:{allProcessesFresh:true,headSha:"a".repeat(40)},
    calmer:{tier:"STONE",gateSoftening:[]},regulator:{status:"harmonized",requirements:[]},
    visibility:{seoScore:90,visibilityScore:90,missingInputs:[],routes:[]}};
}

test("SUGGESTER suppresses automation for blocked, stale, unsynchronized or wrong-source evidence",()=>{
  assert.equal(buildFeed(safeInputs()).commands.length,1);
  for(const overrides of [
    {enforcer:{status:"block"}},
    {enforcer:{status:"pass",generatedAt:"2026-09-01T00:00:00Z"}},
    {conductor:{allProcessesFresh:false}},
    {environment:{environmentCompatible:false}},
    {guardian:{...safeInputs().guardian,status:"critical"}},
    {headSha:"b".repeat(40)}
  ]){
    const feed=buildFeed({...safeInputs(),...overrides});
    assert.equal(feed.automationReady,false);
    assert.equal(feed.commands.length,0);
  }
});

test("equivalent observations keep fingerprints across pulses but changed branch evidence differs",()=>{
  const first=buildFeed(safeInputs());
  const laterInputs=safeInputs(); laterInputs.guardian.generatedAt="2026-10-01T09:59:00Z";
  assert.equal(buildFeed(laterInputs).commands[0].fingerprint,first.commands[0].fingerprint);
  laterInputs.guardian.observed.branches.redundantBranches=["merged-b"];
  assert.notEqual(buildFeed(laterInputs).commands[0].fingerprint,first.commands[0].fingerprint);
  assert.match(first.sourceEvidence.guardian.digest,/^sha256:[a-f0-9]{64}$/);
});

test("missing feeds create visible evidence-repair suggestions with no commands",()=>{
  const feed=buildSuggesterFeed({config,generatedAt});
  assert.equal(feed.commands.length,0);
  assert.equal(feed.suggestions.filter(x=>x.type==="source-evidence").length,9);
});

test("SUGGESTER queues only allowlisted safe healing signals",()=>{
  const feed=buildFeed({
    config,
    guardian:{
      status:"healing",
      health:{score:96},
      observed:{
        branches:{redundantBranchCount:2,redundantBranches:["old-a","old-b"]},
        source:{safeRefinementCount:1,safeRefinements:[{file:"a.ts"}]}
      },
      drift:{optimalConditionDrift:[]}
    },
    knowledge:{itemCount:10},
    environment:{environmentCompatible:true,reviewRequired:[]},
    enforcer:{status:"pass",blockers:[],reviews:[]},
    botsquad:{schemaVersion:"datanest-botsquad-consolidated-feed-v1",recommendations:[],uxEaseFeed:[],functionEvolutionFeed:[]},
    conductor:{allProcessesFresh:true}
  });
  assert.equal(feed.commands.length,2);
  assert.deepEqual(feed.commands.map(x=>x.actionId).sort(),[
    "heal-byte-safe-source-noise","heal-redundant-branches"
  ]);
  assert.equal(feed.productionAuthorization,false);
});

test("SUGGESTER keeps blueprint, security and BOTSQUAD changes review-required",()=>{
  const feed=buildFeed({
    config,
    guardian:{
      status:"degraded",
      health:{score:80},
      observed:{
        branches:{redundantBranchCount:0},
        source:{
          safeRefinementCount:0,
          redundancyCandidates:[{severity:"medium",category:"code-structure",code:"long_function",file:"x.mjs"}]
        }
      },
      drift:{optimalConditionDrift:[{control:"environment",dimension:"runtime",expected:"compatible",observed:"review"}]}
    },
    knowledge:{itemCount:10,optimizationCandidates:[{category:"maintenance"}]},
    environment:{environmentCompatible:false,reviewRequired:[{dimension:"runtime"}]},
    enforcer:{status:"block",blockers:["security-workflow-failure"],reviews:[]},
    botsquad:{
      schemaVersion:"datanest-botsquad-consolidated-feed-v1",
      recommendations:["Simplify navigation"],
      uxEaseFeed:["Reduce clicks"],
      functionEvolutionFeed:["Add shortcut"]
    },
    conductor:{allProcessesFresh:false}
  });
  assert.equal(feed.commands.length,0);
  assert.ok(feed.suggestions.length>=7);
  assert.ok(feed.suggestions.some(x=>x.type==="code-streamlining"));
  assert.ok(feed.suggestions.every(x=>x.automationClass==="review-required"));
});

test("SUGGESTER deduplicates equivalent suggestions by fingerprint",()=>{
  const feed=buildFeed({
    config,
    guardian:{status:"healthy",health:{score:100},observed:{branches:{redundantBranchCount:0},source:{safeRefinementCount:0}},drift:{optimalConditionDrift:[]}},
    knowledge:{itemCount:10},
    environment:{environmentCompatible:true,reviewRequired:[]},
    enforcer:{status:"pass",blockers:[],reviews:[]},
    botsquad:{
      schemaVersion:"datanest-botsquad-consolidated-feed-v1",
      recommendations:["Same","Same"],
      uxEaseFeed:[],
      functionEvolutionFeed:[]
    },
    conductor:{allProcessesFresh:true}
  });
  assert.equal(feed.suggestions.filter(x=>x.type==="ai-optimization").length,1);
});

test("SUGGESTER exposes VISIBILITY-UTILITY market routes as review-required",()=>{
  const feed=buildFeed({
    ...safeInputs(),
    guardian:{...safeInputs().guardian,observed:{branches:{redundantBranchCount:0},source:{safeRefinementCount:0}}},
    visibility:{
      seoScore:92,
      visibilityScore:88,
      missingInputs:["local-trends"],
      routes:[{
        id:"owned-search-content",
        label:"Owned search + public evidence",
        opportunityScore:84,
        confidence:"medium",
        projectedOutcome:{basis:"scenario-relative-index",currentBaselineIndex:100,reachIndex:118},
        implementationClass:"review-required"
      }]
    }
  });
  assert.ok(feed.suggestions.some(x=>x.type==="route-to-market"));
  assert.ok(feed.suggestions.some(x=>x.type==="market-evidence"));
  assert.ok(feed.suggestions.filter(x=>x.source==="visibility-utility").every(x=>x.automationClass==="review-required"));
});
