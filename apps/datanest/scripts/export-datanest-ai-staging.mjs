import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { encryptBackup, parseBackupKey } from "./lib/encrypted-backup.mjs";
import { assertDedicatedDataNestAiStaging } from "./lib/datanest-ai-staging-environment.mjs";

const url=process.env.DATANEST_AI_STAGING_URL;
const serviceKey=process.env.DATANEST_AI_STAGING_SERVICE_ROLE_KEY;
const projectRef=process.env.DATANEST_AI_STAGING_PROJECT_REF;
const backupKey=parseBackupKey(process.env.DATANEST_AI_BACKUP_KEY);

if(!url||!serviceKey||!projectRef){
  throw new Error("DATANEST_AI_STAGING_URL, DATANEST_AI_STAGING_SERVICE_ROLE_KEY and DATANEST_AI_STAGING_PROJECT_REF are required.");
}

const staging=assertDedicatedDataNestAiStaging({url,projectRef});
const admin=createClient(staging.url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

const tableOrder=[
  ["ai_sessions",["id"]],
  ["ai_intake_events",["id"]],
  ["ai_reasoning_envelopes",["id"]],
  ["ai_trend_clusters",["id"]],
  ["ai_trend_evidence",["cluster_id","event_id"]],
  ["ai_learning_candidates",["id"]],
  ["ai_candidate_evidence",["candidate_id","event_id"]],
  ["ai_validation_runs",["id"]],
  ["ai_certification_decisions",["id"]],
  ["ai_memory_supersessions",["id"]]
];

async function readAll(table,orderColumns){
  const rows=[];
  const pageSize=1000;
  for(let from=0;;from+=pageSize){
    let query=admin.from(table).select("*").range(from,from+pageSize-1);
    for(const column of orderColumns)query=query.order(column,{ascending:true});
    const result=await query;
    if(result.error)throw result.error;
    rows.push(...(result.data||[]));
    if((result.data||[]).length<pageSize)break;
  }
  return rows;
}

const tables={};
for(const [table,orderColumns] of tableOrder){
  tables[table]=await readAll(table,orderColumns);
}

const payload={
  formatVersion:1,
  exportedAt:new Date().toISOString(),
  projectRef:staging.projectRef,
  tables
};

await fs.mkdir("backups",{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const outputPath=path.join("backups",`datanest-ai-staging-${stamp}.datanest-ai-backup`);
const encrypted=encryptBackup(Buffer.from(JSON.stringify(payload)),backupKey);
await fs.writeFile(outputPath,encrypted,{encoding:"utf8",mode:0o600});

console.log(JSON.stringify({
  outputPath,
  projectRef,
  tableCounts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length]))
}));
