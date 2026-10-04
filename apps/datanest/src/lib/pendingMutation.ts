"use client";

const PENDING_MUTATION_PREFIX="datanest.pendingMutation.";
export const PENDING_MUTATION_EVENT="datanest:pending-mutation-change";
export const PENDING_MUTATION_AGING_MS=15*60*1000;
export const PENDING_MUTATION_STALE_MS=60*60*1000;

export type PendingMutationVerification="unverified"|"unconfirmed"|"confirmed_absent";
export type PendingMutationAge="recent"|"aging"|"stale";
export type PendingMutationClearReason="confirmed"|"confirmed_absent_new_intent"|"durable_resolved";

export type PendingMutationIntent<T extends Record<string,unknown>=Record<string,unknown>>={
  kind:string;
  requestKey:string;
  payload:T;
  startedAt:string;
  verificationState:PendingMutationVerification;
  lastCheckedAt:string|null;
  durable:boolean;
  attemptCount:number;
  lastAttemptAt:string|null;
};

function storageKey(scope:string){
  return PENDING_MUTATION_PREFIX+scope;
}

function notifyPendingMutationChange(scope:string){
  try{
    window.dispatchEvent(new CustomEvent(PENDING_MUTATION_EVENT,{detail:{scope}}));
  }catch{
    // Same-tab notification is a UX aid; session storage remains the continuity source.
  }
}

function validIntent(value:unknown):value is PendingMutationIntent{
  if(!value||typeof value!=="object")return false;
  const item=value as Record<string,unknown>;
  const verification=item.verificationState;
  return typeof item.kind==="string"
    &&typeof item.requestKey==="string"
    &&item.requestKey.length>0
    &&typeof item.startedAt==="string"
    &&Boolean(item.payload)
    &&typeof item.payload==="object"
    &&!Array.isArray(item.payload)
    &&(
      verification===undefined
      ||verification==="unverified"
      ||verification==="unconfirmed"
      ||verification==="confirmed_absent"
    )
    &&(item.lastCheckedAt===undefined||item.lastCheckedAt===null||typeof item.lastCheckedAt==="string")
    &&(item.durable===undefined||typeof item.durable==="boolean")
    &&(item.attemptCount===undefined||(typeof item.attemptCount==="number"&&Number.isInteger(item.attemptCount)&&item.attemptCount>=0))
    &&(item.lastAttemptAt===undefined||item.lastAttemptAt===null||typeof item.lastAttemptAt==="string");
}

function normalizeIntent<T extends Record<string,unknown>>(value:PendingMutationIntent<T>):PendingMutationIntent<T>{
  return {
    ...value,
    verificationState:value.verificationState||"unverified",
    lastCheckedAt:value.lastCheckedAt||null,
    durable:value.durable===true,
    attemptCount:Number.isInteger(value.attemptCount)&&value.attemptCount>=0?value.attemptCount:0,
    lastAttemptAt:value.lastAttemptAt||null
  };
}

export function classifyPendingMutationAge(startedAt:string,nowMs=Date.now()):PendingMutationAge{
  const startedMs=Date.parse(startedAt);
  if(!Number.isFinite(startedMs))return "stale";
  const age=Math.max(0,nowMs-startedMs);
  if(age>=PENDING_MUTATION_STALE_MS)return "stale";
  if(age>=PENDING_MUTATION_AGING_MS)return "aging";
  return "recent";
}

export function loadPendingMutation<T extends Record<string,unknown>>(scope:string):PendingMutationIntent<T>|null{
  try{
    const raw=window.sessionStorage.getItem(storageKey(scope));
    if(!raw)return null;
    const parsed=JSON.parse(raw) as unknown;
    if(!validIntent(parsed)){
      window.sessionStorage.removeItem(storageKey(scope));
      return null;
    }
    return normalizeIntent(parsed as PendingMutationIntent<T>);
  }catch{
    try{window.sessionStorage.removeItem(storageKey(scope));}catch{}
    return null;
  }
}

export function getOrCreatePendingMutation<T extends Record<string,unknown>>(
  scope:string,
  kind:string,
  payload:T
):PendingMutationIntent<T>{
  const existing=loadPendingMutation<T>(scope);
  if(existing&&existing.kind===kind&&JSON.stringify(existing.payload)===JSON.stringify(payload))return existing;

  const next:PendingMutationIntent<T>={
    kind,
    requestKey:crypto.randomUUID(),
    payload,
    startedAt:new Date().toISOString(),
    verificationState:"unverified",
    lastCheckedAt:null,
    durable:false,
    attemptCount:0,
    lastAttemptAt:null
  };
  try{
    window.sessionStorage.setItem(storageKey(scope),JSON.stringify(next));
    notifyPendingMutationChange(scope);
  }catch{
    // The request can still proceed; server idempotency remains authoritative for this attempt.
  }
  return next;
}

export function restorePendingMutation<T extends Record<string,unknown>>(
  scope:string,
  intent:PendingMutationIntent<T>
){
  const next=normalizeIntent(intent);
  const existing=loadPendingMutation<T>(scope);
  if(existing&&JSON.stringify(existing)===JSON.stringify(next))return existing;
  try{
    window.sessionStorage.setItem(storageKey(scope),JSON.stringify(next));
    notifyPendingMutationChange(scope);
  }catch{}
  return next;
}

export function markPendingMutationDurable(
  scope:string,
  telemetry?:{attemptCount?:number;lastAttemptAt?:string|null}
){
  const existing=loadPendingMutation(scope);
  if(!existing)return null;
  const attemptCount=Number.isInteger(telemetry?.attemptCount)&&Number(telemetry?.attemptCount)>=0
    ? Number(telemetry?.attemptCount)
    : existing.attemptCount;
  const lastAttemptAt=telemetry?.lastAttemptAt===undefined?existing.lastAttemptAt:telemetry.lastAttemptAt;
  const next:PendingMutationIntent={...existing,durable:true,attemptCount,lastAttemptAt:lastAttemptAt||null};
  if(JSON.stringify(existing)===JSON.stringify(next))return existing;
  return restorePendingMutation(scope,next);
}

export function markPendingMutationVerification(scope:string,state:Exclude<PendingMutationVerification,"unverified">){
  const existing=loadPendingMutation(scope);
  if(!existing)return null;
  const next:PendingMutationIntent={
    ...existing,
    verificationState:state,
    lastCheckedAt:new Date().toISOString()
  };
  try{
    window.sessionStorage.setItem(storageKey(scope),JSON.stringify(next));
    notifyPendingMutationChange(scope);
  }catch{}
  return next;
}

export function clearPendingMutation(scope:string,reason:PendingMutationClearReason){
  const existing=loadPendingMutation(scope);
  if(!existing)return false;
  if(reason==="confirmed_absent_new_intent"&&existing.verificationState!=="confirmed_absent"){
    return false;
  }
  try{
    window.sessionStorage.removeItem(storageKey(scope));
  }catch{
    return false;
  }
  notifyPendingMutationChange(scope);
  return true;
}

export function pendingMutationStorageKey(scope:string){
  return storageKey(scope);
}
