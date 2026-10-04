import {
  appendFileWarnings,
  buildFileAnalysisPrompt,
  citationForChunk,
  detectCertifiedMemoryConflict,
  groupPropositionSupportByHash,
  parseFileAnalysisProviderContent,
  selectRelevantFileChunks,
  type FileAnalysisChunk,
  type FrozenCertifiedMemory
} from "./datanestFileAnalysis.ts";
import { callOpenAiCompatibleProvider, type ProviderConnection } from "./provider.ts";
import { sha256Text } from "./datanestAiRuntime.ts";
import { updateTrendCandidate } from "./datanestAiLearning.ts";
import { buildEvidenceLanguageMetadata } from "./datanestLanguageMetadata.ts";

const FILE_ANALYSIS_POLICY_VERSION="datanest-ai-governed-memory-v2";
const MAX_ANALYSIS_ATTEMPTS=3;

type AnalysisQueueMessage={
  msg_id:number;
  read_ct:number;
  message:{submissionId?:string};
};

async function ensureEvent(client:any,row:Record<string,unknown>){
  const traceId=String(row.trace_id||"");
  const {data:existing,error:existingError}=await client
    .from("ai_intake_events")
    .select("id,trace_id,content,metadata")
    .eq("trace_id",traceId)
    .maybeSingle();
  if(existingError)throw existingError;
  if(existing)return existing;

  const {data,error}=await client
    .from("ai_intake_events")
    .insert(row)
    .select("id,trace_id,content,metadata")
    .single();
  if(error){
    if(error.code!=="23505")throw error;
    const {data:concurrent,error:concurrentError}=await client
      .from("ai_intake_events")
      .select("id,trace_id,content,metadata")
      .eq("trace_id",traceId)
      .single();
    if(concurrentError||!concurrent)throw concurrentError||error;
    return concurrent;
  }
  if(!data)throw new Error("Unable to persist DataNest file analysis event.");
  return data;
}

async function ensureEnvelope(client:any,row:Record<string,unknown>){
  const outputEventId=String(row.output_event_id||"");
  const {data:existing,error:existingError}=await client
    .from("ai_reasoning_envelopes")
    .select("id")
    .eq("output_event_id",outputEventId)
    .maybeSingle();
  if(existingError)throw existingError;
  if(existing)return existing;

  const {data,error}=await client
    .from("ai_reasoning_envelopes")
    .insert(row)
    .select("id")
    .single();
  if(error){
    if(error.code!=="23505")throw error;
    const {data:concurrent,error:concurrentError}=await client
      .from("ai_reasoning_envelopes")
      .select("id")
      .eq("output_event_id",outputEventId)
      .single();
    if(concurrentError||!concurrent)throw concurrentError||error;
    return concurrent;
  }
  return data;
}

async function loadFrozenSessionEvidence(client:any,ids:string[]):Promise<Array<{id:string;content:string}>>{
  if(!ids.length)return [] as Array<{id:string;content:string}>;
  const {data,error}=await client
    .from("ai_intake_events")
    .select("id,content")
    .in("id",ids);
  if(error)throw error;
  const byId=new Map<string,string>((data||[]).map((item:any)=>[String(item.id),String(item.content||"")] as [string,string]));
  return ids
    .map(id=>({id,content:byId.get(id)||""}))
    .filter(item=>item.content);
}

async function loadAnalysisChunks(client:any,readyItems:any[]):Promise<FileAnalysisChunk[]>{
  const artifactIds=[...new Set(readyItems.map(item=>String(item.artifact_id||"")).filter(Boolean))];
  if(!artifactIds.length)return [];

  const {data,error}=await client
    .from("datanest_chunks")
    .select("id,artifact_id,ordinal,content,metadata")
    .in("artifact_id",artifactIds)
    .order("ordinal",{ascending:true});
  if(error)throw error;

  const itemByArtifact=new Map<string,any>();
  for(const item of readyItems){
    const artifactId=String(item.artifact_id||"");
    if(artifactId&&!itemByArtifact.has(artifactId))itemByArtifact.set(artifactId,item);
  }

  return (data||[]).map((row:any)=>{
    const item=itemByArtifact.get(String(row.artifact_id))||{};
    const metadata=row.metadata&&typeof row.metadata==="object"?row.metadata:{};
    return {
      id:String(row.id),
      artifactId:String(row.artifact_id),
      fileHash:String(item.verified_sha256||metadata.file_sha256||""),
      fileTraceId:String(item.trace_id||metadata.file_trace_id||""),
      fileName:String(item.original_name||"uploaded file"),
      content:String(row.content||""),
      locator:metadata.locator
    } as FileAnalysisChunk;
  }).filter((chunk:FileAnalysisChunk)=>chunk.id&&chunk.fileHash&&chunk.content&&chunk.locator);
}

async function stageFileUploadEvents(client:any,submission:any,readyItems:any[],chunks:FileAnalysisChunk[]){
  const chunkIdsByArtifact=new Map<string,string[]>();
  for(const chunk of chunks){
    const ids=chunkIdsByArtifact.get(chunk.artifactId)||[];
    ids.push(chunk.id);
    chunkIdsByArtifact.set(chunk.artifactId,ids);
  }

  const events=[];
  const firstByHash=new Map<string,any>();
  for(const item of readyItems){
    const hash=String(item.verified_sha256||"");
    const traceId=String(item.trace_id)+"-UPLOAD";
    const content="Uploaded file evidence: "+String(item.original_name||"file");
    const event=await ensureEvent(client,{
      trace_id:traceId,
      project_id:submission.project_id,
      job_id:submission.job_id,
      session_id:submission.session_id,
      source_type:"file_upload",
      source_user_id:submission.user_id,
      client_request_id:submission.client_request_id,
      content,
      content_hash:await sha256Text(content),
      metadata:{
        trust_state:"uncertified",
        submission_id:submission.id,
        item_id:item.id,
        artifact_id:item.artifact_id,
        file_sha256:hash,
        file_trace_id:item.trace_id,
        original_name:item.original_name,
        chunk_ids:chunkIdsByArtifact.get(String(item.artifact_id))||[],
        independence_key:"file-sha256:"+hash
      }
    });
    const entry={event,item};
    events.push(entry);
    if(hash&&!firstByHash.has(hash))firstByHash.set(hash,entry);
  }
  return {events,firstByHash};
}

function embeddedAnswer(readyItems:any[],failedItems:any[],selectedChunks:FileAnalysisChunk[]){
  if(!readyItems.length){
    return "DataNest AI could not analyze this file batch because every uploaded file failed governed processing.";
  }
  if(!selectedChunks.length){
    return "DataNest AI processed the uploaded files but found no extractable text evidence to analyze.";
  }
  return "DataNest AI processed "+readyItems.length+" uploaded file"+(readyItems.length===1?"":"s")+
    " as UNCERTIFIED Job evidence. No external analysis provider was available, so no document propositions were generated.";
}

async function stageDocumentEvidence(input:{
  client:any;
  submission:any;
  propositions:Array<{text:string;supportChunkIds:string[];explicitCertifiedMemoryConflict:boolean}>;
  chunks:FileAnalysisChunk[];
  frozenMemory:FrozenCertifiedMemory[];
  providerLabel:string;
  uploadEventByHash:Map<string,any>;
}){
  const eventIds:string[]=[];
  let propositionIndex=0;
  const learningPolicyOutcome=String(input.submission.learning_policy_outcome||"review_required");
  const learningReuseState=String(input.submission.learning_reuse_state||"runtime_only");
  const learningEligible=
    learningPolicyOutcome==="allow"&&learningReuseState==="project_learning_eligible";

  for(const proposition of input.propositions){
    propositionIndex++;
    const groups=groupPropositionSupportByHash(proposition,input.chunks);
    for(const group of groups){
      const conflict=detectCertifiedMemoryConflict(proposition.text,input.frozenMemory);
      const hasConflict=proposition.explicitCertifiedMemoryConflict||conflict.conflict;
      const supportChunkIds=group.support.map(chunk=>chunk.id);
      const citations=group.support.map(citationForChunk);
      const parent=input.uploadEventByHash.get(group.fileHash)?.event||null;
      const traceId=String(input.submission.trace_id)+"-P"+
        String(propositionIndex).padStart(2,"0")+"-"+group.fileHash.slice(0,12);

      const event=await ensureEvent(input.client,{
        trace_id:traceId,
        project_id:input.submission.project_id,
        job_id:input.submission.job_id,
        session_id:input.submission.session_id,
        source_type:"document_evidence",
        source_user_id:input.submission.user_id,
        source_provider:input.providerLabel,
        parent_event_id:parent?parent.id:null,
        content:proposition.text,
        content_hash:await sha256Text(proposition.text),
        metadata:{
          ...buildEvidenceLanguageMetadata({content:proposition.text}),
          trust_state:"uncertified",
          learning_eligible:learningEligible,
          reuse_state:learningReuseState,
          learning_policy_outcome:learningPolicyOutcome,
          learning_policy_reason_code:String(input.submission.learning_policy_reason_code||"policy_unresolved"),
          learning_policy_version:String(input.submission.learning_policy_version||"unresolved"),
          learning_decision_record_id:input.submission.learning_decision_record_id
            ?String(input.submission.learning_decision_record_id)
            :null,
          submission_id:input.submission.id,
          file_sha256:group.fileHash,
          independence_key:"file-sha256:"+group.fileHash,
          support_chunk_ids:supportChunkIds,
          support_hashes:[group.fileHash],
          citations,
          certified_memory_conflict:hasConflict,
          certified_memory_conflict_ids:conflict.memoryIds,
          certified_memory_conflict_reason:conflict.reason,
          provider_conflict_hint:proposition.explicitCertifiedMemoryConflict
        }
      });
      eventIds.push(String(event.id));

      await updateTrendCandidate({
        staging:input.client,
        projectId:String(input.submission.project_id),
        inputEventId:String(event.id),
        policyVersion:FILE_ANALYSIS_POLICY_VERSION
      });
    }
  }
  return eventIds;
}

export async function processFileSubmissionAnalysis(client:any,submissionId:string){
  const {data:submission,error:submissionError}=await client
    .from("ai_file_submissions")
    .select("*")
    .eq("id",submissionId)
    .maybeSingle();
  if(submissionError)throw submissionError;
  if(!submission)return {submissionId,status:"MISSING",ack:true};
  if(submission.response_event_id){
    return {submissionId,status:String(submission.status),ack:true,idempotent:true};
  }

  const {data:items,error:itemsError}=await client
    .from("ai_file_submission_items")
    .select("*")
    .eq("submission_id",submissionId)
    .order("client_index",{ascending:true});
  if(itemsError)throw itemsError;

  const allItems=items||[];
  const terminal=allItems.every((item:any)=>item.status==="READY"||item.status==="FAILED");
  if(!allItems.length||!terminal)return {submissionId,status:"WAITING",ack:false};

  const attempt=Number(submission.analysis_attempt_count||0)+1;
  if(attempt>MAX_ANALYSIS_ATTEMPTS){
    await client.from("ai_file_submissions").update({
      status:"FAILED",
      analysis_attempt_count:attempt,
      last_analysis_error_code:"ANALYSIS_RETRY_EXHAUSTED",
      last_analysis_error_message:"File analysis failed after three attempts.",
      completed_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("id",submissionId);
    return {submissionId,status:"FAILED",ack:true};
  }

  await client.from("ai_file_submissions").update({
    status:"ANALYZING",
    analysis_attempt_count:attempt,
    last_analysis_error_code:null,
    last_analysis_error_message:null,
    updated_at:new Date().toISOString()
  }).eq("id",submissionId);

  try{
    const readyItems=allItems.filter((item:any)=>item.status==="READY"&&item.artifact_id&&item.verified_sha256);
    const failedItems=allItems.filter((item:any)=>item.status==="FAILED");
    const failedFiles=failedItems.map((item:any)=>({
      name:String(item.original_name||"file"),
      code:item.last_error_code?String(item.last_error_code):null,
      message:item.last_error_message?String(item.last_error_message):null
    }));

    const chunks=await loadAnalysisChunks(client,readyItems);
    const frozenMemory=Array.isArray(submission.certified_memory_snapshot)
      ?submission.certified_memory_snapshot as FrozenCertifiedMemory[]
      :[];
    const frozenEventIds=Array.isArray(submission.frozen_session_event_ids)
      ?submission.frozen_session_event_ids.map((id:any)=>String(id))
      :[];
    const frozenEvents=await loadFrozenSessionEvidence(client,frozenEventIds);
    const query=[
      String(submission.instruction||""),
      ...frozenEvents.map(item=>item.content),
      ...frozenMemory.map(item=>String(item.normalized_knowledge||""))
    ].filter(Boolean).join("\n");

    const selected=selectRelevantFileChunks({chunks,query});
    const uploadEvents=await stageFileUploadEvents(client,submission,readyItems,chunks);

    let providerMode="embedded";
    let providerLabel="embedded";
    let providerAnswer=embeddedAnswer(readyItems,failedItems,selected);
    let propositions:Array<{text:string;supportChunkIds:string[];explicitCertifiedMemoryConflict:boolean}>=[];

    if(readyItems.length&&selected.length){
      const {data:connectionData,error:connectionError}=await client.rpc(
        "service_get_ai_provider_connection_v3",{
          target_project:submission.project_id,
          target_user:submission.user_id,
          target_connection:null
        }
      );
      if(connectionError)throw connectionError;

      if(connectionData){
        const connection=connectionData as ProviderConnection;
        try{
          const provider=await callOpenAiCompatibleProvider({
            connection,
            governedPrompt:buildFileAnalysisPrompt({
              instruction:submission.instruction?String(submission.instruction):null,
              selectedChunks:selected,
              certifiedMemory:frozenMemory,
              frozenSessionEvidence:frozenEvents.map(item=>item.content),
              failedFiles
            }),
            maxOutputTokens:4000
          });
          const parsed=parseFileAnalysisProviderContent(
            provider.content,
            selected.map(chunk=>chunk.id)
          );
          providerMode="external";
          providerLabel=connection.label;
          providerAnswer=parsed.answer;
          propositions=parsed.propositions;
        }catch{
          providerMode="embedded";
          providerLabel="embedded";
          providerAnswer="DataNest AI processed the uploaded evidence, but external semantic analysis did not complete. The file evidence remains traceable and UNCERTIFIED.";
        }
      }
    }

    const propositionEventIds=await stageDocumentEvidence({
      client,
      submission,
      propositions,
      chunks:selected,
      frozenMemory,
      providerLabel,
      uploadEventByHash:uploadEvents.firstByHash
    });

    const propositionChunkIds=new Set(propositions.flatMap(item=>item.supportChunkIds));
    const citedChunks=propositionChunkIds.size
      ?selected.filter(chunk=>propositionChunkIds.has(chunk.id))
      :selected;
    const citations=citedChunks.map(citationForChunk);
    const finalAnswer=appendFileWarnings(providerAnswer,failedFiles);
    const responseTrace=String(submission.trace_id)+"-RESPONSE";
    const response=await ensureEvent(client,{
      trace_id:responseTrace,
      project_id:submission.project_id,
      job_id:submission.job_id,
      session_id:submission.session_id,
      source_type:"datanest_ai",
      source_user_id:submission.user_id,
      source_provider:providerLabel,
      client_request_id:submission.client_request_id,
      content:finalAnswer,
      content_hash:await sha256Text(finalAnswer),
      metadata:{
        trust_state:"uncertified",
        submission_id:submission.id,
        provider_mode:providerMode,
        citations,
        selected_chunk_ids:selected.map(chunk=>chunk.id),
        proposition_event_ids:propositionEventIds,
        failed_files:failedFiles,
        warning_count:failedFiles.length,
        frozen_certified_memory_ids:submission.certified_memory_ids||[]
      }
    });

    const uploadEventIds=uploadEvents.events.map((entry:any)=>String(entry.event.id));
    const inputEventIds=[
      ...frozenEventIds,
      ...uploadEventIds,
      ...propositionEventIds
    ];
    await ensureEnvelope(client,{
      project_id:submission.project_id,
      job_id:submission.job_id,
      session_id:submission.session_id,
      output_event_id:response.id,
      provider_route:"file-analysis:"+providerMode,
      policy_version:FILE_ANALYSIS_POLICY_VERSION,
      input_event_ids:[...new Set(inputEventIds)],
      certified_memory_ids:Array.isArray(submission.certified_memory_ids)?submission.certified_memory_ids:[],
      uncertified_event_ids:[...new Set(inputEventIds)],
      request_status:providerMode==="external"?"file_analysis_succeeded":"file_analysis_embedded"
    });

    const finalStatus=failedFiles.length?"RESPONDED_WITH_WARNINGS":"RESPONDED";
    const {error:updateError}=await client.from("ai_file_submissions").update({
      response_event_id:response.id,
      status:finalStatus,
      completed_at:new Date().toISOString(),
      last_analysis_error_code:null,
      last_analysis_error_message:null,
      updated_at:new Date().toISOString()
    }).eq("id",submissionId);
    if(updateError)throw updateError;

    return {
      submissionId,
      status:finalStatus,
      responseEventId:String(response.id),
      providerMode,
      readyFiles:readyItems.length,
      failedFiles:failedItems.length,
      propositions:propositionEventIds.length,
      ack:true
    };
  }catch(error){
    const terminalFailure=attempt>=MAX_ANALYSIS_ATTEMPTS;
    await client.from("ai_file_submissions").update({
      status:terminalFailure?"FAILED":"ANALYZING",
      last_analysis_error_code:terminalFailure?"ANALYSIS_RETRY_EXHAUSTED":"ANALYSIS_FAILED",
      last_analysis_error_message:error instanceof Error?error.message:"File analysis failed.",
      completed_at:terminalFailure?new Date().toISOString():null,
      updated_at:new Date().toISOString()
    }).eq("id",submissionId);

    return {
      submissionId,
      status:terminalFailure?"FAILED":"ANALYZING",
      error:terminalFailure?"ANALYSIS_RETRY_EXHAUSTED":"ANALYSIS_FAILED",
      ack:terminalFailure
    };
  }
}

export async function drainFileAnalysis(client:any){
  const {data,error}=await client.rpc("service_claim_datanest_file_analysis",{
    target_limit:2,
    visibility_seconds:180
  });
  if(error)throw error;

  const results=[];
  for(const message of (data||[]) as AnalysisQueueMessage[]){
    const submissionId=String(message.message?.submissionId||"");
    if(!submissionId){
      await client.rpc("service_ack_datanest_file_analysis",{target_message:message.msg_id});
      results.push({msgId:message.msg_id,status:"INVALID_MESSAGE"});
      continue;
    }

    const result=await processFileSubmissionAnalysis(client,submissionId);
    if(result.ack){
      const {error:ackError}=await client.rpc(
        "service_ack_datanest_file_analysis",
        {target_message:message.msg_id}
      );
      if(ackError)throw ackError;
    }
    results.push({msgId:message.msg_id,readCt:message.read_ct,...result});
  }
  return results;
}
