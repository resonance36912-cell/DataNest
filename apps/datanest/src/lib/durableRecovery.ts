"use client";

import { getSupabase } from "@/lib/supabase";
import type { PendingMutationIntent, PendingMutationVerification } from "@/lib/pendingMutation";

export type DurableRecoveryResolution="confirmed"|"superseded_after_absence";

export type DurableRecoveryDiagnosticItem={
  id:string;
  mutationKind:string;
  requestSuffix:string;
  startedAt:string;
  ageSeconds:number;
  verificationState:PendingMutationVerification;
  lastCheckedAt:string|null;
  attemptCount:number;
  lastAttemptAt:string;
};

export type DurableRecoveryResolutionItem={
  id:string;
  mutationKind:string;
  requestSuffix:string;
  resolution:DurableRecoveryResolution;
  startedAt:string;
  resolvedAt:string;
  elapsedSeconds:number;
  attemptCount:number;
};

export type DurableRecoveryDiagnostics={
  generatedAt:string;
  unresolvedTotal:number;
  unverifiedTotal:number;
  unconfirmedTotal:number;
  safeRetryTotal:number;
  recentTotal:number;
  agingTotal:number;
  staleTotal:number;
  maxAttemptCount:number;
  oldestStartedAt:string|null;
  resolved24h:number;
  items:DurableRecoveryDiagnosticItem[];
  recentResolutions:DurableRecoveryResolutionItem[];
};

export type DurableRecoveryRecord<T extends Record<string,unknown>=Record<string,unknown>>={
  id:string;
  projectId:string;
  userId:string;
  scope:string;
  mutationKind:string;
  requestKey:string;
  payload:T;
  startedAt:string;
  verificationState:PendingMutationVerification;
  lastCheckedAt:string|null;
  attemptCount:number;
  lastAttemptAt:string;
  active:boolean;
  resolvedAt:string|null;
  resolution:DurableRecoveryResolution|null;
};

function objectValue(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Durable recovery response is malformed.");
  return value as Record<string,unknown>;
}

function stringValue(value:unknown,label:string){
  if(typeof value!=="string"||!value)throw new Error("Durable recovery "+label+" is missing.");
  return value;
}

function numberValue(value:unknown,label:string){
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<0)throw new Error("Durable recovery "+label+" is invalid.");
  return parsed;
}

function verificationValue(value:unknown){
  const verification=String(value||"unverified");
  if(!["unverified","unconfirmed","confirmed_absent"].includes(verification)){
    throw new Error("Durable recovery verification state is invalid.");
  }
  return verification as PendingMutationVerification;
}

function resolutionValue(value:unknown){
  const resolution=String(value||"");
  if(!["confirmed","superseded_after_absence"].includes(resolution)){
    throw new Error("Durable recovery resolution is invalid.");
  }
  return resolution as DurableRecoveryResolution;
}

function normalizeRecord<T extends Record<string,unknown>>(value:unknown):DurableRecoveryRecord<T>{
  const row=objectValue(value);
  const payload=objectValue(row.payload) as T;
  const verification=verificationValue(row.verification_state);
  const resolution=row.resolution===null||row.resolution===undefined?null:resolutionValue(row.resolution);
  return {
    id:stringValue(row.id,"id"),
    projectId:stringValue(row.project_id,"project"),
    userId:stringValue(row.user_id,"user"),
    scope:stringValue(row.scope,"scope"),
    mutationKind:stringValue(row.mutation_kind,"kind"),
    requestKey:stringValue(row.request_key,"request identity"),
    payload,
    startedAt:stringValue(row.started_at,"start time"),
    verificationState:verification as PendingMutationVerification,
    lastCheckedAt:typeof row.last_checked_at==="string"?row.last_checked_at:null,
    attemptCount:numberValue(row.attempt_count||0,"attempt count"),
    lastAttemptAt:stringValue(row.last_attempt_at,"last attempt"),
    active:row.active===undefined?row.resolved_at==null:Boolean(row.active),
    resolvedAt:typeof row.resolved_at==="string"?row.resolved_at:null,
    resolution:resolution as DurableRecoveryResolution|null
  };
}

export async function listDurableRecoveries(projectId:string){
  const supabase=getSupabase();
  if(!supabase)throw new Error("Durable recovery ledger is unavailable.");
  const {data,error}=await supabase.rpc("list_mutation_recoveries_v1",{target_project:projectId});
  if(error)throw error;
  if(!Array.isArray(data))throw new Error("Durable recovery ledger returned an invalid list.");
  return data.map(item=>normalizeRecord(item));
}

export async function getDurableRecoveryDiagnostics(projectId:string):Promise<DurableRecoveryDiagnostics>{
  const supabase=getSupabase();
  if(!supabase)throw new Error("Durable recovery diagnostics are unavailable.");
  const {data,error}=await supabase.rpc("get_mutation_recovery_diagnostics_v1",{target_project:projectId});
  if(error)throw error;
  const row=objectValue(data);
  const itemsRaw=Array.isArray(row.items)?row.items:[];
  const recentRaw=Array.isArray(row.recent_resolutions)?row.recent_resolutions:[];
  return {
    generatedAt:stringValue(row.generated_at,"diagnostic generation time"),
    unresolvedTotal:numberValue(row.unresolved_total||0,"unresolved count"),
    unverifiedTotal:numberValue(row.unverified_total||0,"unverified count"),
    unconfirmedTotal:numberValue(row.unconfirmed_total||0,"unconfirmed count"),
    safeRetryTotal:numberValue(row.safe_retry_total||0,"safe retry count"),
    recentTotal:numberValue(row.recent_total||0,"recent count"),
    agingTotal:numberValue(row.aging_total||0,"aging count"),
    staleTotal:numberValue(row.stale_total||0,"stale count"),
    maxAttemptCount:numberValue(row.max_attempt_count||0,"maximum attempt count"),
    oldestStartedAt:typeof row.oldest_started_at==="string"?row.oldest_started_at:null,
    resolved24h:numberValue(row.resolved_24h||0,"24 hour resolution count"),
    items:itemsRaw.map(value=>{
      const item=objectValue(value);
      return {
        id:stringValue(item.id,"diagnostic id"),
        mutationKind:stringValue(item.mutation_kind,"diagnostic kind"),
        requestSuffix:stringValue(item.request_suffix,"diagnostic request suffix"),
        startedAt:stringValue(item.started_at,"diagnostic start time"),
        ageSeconds:numberValue(item.age_seconds||0,"diagnostic age"),
        verificationState:verificationValue(item.verification_state),
        lastCheckedAt:typeof item.last_checked_at==="string"?item.last_checked_at:null,
        attemptCount:numberValue(item.attempt_count||0,"diagnostic attempt count"),
        lastAttemptAt:stringValue(item.last_attempt_at,"diagnostic last attempt")
      };
    }),
    recentResolutions:recentRaw.map(value=>{
      const item=objectValue(value);
      return {
        id:stringValue(item.id,"resolution id"),
        mutationKind:stringValue(item.mutation_kind,"resolution kind"),
        requestSuffix:stringValue(item.request_suffix,"resolution request suffix"),
        resolution:resolutionValue(item.resolution),
        startedAt:stringValue(item.started_at,"resolution start time"),
        resolvedAt:stringValue(item.resolved_at,"resolution time"),
        elapsedSeconds:numberValue(item.elapsed_seconds||0,"resolution elapsed time"),
        attemptCount:numberValue(item.attempt_count||0,"resolution attempt count")
      };
    })
  };
}

export async function registerDurableRecovery<T extends Record<string,unknown>>(
  projectId:string,
  scope:string,
  intent:PendingMutationIntent<T>
){
  const supabase=getSupabase();
  if(!supabase)throw new Error("Durable recovery ledger is unavailable.");
  const {data,error}=await supabase.rpc("register_mutation_recovery_v1",{
    target_project:projectId,
    target_scope:scope,
    target_kind:intent.kind,
    target_request_key:intent.requestKey,
    target_payload:intent.payload,
    target_started_at:intent.startedAt
  });
  if(error)throw error;
  return normalizeRecord<T>(data);
}

export async function markDurableRecoveryVerification(
  projectId:string,
  scope:string,
  requestKey:string,
  state:Exclude<PendingMutationVerification,"unverified">
){
  const supabase=getSupabase();
  if(!supabase)throw new Error("Durable recovery ledger is unavailable.");
  const {error}=await supabase.rpc("mark_mutation_recovery_verification_v1",{
    target_project:projectId,
    target_scope:scope,
    target_request_key:requestKey,
    target_state:state
  });
  if(error)throw error;
}

export async function resolveDurableRecovery(
  projectId:string,
  scope:string,
  requestKey:string,
  resolution:DurableRecoveryResolution
){
  const supabase=getSupabase();
  if(!supabase)throw new Error("Durable recovery ledger is unavailable.");
  const {error}=await supabase.rpc("resolve_mutation_recovery_v1",{
    target_project:projectId,
    target_scope:scope,
    target_request_key:requestKey,
    target_resolution:resolution
  });
  if(error)throw error;
}

export function durableRecoveryToPendingIntent<T extends Record<string,unknown>>(
  record:DurableRecoveryRecord<T>
):PendingMutationIntent<T>{
  return {
    kind:record.mutationKind,
    requestKey:record.requestKey,
    payload:record.payload,
    startedAt:record.startedAt,
    verificationState:record.verificationState,
    lastCheckedAt:record.lastCheckedAt,
    durable:true,
    attemptCount:record.attemptCount,
    lastAttemptAt:record.lastAttemptAt
  };
}
