import { MEMORY_LANGUAGE_POLICY } from "./memoryLanguagePolicy.ts";

export async function sha256Text(value:string):Promise<string> {
  const bytes=new TextEncoder().encode(value.trim());
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export function filterCurrentSessionEvidence<T extends {
  projectId:string;
  jobId:string;
  sessionId:string;
}>(events:T[],context:{projectId:string;jobId:string;sessionId:string}):T[] {
  return events.filter(event=>
    event.projectId===context.projectId &&
    event.jobId===context.jobId &&
    event.sessionId===context.sessionId
  );
}

export function buildGovernedPrompt(input:{
  governance:string;
  certifiedMemory:string[];
  job:Record<string,unknown>;
  uncertifiedEvidence:string[];
  userMessage:string;
}):string {
  return [
    input.governance,
    MEMORY_LANGUAGE_POLICY,
    "CERTIFIED PROJECT MEMORY:",
    JSON.stringify(input.certifiedMemory),
    "CURRENT JOB MANIFEST:",
    JSON.stringify(input.job),
    "UNCERTIFIED CURRENT-SESSION EVIDENCE — do not present as established project knowledge:",
    JSON.stringify(input.uncertifiedEvidence),
    "CURRENT USER MESSAGE:",
    input.userMessage
  ].join("\n\n");
}

export type BeginRequestResult={
  id:string;
  isNew:boolean;
  status?:string;
};

export type CachedTurn={
  assistant:string;
  outputTraceId:string;
  sessionId:string;
  inputTraceId?:string;
};

export type ProviderTurn={
  content:string;
  providerMode?:string;
  providerLabel?:string|null;
  inputTokens?:number;
  outputTokens?:number;
};

export type ExecuteChatTurnDeps={
  beginRequest:(input:{message:string})=>Promise<BeginRequestResult>;
  loadCachedTurn?:(request:BeginRequestResult)=>Promise<CachedTurn>;
  stageInput?:(input:{message:string;requestId:string})=>Promise<{
    id?:string;
    traceId?:string;
    sessionId?:string;
  }>;
  finishRequest?:(input:{
    requestId:string;
    status:string;
    errorCategory?:string;
  })=>Promise<unknown>;
  callProvider?:()=>Promise<ProviderTurn>;
  stageOutput?:(input:{
    requestId:string;
    inputEvent:{id?:string;traceId?:string;sessionId?:string};
    provider:ProviderTurn;
  })=>Promise<{id?:string;traceId?:string}>;
  stageEnvelope?:(input:{
    requestId:string;
    inputEvent:{id?:string;traceId?:string;sessionId?:string};
    outputEvent:{id?:string;traceId?:string};
    provider:ProviderTurn;
  })=>Promise<unknown>;
};

export async function executeChatTurn(
  deps:ExecuteChatTurnDeps,
  input:{message:string}
):Promise<Record<string,unknown>> {
  const request=await deps.beginRequest(input);

  if(!request.isNew){
    if(!deps.loadCachedTurn)throw new Error("Cached turn loader is required.");
    const cached=await deps.loadCachedTurn(request);
    return {
      ...cached,
      requestId:request.id,
      providerMode:"cached",
      idempotent:true
    };
  }

  let inputEvent:{id?:string;traceId?:string;sessionId?:string};
  try{
    if(!deps.stageInput)throw new Error("Staging intake is required.");
    inputEvent=await deps.stageInput({message:input.message,requestId:request.id});
  }catch(error){
    if(deps.finishRequest){
      await deps.finishRequest({
        requestId:request.id,
        status:"failed",
        errorCategory:"staging_intake_failed"
      });
    }
    throw error;
  }

  if(!deps.callProvider)throw new Error("Provider route is required.");
  const provider=await deps.callProvider();

  let outputEvent:{id?:string;traceId?:string}={};
  if(deps.stageOutput){
    outputEvent=await deps.stageOutput({
      requestId:request.id,inputEvent,provider
    });
  }
  if(deps.stageEnvelope){
    await deps.stageEnvelope({
      requestId:request.id,inputEvent,outputEvent,provider
    });
  }

  return {
    assistant:provider.content,
    requestId:request.id,
    sessionId:inputEvent.sessionId,
    inputTraceId:inputEvent.traceId,
    outputTraceId:outputEvent.traceId,
    providerMode:provider.providerMode??"external",
    providerLabel:provider.providerLabel??null,
    usage:{
      inputTokens:provider.inputTokens??0,
      outputTokens:provider.outputTokens??0,
      totalTokens:(provider.inputTokens??0)+(provider.outputTokens??0)
    },
    idempotent:false
  };
}
