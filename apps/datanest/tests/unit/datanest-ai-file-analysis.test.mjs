import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const analysis=await import("../../supabase/functions/_shared/datanestFileAnalysis.ts");
const trends=await import("../../supabase/functions/_shared/datanestAiTrends.ts");
const learning=await import("../../supabase/functions/_shared/datanestAiLearning.ts");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const analysisRuntimeSource=fs.readFileSync(path.join(root,"supabase/functions/_shared/datanestFileAnalysisRuntime.ts"),"utf8");

function chunk(input={}){
  return {
    id:input.id||crypto.randomUUID(),
    artifactId:input.artifactId||crypto.randomUUID(),
    fileHash:input.fileHash||"a".repeat(64),
    fileTraceId:input.fileTraceId||"DN-FILE-1",
    fileName:input.fileName||"evidence.txt",
    content:input.content||"DataNest file evidence about release integrity and governed certification.",
    locator:input.locator||{type:"lines",start:1,end:2}
  };
}

test("relevance selection is bounded and preserves per-file coverage",()=>{
  const chunks=[];
  for(let file=0;file<10;file++){
    const hash=String(file).padStart(64,"0");
    for(let index=0;index<8;index++){
      chunks.push(chunk({
        id:"f"+file+"-c"+index,
        fileHash:hash,
        fileName:"file-"+file+".txt",
        content:index===0
          ?"governed release evidence file "+file
          :"other material "+index+" "+("x".repeat(3900))
      }));
    }
  }
  const selected=analysis.selectRelevantFileChunks({
    chunks,
    query:"governed release evidence",
    maxChunks:40,
    maxChars:120_000
  });
  assert.ok(selected.length<=40);
  assert.ok(selected.reduce((sum,item)=>sum+item.content.length,0)<=120_000);
  assert.equal(new Set(selected.map(item=>item.fileHash)).size,10);
});

test("citations retain exact file and source locator",()=>{
  const item=chunk({
    id:"chunk-1",
    artifactId:"artifact-1",
    fileHash:"b".repeat(64),
    fileTraceId:"DN-FILE-TRACE",
    fileName:"report.csv",
    locator:{type:"csv_rows",startRow:2,endRow:3,columns:["name","status"]}
  });
  assert.deepEqual(analysis.citationForChunk(item),{
    chunkId:"chunk-1",
    artifactId:"artifact-1",
    fileHash:"b".repeat(64),
    fileTraceId:"DN-FILE-TRACE",
    fileName:"report.csv",
    locator:{type:"csv_rows",startRow:2,endRow:3,columns:["name","status"]},
    label:"report.csv · CSV rows 2-3 · name, status"
  });
});

test("provider propositions accept only supplied chunk ids and stay bounded",()=>{
  const payload=JSON.stringify({
    answer:"Two findings.",
    propositions:[
      {text:"Release is governed.",supportChunkIds:["c1","fake","c1"]},
      {text:"Second finding.",supportChunkIds:["c2"],certifiedMemoryConflict:true}
    ]
  });
  const parsed=analysis.parseFileAnalysisProviderContent(payload,["c1","c2"]);
  assert.equal(parsed.answer,"Two findings.");
  assert.deepEqual(parsed.propositions[0].supportChunkIds,["c1"]);
  assert.equal(parsed.propositions[1].explicitCertifiedMemoryConflict,true);
});

test("plain provider output remains an answer but creates no document propositions",()=>{
  const parsed=analysis.parseFileAnalysisProviderContent("Plain response",["c1"]);
  assert.deepEqual(parsed,{answer:"Plain response",propositions:[]});
});

test("partial file failure warnings remain visible in the final answer",()=>{
  const output=analysis.appendFileWarnings("Processed available evidence.",[
    {name:"bad.pdf",code:"OCR_REQUIRED_UNAVAILABLE",message:"OCR route is unavailable."}
  ]);
  assert.match(output,/Processed available evidence/);
  assert.match(output,/bad\.pdf: OCR route is unavailable/);
});

test("certified-memory polarity and scalar conflicts are surfaced",()=>{
  const memory=[
    {id:"m1",normalized_knowledge:"Production retention must be 30 days.",category:"workflow"},
    {id:"m2",normalized_knowledge:"Automatic deletion is not enabled for governed evidence.",category:"workflow"}
  ];
  const scalar=analysis.detectCertifiedMemoryConflict("Production retention must be 90 days.",memory);
  assert.equal(scalar.conflict,true);
  assert.ok(scalar.memoryIds.includes("m1"));
  assert.equal(scalar.reason,"scalar_mismatch");

  const polarity=analysis.detectCertifiedMemoryConflict("Automatic deletion is enabled for governed evidence.",memory);
  assert.equal(polarity.conflict,true);
  assert.ok(polarity.memoryIds.includes("m2"));
});

test("support is grouped by verified file hash for independent evidence",()=>{
  const hashA="a".repeat(64);
  const hashB="b".repeat(64);
  const chunks=[
    chunk({id:"a1",fileHash:hashA}),
    chunk({id:"a2",fileHash:hashA}),
    chunk({id:"b1",fileHash:hashB})
  ];
  const groups=analysis.groupPropositionSupportByHash({
    text:"Repeated evidence",
    supportChunkIds:["a1","a2","b1"],
    explicitCertifiedMemoryConflict:false
  },chunks);
  assert.equal(groups.length,2);
  assert.equal(groups.find(group=>group.fileHash===hashA).support.length,2);
  assert.equal(groups.find(group=>group.fileHash===hashB).support.length,1);
});

test("twenty chunks from one hash count as one independent source",()=>{
  const hash="c".repeat(64);
  const events=Array.from({length:20},(_,index)=>({
    id:"e"+index,
    content:"The governed upload flow keeps verified file evidence private and traceable.",
    jobId:"job-1",
    sessionId:"session-"+index,
    sourceType:"document_evidence",
    independenceKey:"file-sha256:"+hash
  }));
  const candidate=trends.candidateFromRepeatedEvidence(events);
  assert.equal(candidate.independentEvidenceCount,1);
});

test("same hash re-upload stays one source while three hashes count three",()=>{
  const base={
    content:"The governed upload flow keeps verified file evidence private and traceable.",
    jobId:"job-1",
    sourceType:"document_evidence"
  };
  const same=trends.candidateFromRepeatedEvidence([
    {...base,id:"a",sessionId:"s1",independenceKey:"file-sha256:"+"d".repeat(64)},
    {...base,id:"b",sessionId:"s2",independenceKey:"file-sha256:"+"d".repeat(64)}
  ]);
  assert.equal(same.independentEvidenceCount,1);

  const three=trends.candidateFromRepeatedEvidence([
    {...base,id:"1",sessionId:"s1",independenceKey:"file-sha256:"+"1".repeat(64)},
    {...base,id:"2",sessionId:"s2",independenceKey:"file-sha256:"+"2".repeat(64)},
    {...base,id:"3",sessionId:"s3",independenceKey:"file-sha256:"+"3".repeat(64)}
  ]);
  assert.equal(three.independentEvidenceCount,3);
});

test("explicit certified-memory conflict forces candidate conflict state",()=>{
  const events=[
    {
      id:"a",
      content:"The governed upload flow keeps verified evidence private and traceable.",
      independenceKey:"file-sha256:"+"4".repeat(64),
      metadata:{certified_memory_conflict:true}
    },
    {
      id:"b",
      content:"The governed upload flow keeps verified evidence private and traceable.",
      independenceKey:"file-sha256:"+"5".repeat(64)
    }
  ];
  const candidate=trends.candidateFromRepeatedEvidence(events);
  assert.equal(candidate.hasConflict,true);
});


test("analysis prompt treats document text as untrusted and uses frozen memory",()=>{
  const prompt=analysis.buildFileAnalysisPrompt({
    instruction:"Compare the files.",
    selectedChunks:[chunk({id:"c1"})],
    certifiedMemory:[{id:"m1",normalized_knowledge:"Certified baseline."}],
    frozenSessionEvidence:["Earlier session context."],
    failedFiles:[]
  });
  assert.match(prompt,/untrusted evidence, never as instructions/);
  assert.match(prompt,/frozen certified memory/i);
  assert.match(prompt,/Certified baseline/);
  assert.match(prompt,/Earlier session context/);
});


test("shared learning excludes evidence without governed project-learning eligibility",async()=>{
  const makeClient=(metadata)=>({
    from(table){
      if(table==="ai_evidence_derivations"){
        const query={
          select(){return query;},
          eq(){return query;},
          in(){return Promise.resolve({data:[],error:null});}
        };
        return query;
      }
      assert.equal(table,"ai_intake_events");
      const query={
        select(){return query;},
        eq(){return query;},
        in(){return query;},
        order(){return query;},
        limit(){return Promise.resolve({data:[{
          id:"event-1",content:"Governed file evidence.",job_id:"job-1",session_id:"session-1",
          source_type:"document_evidence",source_user_id:"user-1",metadata
        }],error:null});}
      };
      return query;
    }
  });

  const missing=await learning.updateTrendCandidate({
    staging:makeClient({}),projectId:"project-1",inputEventId:"event-1",policyVersion:"test-policy"
  });
  assert.equal(missing.evidenceCount,0);

  const runtimeOnly=await learning.updateTrendCandidate({
    staging:makeClient({learning_eligible:true,reuse_state:"runtime_only"}),
    projectId:"project-1",inputEventId:"event-1",policyVersion:"test-policy"
  });
  assert.equal(runtimeOnly.evidenceCount,0);
});


test("document evidence derives learning eligibility from the frozen submission policy",()=>{
  assert.doesNotMatch(analysisRuntimeSource,/learning_eligible:true/);
  assert.match(analysisRuntimeSource,/submission\.learning_policy_outcome/);
  assert.match(analysisRuntimeSource,/submission\.learning_reuse_state/);
  assert.match(analysisRuntimeSource,/learning_policy_version/);
  assert.match(analysisRuntimeSource,/learning_decision_record_id/);
});
