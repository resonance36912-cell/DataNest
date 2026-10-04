#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{
  const i=args.indexOf(name);
  return i>=0 ? args[i+1] : fallback;
};
const has=(name)=>args.includes(name);

async function readJson(filename,fallback){
  if(!filename) return fallback;
  try{return JSON.parse(await readFile(filename,"utf8"));}catch{return fallback;}
}

function derivedCategoryCounts(items=[]){
  const counts={};
  for(const item of items){
    for(const category of item?.categories||[]) counts[category]=(counts[category]||0)+1;
  }
  return counts;
}

export function buildBotWorkOrder(bot,knowledge={},environment={},regulator={}){
  const knowledgeItems=Array.isArray(knowledge?.items) ? knowledge.items : [];
  const categoryCounts=knowledge?.categoryCounts || derivedCategoryCounts(knowledgeItems);
  const environmentFindings=Array.isArray(environment?.findings) ? environment.findings : [];
  const strongestCategories=Object.entries(categoryCounts)
    .sort((a,b)=>Number(b[1])-Number(a[1]))
    .slice(0,5)
    .map(([category,count])=>({category,count:Number(count)}));
  return {
    schemaVersion:"datanest-botsquad-work-order-v1",
    bot:{id:bot.id,purpose:bot.purpose,branch:bot.branch},
    authority:"advisory",
    productionAuthorization:false,
    generatedAt:new Date().toISOString(),
    context:{
      strongestKnowledgeCategories:strongestCategories,
      recentLearningCount:knowledgeItems.length,
      knowledgeOptimizationCandidates:Array.isArray(knowledge?.optimizationCandidates)?knowledge.optimizationCandidates.slice(0,20):[],
      environmentFindingCount:environmentFindings.length,
      environmentFindings:environmentFindings.slice(0,20),
      regulatorStatus:regulator?.status||null,
      regulatorRequirementCount:Array.isArray(regulator?.requirements)?regulator.requirements.length:0,
      regulatorRequirements:Array.isArray(regulator?.requirements)?regulator.requirements.slice(0,30):[],
      regulatorInstructions:Array.isArray(regulator?.instructions)?regulator.instructions:[]
    },
    objectives:[
      bot.purpose,
      "Prefer lower-friction, reversible, evidence-backed improvements.",
      "Preserve DataNest Boundaries and human production authorization.",
      "Return concrete UX/function implications when relevant."
    ],
    expectedOutput:{
      recommendations:"array",
      uxEaseFeed:"array",
      functionEvolutionFeed:"array",
      risks:"array",
      evidenceRefs:"array"
    }
  };
}

async function callAi(endpoint,apiKey,workOrder){
  const response=await fetch(endpoint,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      ...(apiKey?{authorization:"Bearer "+apiKey}:{})
    },
    body:JSON.stringify({
      model:process.env.BOTSQUAD_AI_MODEL || "default",
      messages:[
        {role:"system",content:"You are a scoped DataNest BOTSQUAD specialist. Return JSON only. Do not claim production authority, approval, certification, or the ability to make binding commercial commitments."},
        {role:"user",content:JSON.stringify(workOrder)}
      ],
      temperature:0.2
    })
  });
  if(!response.ok) throw new Error("BOTSQUAD AI endpoint failed: "+response.status);
  const data=await response.json();
  const raw=data?.choices?.[0]?.message?.content;
  if(typeof raw!=="string") throw new Error("BOTSQUAD AI endpoint returned no message content");
  return JSON.parse(raw);
}

export function normalizeAiResult(workOrder,result){
  return {
    schemaVersion:"datanest-botsquad-feed-v1",
    bot:workOrder.bot,
    authority:"advisory",
    productionAuthorization:false,
    generatedAt:new Date().toISOString(),
    status:"ai-generated",
    recommendations:Array.isArray(result?.recommendations)?result.recommendations:[],
    uxEaseFeed:Array.isArray(result?.uxEaseFeed)?result.uxEaseFeed:[],
    functionEvolutionFeed:Array.isArray(result?.functionEvolutionFeed)?result.functionEvolutionFeed:[],
    risks:Array.isArray(result?.risks)?result.risks:[],
    evidenceRefs:Array.isArray(result?.evidenceRefs)?result.evidenceRefs:[],
    workOrder
  };
}

export function consolidateFeeds(feeds,target){
  const active=feeds.filter(Boolean);
  return {
    schemaVersion:"datanest-botsquad-consolidated-feed-v1",
    target,
    authority:"advisory",
    productionAuthorization:false,
    generatedAt:new Date().toISOString(),
    botCount:active.length,
    recommendations:active.flatMap(x=>x.recommendations||[]),
    uxEaseFeed:active.flatMap(x=>x.uxEaseFeed||[]),
    functionEvolutionFeed:active.flatMap(x=>x.functionEvolutionFeed||[]),
    risks:active.flatMap(x=>x.risks||[]),
    sourceBots:active.map(x=>x.bot?.id).filter(Boolean)
  };
}

async function main(){
  const config=await readJson("config/botsquad.tree.json",null);
  if(!config) throw new Error("Missing BOTSQUAD config");

  if(has("--consolidate")){
    const dir=arg("--dir","botsquad/feeds/specialists");
    const target=arg("--target","datanest");
    const feeds=[];
    for(const bot of config.botBranches.filter(x=>x.id!=="orchestrator")){
      feeds.push(await readJson(path.join(dir,bot.id+".json"),null));
    }
    const out=arg("--out","botsquad/feeds/"+target+".json");
    await mkdir(path.dirname(out),{recursive:true});
    await writeFile(out,JSON.stringify(consolidateFeeds(feeds,target),null,2)+"\n");
    return;
  }

  const botId=arg("--bot");
  const bot=config.botBranches.find(x=>x.id===botId);
  if(!bot || bot.id==="orchestrator") throw new Error("Unknown or non-specialist bot: "+botId);
  const knowledge=await readJson(arg("--knowledge"),{});
  const environment=await readJson(arg("--environment"),{});
  const regulator=await readJson(arg("--regulator"),{});
  const workOrder=buildBotWorkOrder(bot,knowledge,environment,regulator);
  const endpoint=process.env.BOTSQUAD_AI_ENDPOINT;
  let feed;
  if(endpoint){
    const result=await callAi(endpoint,process.env.BOTSQUAD_AI_API_KEY||"",workOrder);
    feed=normalizeAiResult(workOrder,result);
  }else{
    feed={
      schemaVersion:"datanest-botsquad-feed-v1",
      bot:workOrder.bot,
      authority:"advisory",
      productionAuthorization:false,
      generatedAt:new Date().toISOString(),
      status:"awaiting-approved-ai-provider",
      recommendations:[],
      uxEaseFeed:[],
      functionEvolutionFeed:[],
      risks:[],
      evidenceRefs:[],
      workOrder
    };
  }
  const out=arg("--out","botsquad/feeds/specialists/"+bot.id+".json");
  await mkdir(path.dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(feed,null,2)+"\n");
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
