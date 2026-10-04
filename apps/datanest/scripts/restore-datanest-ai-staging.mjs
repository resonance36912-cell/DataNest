import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  canonicalHash,
  decryptBackup,
  parseBackupKey,
  validateRestoreRefs
} from "./lib/encrypted-backup.mjs";
import { assertDedicatedDataNestAiStaging } from "./lib/datanest-ai-staging-environment.mjs";

const [backupFile,...args]=process.argv.slice(2);
const targetIndex=args.indexOf("--target-ref");
const sourceIndex=args.indexOf("--source-ref");
const verifyOnly=args.includes("--verify-only");
const targetRef=targetIndex>=0?args[targetIndex+1]:"";
const expectedSourceRef=sourceIndex>=0?args[sourceIndex+1]:"";

const url=process.env.DATANEST_AI_STAGING_URL;
const serviceKey=process.env.DATANEST_AI_STAGING_SERVICE_ROLE_KEY;
const configuredStagingRef=process.env.DATANEST_AI_STAGING_PROJECT_REF;
const productionRef=process.env.DATANEST_PRODUCTION_PROJECT_REF||"sgqdmfgjbprsoqsmgigi";
const backupKey=parseBackupKey(process.env.DATANEST_AI_BACKUP_KEY);

if(!backupFile||!targetRef||!expectedSourceRef){
  throw new Error("Usage: restore-datanest-ai-staging.mjs <backup> --target-ref <staging-ref> --source-ref <backup-source-ref> [--verify-only]");
}
if(!url||!serviceKey||!configuredStagingRef){
  throw new Error("Staging URL, service-role key and staging project ref are required.");
}
const staging=assertDedicatedDataNestAiStaging({url,projectRef:configuredStagingRef,productionRef});
const encrypted=await fs.readFile(backupFile,"utf8");
const payload=JSON.parse(decryptBackup(encrypted,backupKey).toString("utf8"));
if(payload?.formatVersion!==1)throw new Error("Unsupported backup formatVersion.");

validateRestoreRefs({
  backupSourceRef:String(payload?.projectRef||""),
  expectedSourceRef,
  targetRef,
  configuredStagingRef,
  productionRef
});

const admin=createClient(staging.url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const tableOrder=[
  ["ai_sessions",["id"],"id"],
  ["ai_intake_events",["id"],"id"],
  ["ai_reasoning_envelopes",["id"],"id"],
  ["ai_trend_clusters",["id"],"id"],
  ["ai_trend_evidence",["cluster_id","event_id"],"cluster_id,event_id"],
  ["ai_learning_candidates",["id"],"id"],
  ["ai_candidate_evidence",["candidate_id","event_id"],"candidate_id,event_id"],
  ["ai_validation_runs",["id"],"id"],
  ["ai_certification_decisions",["id"],"id"],
  ["ai_memory_supersessions",["id"],"id"]
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

const report={verifyOnly,tables:{}};

for(const [table,orderColumns,onConflict] of tableOrder){
  const sourceRows=payload.tables?.[table];
  if(!Array.isArray(sourceRows))throw new Error("Backup is missing table "+table+".");

  if(!verifyOnly&&sourceRows.length){
    for(let offset=0;offset<sourceRows.length;offset+=500){
      const batch=sourceRows.slice(offset,offset+500);
      const result=await admin.from(table).upsert(batch,{onConflict});
      if(result.error)throw result.error;
    }
  }

  const targetRows=await readAll(table,orderColumns);
  const sourceHash=canonicalHash(sourceRows);
  const targetHash=canonicalHash(targetRows);
  const match=sourceRows.length===targetRows.length&&sourceHash===targetHash;
  report.tables[table]={
    sourceCount:sourceRows.length,
    targetCount:targetRows.length,
    sourceHash,
    targetHash,
    match
  };
  if(!match){
    throw new Error("Backup verification failed for "+table+".");
  }
}

console.log(JSON.stringify(report));
