#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

async function readJson(filename,fallback={}){
  try{return JSON.parse(await readFile(filename,"utf8"));}catch{return fallback;}
}
async function readText(filename,fallback=""){
  try{return await readFile(filename,"utf8");}catch{return fallback;}
}
async function exists(filename){try{await access(filename);return true;}catch{return false;}}
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
const digest=value=>"sha256:"+createHash("sha256").update(JSON.stringify(value)).digest("hex");

function trendItems(feed){
  if(Array.isArray(feed)) return feed;
  if(Array.isArray(feed?.items)) return feed.items;
  if(Array.isArray(feed?.trends)) return feed.trends;
  return [];
}
function weightedTrendSignal(feed){
  const items=trendItems(feed);
  if(!items.length) return {available:false,count:0,score:0,top:[]};
  const scored=items.map(item=>{
    const strength=clamp(item?.strength ?? item?.score ?? item?.index ?? 50);
    const relevance=clamp(item?.relevance ?? 70);
    return {...item,_weighted:strength*(relevance/100)};
  }).sort((a,b)=>b._weighted-a._weighted);
  return {
    available:true,
    count:scored.length,
    score:Math.round(scored.slice(0,10).reduce((s,x)=>s+x._weighted,0)/Math.max(1,Math.min(10,scored.length))),
    top:scored.slice(0,10).map(({_weighted,...item})=>({...item,weightedScore:Math.round(_weighted)}))
  };
}

export function assessVisibility({
  config,layoutSource="",robots="",sitemap="",manifest={},appContract={},catalog={},
  charterExists=false,transparencySource="",globalTrends={},localTrends={},analytics={},commercial={},
  botsquad={},knowledge={},generatedAt=new Date().toISOString()
}){
  const checks=[];
  const add=(id,ok,weight,detail)=>checks.push({id,status:ok?"pass":"review",weight,earned:ok?weight:0,detail});

  add("title-metadata",/titles*:/.test(layoutSource),8,"Global title metadata is configured.");
  add("description-metadata",/descriptions*:/.test(layoutSource),8,"Global description metadata is configured.");
  add("canonical-metadata",/canonical|alternates/.test(layoutSource),8,"Canonical URL metadata is configured.");
  add("open-graph",/openGraph/.test(layoutSource),7,"Open Graph metadata is configured.");
  add("social-card",/twitter/.test(layoutSource),5,"Social card metadata is configured.");
  add("robots",robots.includes("User-agent:"),6,"Project robots guidance is published.");
  add("sitemap",/<urlset/.test(sitemap)&&sitemap.includes(config.canonicalPublicUrl),8,"Sitemap includes canonical DataNest routes.");
  add("web-app-manifest",manifest?.name==="DataNest"&&!!manifest?.start_url,5,"Web application manifest is published.");
  add("platform-contract",appContract?.contract==="reson8-app@1"&&appContract?.status==="live",8,"Reson8 public application contract is live.");
  add("public-charter",charterExists,10,"Public system charter exists.");
  add("transparency-link",/System Charter|system-charter/i.test(transparencySource),5,"Transparency UI links the public system charter.");

  const entries=Array.isArray(catalog?.entries)?catalog.entries:[];
  const publicEligibleEntries=entries.filter(item=>
    item?.publicDeliveryRequired===true ||
    item?.type==="product-platform" ||
    item?.type==="app"
  );
  const visibleEntries=publicEligibleEntries.filter(item=>item?.deliveryPath||item?.deliveryUrl);
  const platformCoverage=publicEligibleEntries.length?Math.round(visibleEntries.length/publicEligibleEntries.length*100):0;
  add("catalog-delivery-coverage",platformCoverage>=95,7,`${visibleEntries.length}/${publicEligibleEntries.length} intentionally public catalog entries expose a delivery path or URL.`);

  const globalSignal=weightedTrendSignal(globalTrends);
  const localSignal=weightedTrendSignal(localTrends);
  const analyticsAvailable=analytics&&Object.keys(analytics).length>0;
  const commercialAvailable=commercial&&Object.keys(commercial).length>0;
  const seoScore=Math.round(checks.reduce((s,x)=>s+x.earned,0)/Math.max(1,checks.reduce((s,x)=>s+x.weight,0))*100);
  const trendCoverage=[globalSignal.available,localSignal.available,analyticsAvailable,commercialAvailable].filter(Boolean).length/4;
  const visibilityScore=Math.round(seoScore*0.65+platformCoverage*0.20+Math.min(100,Number(botsquad?.botCount||0)*7)*0.05+Math.min(100,Number(knowledge?.itemCount||0))*0.10);

  return {
    generatedAt,
    seo:{score:seoScore,checks},
    platform:{
      catalogEntries:entries.length,
      publicEligibleEntries:publicEligibleEntries.length,
      publicDeliveryEntries:visibleEntries.length,
      coveragePercent:platformCoverage
    },
    trends:{global:globalSignal,local:localSignal},
    inputs:{
      analyticsAvailable,
      commercialAvailable,
      botsquadAvailable:botsquad?.schemaVersion==="datanest-botsquad-consolidated-feed-v1",
      knowledgeAvailable:knowledge?.schemaVersion==="datanest-knowledge-feed-v1",
      coveragePercent:Math.round(trendCoverage*100)
    },
    visibilityScore
  };
}

function confidenceLabel(coverage){
  return coverage>=0.8?"high":coverage>=0.5?"medium":"low";
}
function commercialProjection(commercial,reachIndex){
  const baseline=Number(commercial?.baselineRevenue||0);
  const conversion=Number(commercial?.conversionRate||0);
  if(!(baseline>0)||!(conversion>0)) return null;
  const lift=Math.max(0,(reachIndex-100)/100);
  return {
    basis:"provided-commercial-baseline",
    baselineRevenue:baseline,
    conversionRate:conversion,
    projectedRevenueIndexRange:[Math.round((1+lift*0.25)*100),Math.round((1+lift*0.70)*100)]
  };
}

export function modelRoutes({config,assessment,commercial={},generatedAt=new Date().toISOString()}){
  const coverage=Number(assessment?.inputs?.coveragePercent||0)/100;
  const confidence=confidenceLabel(coverage);
  const trendScore=Math.round(((assessment?.trends?.global?.score||0)+(assessment?.trends?.local?.score||0))/2);
  const routes=(config.routeToMarketChannels||[]).map(channel=>{
    const spendPenalty=channel.requiresSpendApproval?8:0;
    const opportunity=clamp(
      Number(channel.baseOpportunity||50)*0.55+
      Number(assessment.visibilityScore||0)*0.25+
      trendScore*0.20-spendPenalty
    );
    const reachIndex=Math.round(80+opportunity*0.45);
    const activationLow=Math.max(70,Math.round(75+opportunity*0.28));
    const activationHigh=Math.max(activationLow,Math.round(90+opportunity*0.50));
    return {
      id:channel.id,label:channel.label,costClass:channel.costClass,speed:channel.speed,
      opportunityScore:Math.round(opportunity),
      confidence,
      projectedOutcome:{
        basis:"scenario-relative-index",
        currentBaselineIndex:100,
        reachIndex,
        activationIndexRange:[activationLow,activationHigh],
        revenue:commercialProjection(commercial,reachIndex)
      },
      assumptions:[
        "No outcome is guaranteed.",
        confidence==="low"?"Historical/trend input coverage is limited; treat as directional only.":"Projection incorporates configured trend/analytics coverage.",
        channel.requiresSpendApproval?"Paid spend requires explicit human budget approval.":"No paid-spend authorization is implied."
      ],
      implementationClass:channel.requiresSpendApproval?"human-review-required":"review-required"
    };
  }).sort((a,b)=>b.opportunityScore-a.opportunityScore);

  return {
    schemaVersion:"datanest-route-to-market-v1",
    generatedAt,
    authority:"market-intelligence-advisory",
    productionAuthorization:false,
    confidence,
    routes,
    recommendedForConsideration:routes.slice(0,3).map(x=>x.id),
    controls:config.controls
  };
}

export function buildVisibilityState(input){
  const assessment=assessVisibility(input);
  const projections=modelRoutes({config:input.config,assessment,commercial:input.commercial,generatedAt:input.generatedAt});
  const missing=[];
  if(!assessment.trends.global.available) missing.push("global-trends");
  if(!assessment.trends.local.available) missing.push("local-trends");
  if(!assessment.inputs.analyticsAvailable) missing.push("analytics");
  if(!assessment.inputs.commercialAvailable) missing.push("commercial-baseline");
  return {
    schemaVersion:"datanest-visibility-utility-state-v1",
    generatedAt:input.generatedAt||new Date().toISOString(),
    authority:"visibility-market-intelligence-advisory",
    productionAuthorization:false,
    status:assessment.seo.score>=85&&assessment.platform.coveragePercent>=80?"ready":"attention",
    assessment,
    routeToMarket:projections,
    missingInputs:missing,
    controls:input.config.controls,
    evidenceDigest:digest({assessment,projections})
  };
}

async function main(){
  const config=await readJson("config/visibility-utility.tree.json",null);
  if(!config) throw new Error("Missing VISIBILITY-UTILITY config.");
  const generatedAt=new Date().toISOString();
  const state=buildVisibilityState({
    config,
    layoutSource:await readText("src/app/layout.tsx"),
    robots:await readText("public/robots.txt"),
    sitemap:await readText("public/sitemap.xml"),
    manifest:await readJson("public/site.webmanifest",{}),
    appContract:await readJson("public/.well-known/reson8-app.json",{}),
    catalog:await readJson("config/supository.catalog.json",{}),
    charterExists:await exists("docs/DATANEST_SYSTEM_CHARTER.md")&&await exists("src/app/system-charter/page.tsx"),
    transparencySource:await readText("src/components/TransparencyWorkspace.tsx"),
    globalTrends:await readJson(process.env.VISIBILITY_GLOBAL_TRENDS_PATH||"/tmp/visibility-utility/global-trends.json",{}),
    localTrends:await readJson(process.env.VISIBILITY_LOCAL_TRENDS_PATH||"/tmp/visibility-utility/local-trends.json",{}),
    analytics:await readJson(process.env.VISIBILITY_ANALYTICS_PATH||"/tmp/visibility-utility/analytics.json",{}),
    commercial:await readJson(process.env.VISIBILITY_COMMERCIAL_PATH||"/tmp/visibility-utility/commercial.json",{}),
    botsquad:await readJson(process.env.VISIBILITY_BOTSQUAD_PATH||"/tmp/visibility-utility/botsquad.json",{}),
    knowledge:await readJson(process.env.VISIBILITY_KNOWLEDGE_PATH||"/tmp/visibility-utility/knowledge.json",{}),
    generatedAt
  });
  await mkdir("visibility-utility/state",{recursive:true});
  await mkdir("visibility-utility/feeds",{recursive:true});
  await mkdir("visibility-utility/projections",{recursive:true});
  await mkdir("public/transparency/visibility-utility",{recursive:true});
  await writeFile("visibility-utility/state/latest.json",JSON.stringify(state,null,2)+"\n");
  await writeFile("visibility-utility/feeds/datanest.json",JSON.stringify({
    schemaVersion:"datanest-visibility-utility-feed-v1",
    generatedAt:state.generatedAt,authority:state.authority,productionAuthorization:false,status:state.status,
    seoScore:state.assessment.seo.score,visibilityScore:state.assessment.visibilityScore,
    platformCoveragePercent:state.assessment.platform.coveragePercent,
    missingInputs:state.missingInputs,
    recommendedForConsideration:state.routeToMarket.recommendedForConsideration,
    routes:state.routeToMarket.routes.slice(0,5)
  },null,2)+"\n");
  await writeFile("visibility-utility/projections/route-to-market.json",JSON.stringify(state.routeToMarket,null,2)+"\n");
  await writeFile("public/transparency/visibility-utility/latest.json",JSON.stringify({
    schemaVersion:"datanest-visibility-utility-transparency-v1",
    generatedAt:state.generatedAt,status:state.status,
    productionAuthorization:false,seoScore:state.assessment.seo.score,
    visibilityScore:state.assessment.visibilityScore,
    platformCoveragePercent:state.assessment.platform.coveragePercent,
    missingInputs:state.missingInputs,
    routeToMarket:state.routeToMarket.routes.slice(0,5).map(x=>({
      id:x.id,label:x.label,opportunityScore:x.opportunityScore,confidence:x.confidence,
      projectedOutcome:x.projectedOutcome,implementationClass:x.implementationClass
    }))
  },null,2)+"\n");
  process.stdout.write(JSON.stringify({
    status:state.status,seoScore:state.assessment.seo.score,visibilityScore:state.assessment.visibilityScore,
    platformCoveragePercent:state.assessment.platform.coveragePercent,missingInputs:state.missingInputs,
    topRoutes:state.routeToMarket.recommendedForConsideration
  },null,2)+"\n");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
