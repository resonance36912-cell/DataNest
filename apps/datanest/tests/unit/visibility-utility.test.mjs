import test from "node:test";
import assert from "node:assert/strict";
import { assessVisibility, modelRoutes, buildVisibilityState } from "../../scripts/visibility-utility.mjs";

const config={
  canonicalPublicUrl:"https://datanest-supository.github.io/DataNest/",
  routeToMarketChannels:[
    {id:"owned-search-content",label:"Owned search",baseOpportunity:80,costClass:"low",speed:"medium",requiresSpendApproval:false},
    {id:"paid-acquisition",label:"Paid",baseOpportunity:65,costClass:"variable",speed:"fast",requiresSpendApproval:true}
  ],
  controls:{
    mayPurchaseAdvertising:false,mayCommitMarketingSpend:false,mayChangePricing:false,
    mayMakeBindingSalesCommitments:false,mayPublishUnverifiedClaims:false
  }
};

function strongInput(){
  return {
    config,
    layoutSource:"title: 'DataNest', description: 'x', alternates: {canonical:'x'}, openGraph:{}, twitter:{}",
    robots:"User-agent: *\nAllow: /",
    sitemap:'<urlset><url><loc>https://datanest-supository.github.io/DataNest/</loc></url></urlset>',
    manifest:{name:"DataNest",start_url:"/DataNest/"},
    appContract:{contract:"reson8-app@1",status:"live"},
    catalog:{entries:[
      {type:"product-platform",deliveryPath:"/a"},
      {type:"app",deliveryUrl:"https://x.example"},
      {type:"service"},
      {type:"package-set"}
    ]},
    charterExists:true,
    transparencySource:"System Charter system-charter",
    globalTrends:{items:[{strength:80,relevance:90}]},
    localTrends:{items:[{strength:70,relevance:80}]},
    analytics:{sessions:1000},
    commercial:{},
    botsquad:{schemaVersion:"datanest-botsquad-consolidated-feed-v1",botCount:10},
    knowledge:{schemaVersion:"datanest-knowledge-feed-v1",itemCount:20},
    generatedAt:"2026-10-01T09:00:00Z"
  };
}

test("VISIBILITY-UTILITY scores discoverability and trend coverage from evidence",()=>{
  const result=assessVisibility(strongInput());
  assert.ok(result.seo.score>=90);
  assert.equal(result.platform.coveragePercent,100);
  assert.equal(result.trends.global.available,true);
  assert.equal(result.trends.local.available,true);
  assert.equal(result.inputs.analyticsAvailable,true);
});

test("route-to-market projections stay relative without commercial baseline",()=>{
  const input=strongInput();
  const assessment=assessVisibility(input);
  const routes=modelRoutes({config,assessment,commercial:{}});
  assert.equal(routes.productionAuthorization,false);
  assert.equal(routes.routes[0].projectedOutcome.basis,"scenario-relative-index");
  assert.equal(routes.routes[0].projectedOutcome.revenue,null);
  assert.equal(routes.routes.find(x=>x.id==="paid-acquisition").implementationClass,"human-review-required");
});

test("revenue projection requires explicitly supplied baseline and conversion evidence",()=>{
  const input=strongInput();
  const assessment=assessVisibility(input);
  const routes=modelRoutes({config,assessment,commercial:{baselineRevenue:100000,conversionRate:0.03}});
  assert.equal(routes.routes[0].projectedOutcome.revenue.basis,"provided-commercial-baseline");
});

test("missing market inputs are made visible instead of fabricated",()=>{
  const input={...strongInput(),globalTrends:{},localTrends:{},analytics:{},commercial:{}};
  const state=buildVisibilityState(input);
  assert.deepEqual(state.missingInputs.sort(),["analytics","commercial-baseline","global-trends","local-trends"].sort());
  assert.equal(state.productionAuthorization,false);
  assert.equal(state.controls.mayPublishUnverifiedClaims,false);
});

test("internal services and packages do not reduce public platform coverage",()=>{
  const result=assessVisibility(strongInput());
  assert.equal(result.platform.catalogEntries,4);
  assert.equal(result.platform.publicEligibleEntries,2);
  assert.equal(result.platform.publicDeliveryEntries,2);
  assert.equal(result.platform.coveragePercent,100);
});
