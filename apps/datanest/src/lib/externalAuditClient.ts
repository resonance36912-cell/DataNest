import { getSupabase } from "@/lib/supabase";
import type { AssessmentBundle } from "@/lib/externalAuditTypes";

function client(){
  const supabase=getSupabase();
  if(!supabase)throw new Error("DataNest backend is not configured.");
  return supabase;
}

async function invoke(action:string,payload:Record<string,unknown>){
  const supabase=client();
  const {data,error}=await supabase.functions.invoke("external-audit",{body:{action,...payload}});
  if(error)throw error;
  if(data?.error)throw new Error(String(data.error));
  return data;
}

export async function createAssessment(input:{projectId:string;requestKey:string;name:string;kind:string;goal:string;reference:string}){
  const {data,error}=await client().rpc("create_external_audit_v1",{
    target_project:input.projectId,target_request_key:input.requestKey,target_name:input.name,target_kind:input.kind,
    target_goal:input.goal||null,target_reference:input.reference||null
  });
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  return {assessmentId:String(row.assessment_id),revision:Number(row.revision)};
}

export async function loadAssessment(assessmentId:string):Promise<AssessmentBundle>{
  return await invoke("read",{assessmentId}) as AssessmentBundle;
}
export async function snapshotSource(assessmentId:string,url:string){return await invoke("snapshot",{assessmentId,url});}
export async function analyzeAssessment(assessmentId:string,clientRequestId:string){return await invoke("analyze",{assessmentId,clientRequestId});}

export async function saveStandardsProfile(input:{assessmentId:string;revision:number;domains:string[];jurisdiction:string;selected:unknown[];excluded:unknown[];approve:boolean}){
  const {data,error}=await client().rpc("save_external_audit_profile_v1",{
    target_assessment:input.assessmentId,target_revision:input.revision,target_domains:input.domains,target_jurisdiction:input.jurisdiction||null,
    target_selected_standards:input.selected,target_excluded_standards:input.excluded,target_approve:input.approve
  });
  if(error)throw error;
  return String(data);
}
export async function reviewFinding(findingId:string,decision:string,reason:string){
  const {data,error}=await client().rpc("review_external_audit_finding_v1",{target_finding:findingId,target_decision:decision,target_reason:reason});
  if(error)throw error; return String(data);
}
export async function approveAction(actionId:string,requestKey:string){
  const {data,error}=await client().rpc("approve_external_audit_action_v1",{target_action:actionId,target_request_key:requestKey});
  if(error)throw error; return Array.isArray(data)?data[0]:data;
}
export async function closeAction(actionId:string,verificationSourceId:string,reason:string){
  const {data,error}=await client().rpc("close_external_audit_action_v1",{target_action:actionId,target_verification_source:verificationSourceId,target_reason:reason});
  if(error)throw error; return String(data);
}
export async function publishAuditDocument(input:{assessmentId:string;revision:number;kind:string;format:"html"|"csv"|"json";content:string;visibility?:string}){
  const {data,error}=await client().rpc("publish_external_audit_document_v1",{
    target_assessment:input.assessmentId,target_revision:input.revision,target_kind:input.kind,target_format:input.format,
    target_content:input.content,target_storage_reference:null,target_visibility:input.visibility||"project_restricted"
  });
  if(error)throw error;
  return String(data);
}
