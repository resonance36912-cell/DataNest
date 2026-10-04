#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function escapeRegex(value){return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
export function globToRegExp(pattern){
  let source="";
  for(let i=0;i<pattern.length;i+=1){
    const char=pattern[i];
    if(char==="*"&&pattern[i+1]==="*"){source+=".*";i+=1;}
    else if(char==="*") source+="[^/]*";
    else if(char==="?") source+="[^/]";
    else source+=escapeRegex(char);
  }
  return new RegExp("^"+source+"$");
}
const matches=(file,patterns)=>(patterns||[]).some((pattern)=>globToRegExp(pattern).test(file));

export function assessPolicy(policy,files,contents={}){
  const touchedScopes=(policy.scopes||[])
    .filter((scope)=>files.some((file)=>matches(file,scope.patterns)))
    .map((scope)=>({
      id:scope.id,
      tolerance:scope.tolerance,
      acceptance:scope.acceptance||[],
      files:files.filter((file)=>matches(file,scope.patterns))
    }));

  const blockers=[];
  for(const rule of policy.hardRules||[]){
    for(const file of files.filter((candidate)=>matches(candidate,rule.files))){
      const text=String(contents[file]||"");
      for(const forbidden of rule.forbiddenText||[]){
        if(text.includes(forbidden)){
          blockers.push({rule:rule.id,file,forbidden,message:rule.message});
        }
      }
    }
  }
  return {
    status:blockers.length?"block":touchedScopes.length?"review":"pass",
    blockers,
    touchedScopes
  };
}

function changedFiles(){
  const explicit=process.env.BOUNDARIES_CHANGED_PATHS;
  if(explicit) return explicit.split(/\r?\n/).map((value)=>value.trim()).filter(Boolean);
  const base=process.env.BOUNDARIES_BASE_REF||"HEAD^";
  try{
    return execFileSync("git",["diff","--name-only",base+"...HEAD"],{encoding:"utf8"})
      .split(/\r?\n/).map((value)=>value.trim()).filter(Boolean);
  }catch{
    return execFileSync("git",["diff","--name-only","HEAD^","HEAD"],{encoding:"utf8"})
      .split(/\r?\n/).map((value)=>value.trim()).filter(Boolean);
  }
}

async function main(){
  const policyPath=process.argv[2]||"config/boundaries.policy.json";
  const reportDir=process.argv[3]||"artifacts/boundaries";
  const policy=JSON.parse(await readFile(policyPath,"utf8"));
  const files=changedFiles();
  const contents={};
  for(const file of files){
    try{contents[file]=await readFile(file,"utf8");}catch{contents[file]="";}
  }
  const assessment=assessPolicy(policy,files,contents);
  const report={
    schemaVersion:"datanest-boundaries-report-v1",
    generatedAt:new Date().toISOString(),
    repository:process.env.GITHUB_REPOSITORY||null,
    commit:process.env.GITHUB_SHA||null,
    changedFiles:files,
    ...assessment,
    productionAuthorization:false,
    certification:false
  };
  await mkdir(reportDir,{recursive:true});
  await writeFile(path.join(reportDir,"report.json"),JSON.stringify(report,null,2)+"\n");
  const lines=[
    "# DataNest Boundaries assessment",
    "",
    `Status: **${report.status.toUpperCase()}**`,
    `Changed files: ${files.length}`,
    `Hard-boundary blockers: ${assessment.blockers.length}`,
    "",
    "Passing this assessment is evidence only; it is not production authorization or certification.",
    ""
  ];
  for(const scope of assessment.touchedScopes){
    lines.push(`## ${scope.id}`,"",`Tolerance: ${scope.tolerance}`,"","Acceptance criteria:");
    for(const item of scope.acceptance) lines.push("- "+item);
    lines.push("","Touched files:",...scope.files.map((file)=>"- `"+file+"`"),"");
  }
  for(const blocker of assessment.blockers){
    lines.push(`## BLOCK: ${blocker.rule}`,"",`- File: \`${blocker.file}\``,`- Reason: ${blocker.message}`,"");
  }
  await writeFile(path.join(reportDir,"report.md"),lines.join("\n")+"\n");
  process.stdout.write(lines.join("\n")+"\n");
  if(assessment.blockers.length) process.exitCode=2;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch((error)=>{console.error(error);process.exitCode=1;});
}
