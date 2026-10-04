import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ENUMS={
  class:["analysis","validation","evidence","enforcement","mutation","deployment"],
  action:["observe","validate","recommend","heal","mutate","deploy"],
  effect:["read_only","proposal","bounded_mutation","deployment"]
};
function clean(value){ return typeof value==="string" ? value.trim() : ""; }
function required(env,name){ const value=clean(env[name]); if(!value) throw new Error(name+" is required"); return value; }
function oneOf(value,name,values){ if(!values.includes(value)) throw new Error(name+" must be one of: "+values.join(", ")); return value; }
function sanitizeId(value){ return value.replace(/[^A-Za-z0-9._:-]+/g,"-").replace(/^-+|-+$/g,""); }

export function buildAutomationXAnnotation(env=process.env){
  const repository=required(env,"GITHUB_REPOSITORY");
  const workflow=required(env,"GITHUB_WORKFLOW");
  const runId=required(env,"GITHUB_RUN_ID");
  const runAttempt=clean(env.GITHUB_RUN_ATTEMPT) || "1";
  const event=required(env,"GITHUB_EVENT_NAME");
  const ref=required(env,"GITHUB_REF");
  const sha=required(env,"GITHUB_SHA");
  if(!/^[0-9a-f]{40}$/.test(sha)) throw new Error("GITHUB_SHA must be a full 40-character SHA");
  const automationId=required(env,"AUTOMATION_X_ID");
  const automationClass=oneOf(required(env,"AUTOMATION_X_CLASS"),"AUTOMATION_X_CLASS",ENUMS.class);
  const action=oneOf(required(env,"AUTOMATION_X_ACTION"),"AUTOMATION_X_ACTION",ENUMS.action);
  const target=required(env,"AUTOMATION_X_TARGET");
  const effect=oneOf(required(env,"AUTOMATION_X_EFFECT"),"AUTOMATION_X_EFFECT",ENUMS.effect);
  const requestedReview=clean(env.AUTOMATION_X_HUMAN_REVIEW_REQUIRED).toLowerCase();
  let humanReview;
  if(requestedReview==="true") humanReview=true;
  else if(requestedReview==="false") {
    if(effect!=="read_only") throw new Error("AUTOMATION_X_HUMAN_REVIEW_REQUIRED cannot be false for non-read_only effects");
    humanReview=false;
  } else if(requestedReview) throw new Error("AUTOMATION_X_HUMAN_REVIEW_REQUIRED must be true or false");
  else humanReview=effect!=="read_only" || automationClass==="enforcement" || automationClass==="mutation" || automationClass==="deployment";
  const annotationId=clean(env.AUTOMATION_X_ANNOTATION_ID) || "ax-"+sanitizeId(automationId)+"-"+runId+"-"+runAttempt;
  const reason=clean(env.AUTOMATION_X_HUMAN_REVIEW_REASON) || (humanReview
    ? "Automation X is provenance-only and does not authorize canonical merge or production deployment."
    : "Read-only automation observation or validation; no approval or production authority is granted.");
  const serverUrl=clean(env.GITHUB_SERVER_URL) || "https://github.com";
  const runUrl=serverUrl+"/"+repository+"/actions/runs/"+runId;
  const artifactPath=clean(env.AUTOMATION_X_ARTIFACT_PATH) || "artifacts/automation-x/"+annotationId+".json";
  return {
    schemaVersion:"automation-x-annotation-v1", annotationId, repository, workflow,
    run:{id:runId,attempt:runAttempt,event,ref,sha,url:runUrl},
    automation:{id:automationId,class:automationClass,action,target,effect},
    authority:{productionSource:false,canonicalChange:false,merge:false,productionDeployment:false},
    humanReview:{required:humanReview,reason},
    evidence:{runUrl,artifactPath},
    generatedAt:new Date().toISOString()
  };
}

export function writeAutomationXAnnotation(target,env=process.env){
  const output=resolve(target || env.AUTOMATION_X_ARTIFACT_PATH || "artifacts/automation-x/annotation.json");
  const annotation=buildAutomationXAnnotation(env);
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(annotation,null,2)+"\n","utf8");
  const summaryPath=clean(env.GITHUB_STEP_SUMMARY);
  if(summaryPath){
    mkdirSync(dirname(summaryPath),{recursive:true});
    const summary=[
      "## Automation X Annotation","",
      "- Annotation: `"+annotation.annotationId+"`",
      "- Automation: `"+annotation.automation.id+"`",
      "- Class: `"+annotation.automation.class+"`",
      "- Action: `"+annotation.automation.action+"`",
      "- Effect: `"+annotation.automation.effect+"`",
      "- Human review required: `"+annotation.humanReview.required+"`",
      "- Authority: canonical change=`false`, merge=`false`, production deployment=`false`",
      "- Evidence: "+annotation.evidence.runUrl,""
    ].join("\n")+"\n";
    writeFileSync(summaryPath,summary,{flag:"a"});
  }
  console.log("::notice title=Automation X Annotation::"+annotation.annotationId+" | "+annotation.automation.id+" | "+annotation.automation.action+" | effect="+annotation.automation.effect+" | human-review="+annotation.humanReview.required);
  return annotation;
}

const directInvocation=process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(directInvocation){
  const target=process.argv[2] || process.env.AUTOMATION_X_ARTIFACT_PATH || "artifacts/automation-x/annotation.json";
  const annotation=writeAutomationXAnnotation(target);
  console.log(JSON.stringify(annotation));
}
