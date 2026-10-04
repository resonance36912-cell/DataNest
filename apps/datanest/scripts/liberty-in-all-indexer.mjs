#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const sha=value=>"sha256:"+createHash("sha256").update(value).digest("hex");
async function readJson(filename,fallback=null){
  try{return JSON.parse(await readFile(filename,"utf8"));}catch{return fallback;}
}
function regexes(config){
  return (config?.scope?.sensitivePatterns||[]).map(pattern=>new RegExp(pattern,"i"));
}
export function isSensitivePath(filename,config){
  return regexes(config).some(rule=>rule.test(filename));
}
function inScope(filename,config){
  const roots=config?.scope?.roots||[];
  const extensions=config?.scope?.extensions||[];
  const excluded=config?.scope?.excludePrefixes||[];
  return roots.some(root=>filename===root||filename.startsWith(root+"/")) &&
    extensions.includes(path.extname(filename).toLowerCase()) &&
    !excluded.some(prefix=>filename.startsWith(prefix));
}
function isPublicEligible(filename,config){
  if(isSensitivePath(filename,config)) return false;
  if((config?.scope?.publicConfigAllowlist||[]).includes(filename)) return true;
  return (config?.scope?.publicIndexRoots||[]).some(root=>filename.startsWith(root));
}
function normalizedRecord(item,config,headSha){
  const content=Buffer.isBuffer(item.content)?item.content:Buffer.from(String(item.content??""));
  const sensitive=isSensitivePath(item.path,config);
  const publicEligible=isPublicEligible(item.path,config);
  return {
    path:item.path,
    digest:sha(content),
    bytes:content.byteLength,
    extension:path.extname(item.path).toLowerCase()||null,
    classification:sensitive?"restricted-metadata":publicEligible?"public-metadata":"controlled-metadata",
    publicEligible,
    sourceRef:headSha
  };
}
export function buildLibertyIndexes({config,files,headSha,generatedAt=new Date().toISOString(),evidence=[]}){
  const records=files.filter(item=>inScope(item.path,config)).map(item=>normalizedRecord(item,config,headSha));
  const restricted=records.filter(item=>item.classification==="restricted-metadata");
  const safeRecords=records.filter(item=>item.classification!=="restricted-metadata");
  const publicRecords=safeRecords.filter(item=>item.publicEligible);
  const missingEvidence=(config.evidenceSources||[]).filter(source=>!files.some(item=>item.path===source));
  const state={
    schemaVersion:"datanest-liberty-in-all-state-v1",
    generatedAt,
    authority:"traceability-assurance-non-authorizing",
    productionAuthorization:false,
    status:missingEvidence.length===0?"ready":"attention",
    headSha,
    coverage:{
      indexedRecords:records.length,
      publicRecords:publicRecords.length,
      controlledRecords:records.length-publicRecords.length-restricted.length,
      restrictedRecords:restricted.length,
      configuredEvidenceSources:(config.evidenceSources||[]).length,
      missingEvidenceSources:missingEvidence.length
    },
    missingEvidenceSources:missingEvidence,
    audiences:config.audiences,
    standardsAlignment:config.standardsAlignment,
    controls:config.controls,
    retention:config.retention,
    evidenceDigest:sha(Buffer.from(JSON.stringify({headSha,records:records.map(x=>[x.path,x.digest]),evidence})))
  };
  const internalIndex={
    schemaVersion:"datanest-liberty-in-all-traceability-v1",
    generatedAt,
    authority:state.authority,
    productionAuthorization:false,
    headSha,
    records:safeRecords,
    restrictedRecordCount:restricted.length,
    restrictedEvidenceDigest:restricted.length?sha(Buffer.from(JSON.stringify(restricted.map(item=>item.digest).sort()))):null,
    evidence,
    missingEvidenceSources:missingEvidence
  };
  const publicIndex={
    schemaVersion:"datanest-liberty-in-all-public-index-v1",
    generatedAt,
    authority:state.authority,
    productionAuthorization:false,
    status:state.status,
    headSha,
    canonicalPublicUrl:config.canonicalPublicUrl,
    coverage:state.coverage,
    missingEvidenceSources:missingEvidence,
    standardsAlignment:config.standardsAlignment,
    audienceViews:Object.keys(config.audiences||{}),
    records:publicRecords.map(({path,digest,bytes,extension,classification,sourceRef})=>({path,digest,bytes,extension,classification,sourceRef})),
    evidence,
    disclosure:{
      recordContentsPublished:false,
      secretsPublished:false,
      privateAuthenticationMaterialPublished:false,
      protectedPersonalDataPublished:false
    }
  };
  return {state,internalIndex,publicIndex};
}
async function main(){
  const config=await readJson("config/liberty-in-all.standard.json");
  if(!config) throw new Error("Missing LIBERTY-IN-ALL standard config.");
  const headSha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const tracked=execFileSync("git",["ls-files","-z"],{encoding:"utf8"}).split("\0").filter(Boolean);
  const files=[];
  for(const filename of tracked){
    if(!inScope(filename,config)) continue;
    try{files.push({path:filename,content:await readFile(filename)});}catch{}
  }
  const evidence=[];
  for(const source of config.evidenceSources||[]){
    const item=files.find(file=>file.path===source);
    if(!item) continue;
    const parsed=source.endsWith(".json")?await readJson(source,{}):{};
    const info=await stat(source);
    evidence.push({
      source,
      digest:sha(item.content),
      bytes:info.size,
      schemaVersion:parsed?.schemaVersion||parsed?.schema_version||null,
      generatedAt:parsed?.generatedAt||parsed?.updated_at||parsed?.published_at||null,
      productionAuthorization:parsed?.productionAuthorization??parsed?.authority?.production_authorization??null,
      sourceRef:headSha
    });
  }
  const generatedAt=new Date().toISOString();
  const {state,internalIndex,publicIndex}=buildLibertyIndexes({config,files,headSha,generatedAt,evidence});
  await mkdir("liberty-in-all/state",{recursive:true});
  await mkdir("liberty-in-all/index",{recursive:true});
  await mkdir("public/transparency/liberty-in-all",{recursive:true});
  await writeFile(config.statePath,JSON.stringify(state,null,2)+"\n");
  await writeFile(config.internalIndexPath,JSON.stringify(internalIndex,null,2)+"\n");
  await writeFile(config.publicIndexPath,JSON.stringify(publicIndex,null,2)+"\n");
  process.stdout.write(JSON.stringify({
    status:state.status,
    headSha,
    indexedRecords:state.coverage.indexedRecords,
    publicRecords:state.coverage.publicRecords,
    restrictedRecords:state.coverage.restrictedRecords,
    missingEvidenceSources:state.missingEvidenceSources
  },null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
