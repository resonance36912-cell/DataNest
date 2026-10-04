"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSessionDraftState } from "@/lib/sessionDraft";
import { useSingleFlight } from "@/lib/singleFlight";
import PageHeader from "@/components/platform/PageHeader";
import StatusIndicator from "@/components/platform/StatusIndicator";
import EvidencePanel from "@/components/platform/EvidencePanel";

type Role="owner"|"admin"|"operator"|"viewer";
type Channel={
  id:string;project_id:string;channel_key:string;name:string;description:string|null;
  scope:"project"|"job";job_id:string|null;status:string;created_by:string|null;created_at:string;
};
type Job={id:string;job_number:number;title:string;status:string};
type Thread={id:string;project_id:string;channel_id:string;title:string;status:string;created_by:string;created_at:string;updated_at:string};
type Message={
  id:string;project_id:string;thread_id:string;author_user_id:string|null;initiated_by:string|null;
  actor_kind:"human"|"datanest_ai"|"system";message_type:string;command_name:string|null;
  body:string;source_request_id:string|null;source_trace_id:string|null;created_at:string;
};
type Decision={
  id:string;trace_key:string;title:string;decision_text:string;status:string;
  proposed_by:string;reviewed_by:string|null;reviewed_at:string|null;created_at:string;
};
type ActionItem={
  id:string;trace_key:string;description:string;status:string;proposed_by:string;
  owner_user_id:string|null;due_at:string|null;reviewed_by:string|null;completed_at:string|null;created_at:string;
};
type Learning={
  id:string;trace_key:string;normalized_knowledge:string;category:string;status:string;
  confidence:number;proposed_by:string;reviewed_by:string|null;reviewed_at:string|null;
  promoted_memory_id:string|null;contribution_id:string|null;created_at:string;
};
type AiTurn={
  assistant?:string;requestId?:string;sessionId?:string;outputTraceId?:string;inputTraceId?:string;
  requestStatus?:string;providerMode?:string;
};

const commandOptions=[
  {value:"discussion",label:"Discussion"},
  {value:"answer",label:"@DataNest answer"},
  {value:"summarize",label:"@DataNest summarize"},
  {value:"record_decision",label:"@DataNest record-decision"},
  {value:"extract_actions",label:"@DataNest extract-actions"},
  {value:"propose_learning",label:"@DataNest propose-learning"}
];

function fmtDate(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}
function jobCode(job:Job){return "JOB-"+String(job.job_number).padStart(5,"0");}
function label(value:string){return value.replaceAll("_"," ");}

export default function ThinkTankWorkspace({
  projectId,currentUserId,currentUserEmail,role,canOperate,canReview,setNotice,setError
}:{
  projectId:string;
  currentUserId:string;
  currentUserEmail:string;
  role:Role;
  canOperate:boolean;
  canReview:boolean;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [channels,setChannels]=useState<Channel[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [selectedChannelId,setSelectedChannelId]=useState("");
  const [threads,setThreads]=useState<Thread[]>([]);
  const [selectedThreadId,setSelectedThreadId]=useState("");
  const [messages,setMessages]=useState<Message[]>([]);
  const [decisions,setDecisions]=useState<Decision[]>([]);
  const [actions,setActions]=useState<ActionItem[]>([]);
  const [learnings,setLearnings]=useState<Learning[]>([]);
  const [aiSessionId,setAiSessionId]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const {activeAction,run:runSingleFlight}=useSingleFlight();
  const threadLoadGeneration=useRef(0);

  const draftPrefix="thinktank:"+projectId+":"+currentUserId+":";
  const [channelName,setChannelName,channelNameDraft]=useSessionDraftState(draftPrefix+"channel-name","");
  const [channelDescription,setChannelDescription,channelDescriptionDraft]=useSessionDraftState(draftPrefix+"channel-description","");
  const [channelScope,setChannelScope]=useState<"project"|"job">("project");
  const [channelJobId,setChannelJobId]=useState("");
  const [threadTitle,setThreadTitle,threadTitleDraft]=useSessionDraftState(draftPrefix+"thread:"+selectedChannelId+":title","");
  const [draft,setDraft,messageDraft]=useSessionDraftState(draftPrefix+"message:"+selectedThreadId,"");
  const [command,setCommand]=useState("discussion");
  const hasSessionDraft=[channelNameDraft,channelDescriptionDraft,threadTitleDraft,messageDraft].some(item=>item.hasStoredDraft);

  const selectedChannel=useMemo(
    ()=>channels.find(item=>item.id===selectedChannelId)||null,
    [channels,selectedChannelId]
  );
  const selectedThread=useMemo(
    ()=>threads.find(item=>item.id===selectedThreadId)||null,
    [threads,selectedThreadId]
  );
  const jobLookup=useMemo(()=>new Map(jobs.map(job=>[job.id,job])),[jobs]);

  const loadCore=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    setLoading(true);
    const [channelResult,jobResult]=await Promise.all([
      supabase.from("think_tank_channels")
        .select("id,project_id,channel_key,name,description,scope,job_id,status,created_by,created_at")
        .eq("project_id",projectId).eq("status","active").order("created_at"),
      supabase.from("jobs")
        .select("id,job_number,title,status")
        .eq("project_id",projectId).order("updated_at",{ascending:false}).limit(100)
    ]);
    const firstError=channelResult.error||jobResult.error;
    if(firstError)setError(firstError.message);
    else{
      const nextChannels=(channelResult.data||[]) as Channel[];
      setChannels(nextChannels);
      setJobs((jobResult.data||[]) as Job[]);
      setSelectedChannelId(current=>
        current&&nextChannels.some(item=>item.id===current)
          ?current
          :nextChannels[0]?.id||""
      );
    }
    setLoading(false);
  },[projectId,setError]);

  const loadThreads=useCallback(async(channelId:string)=>{
    const supabase=getSupabase();
    if(!supabase||!channelId){setThreads([]);setSelectedThreadId("");return;}
    const {data,error}=await supabase.from("think_tank_threads")
      .select("id,project_id,channel_id,title,status,created_by,created_at,updated_at")
      .eq("channel_id",channelId).neq("status","archived").order("updated_at",{ascending:false});
    if(error){setError(error.message);return;}
    const next=(data||[]) as Thread[];
    setThreads(next);
    setSelectedThreadId(current=>
      current&&next.some(item=>item.id===current)
        ?current
        :next[0]?.id||""
    );
  },[setError]);

  const loadThread=useCallback(async(threadId:string)=>{
    const requestGeneration=++threadLoadGeneration.current;
    const supabase=getSupabase();
    if(!supabase||!threadId){
      setMessages([]);setDecisions([]);setActions([]);setLearnings([]);setAiSessionId("");
      return;
    }
    const [messageResult,decisionResult,actionResult,learningResult,sessionResult]=await Promise.all([
      supabase.from("think_tank_messages")
        .select("id,project_id,thread_id,author_user_id,initiated_by,actor_kind,message_type,command_name,body,source_request_id,source_trace_id,created_at")
        .eq("thread_id",threadId).order("created_at"),
      supabase.from("think_tank_decisions")
        .select("id,trace_key,title,decision_text,status,proposed_by,reviewed_by,reviewed_at,created_at")
        .eq("thread_id",threadId).order("created_at",{ascending:false}),
      supabase.from("think_tank_action_items")
        .select("id,trace_key,description,status,proposed_by,owner_user_id,due_at,reviewed_by,completed_at,created_at")
        .eq("thread_id",threadId).order("created_at",{ascending:false}),
      supabase.from("think_tank_learning_candidates")
        .select("id,trace_key,normalized_knowledge,category,status,confidence,proposed_by,reviewed_by,reviewed_at,promoted_memory_id,contribution_id,created_at")
        .eq("thread_id",threadId).order("created_at",{ascending:false}),
      supabase.from("think_tank_ai_sessions")
        .select("session_id").eq("thread_id",threadId).eq("user_id",currentUserId).maybeSingle()
    ]);
    if(requestGeneration!==threadLoadGeneration.current)return;
    const firstError=messageResult.error||decisionResult.error||actionResult.error||learningResult.error||sessionResult.error;
    if(firstError){setError(firstError.message);return;}
    setMessages((messageResult.data||[]) as Message[]);
    setDecisions((decisionResult.data||[]) as Decision[]);
    setActions((actionResult.data||[]) as ActionItem[]);
    setLearnings((learningResult.data||[]) as Learning[]);
    setAiSessionId(String((sessionResult.data as {session_id?:string}|null)?.session_id||""));
  },[currentUserId,setError]);

  useEffect(()=>{void loadCore();},[loadCore]);
  useEffect(()=>{void loadThreads(selectedChannelId);},[selectedChannelId,loadThreads]);
  useEffect(()=>{void loadThread(selectedThreadId);},[selectedThreadId,loadThread]);

  async function createChannel(event:FormEvent){
    event.preventDefault();
    if(!canOperate||!channelName.trim())return;
    const supabase=getSupabase();
    if(!supabase)return;
    await runSingleFlight("create-channel",async()=>{
      setBusy(true);setError("");setNotice("Creating Think Tank channel…");
      try{
        const {error}=await supabase.rpc("create_think_tank_channel_v1",{
          target_project:projectId,
          target_name:channelName.trim(),
          target_description:channelDescription.trim()||null,
          target_scope:channelScope,
          target_job:channelScope==="job"?(channelJobId||null):null
        });
        if(error)throw error;
        setChannelName("");setChannelDescription("");setChannelJobId("");
        setNotice("Think Tank channel created.");
        await loadCore();
      }catch(actionError){
        setError(actionError instanceof Error?actionError.message:"Unable to create Think Tank channel.");
      }finally{
        setBusy(false);
      }
    });
  }

  async function createThread(event:FormEvent){
    event.preventDefault();
    if(!selectedChannelId||!threadTitle.trim())return;
    const supabase=getSupabase();
    if(!supabase)return;
    await runSingleFlight("create-thread",async()=>{
      setBusy(true);setError("");setNotice("Creating Think Tank thread…");
      try{
        const {data,error}=await supabase.rpc("create_think_tank_thread_v1",{
          target_channel:selectedChannelId,target_title:threadTitle.trim()
        });
        if(error)throw error;
        setThreadTitle("");
        setNotice("Think Tank thread created.");
        await loadThreads(selectedChannelId);
        if(data)setSelectedThreadId(String(data));
      }catch(actionError){
        setError(actionError instanceof Error?actionError.message:"Unable to create Think Tank thread.");
      }finally{
        setBusy(false);
      }
    });
  }

  function buildAiPrompt(kind:string,userText:string){
    const transcript=messages.slice(-20).map(item=>{
      const who=item.actor_kind==="datanest_ai"?"DataNest AI":"Stakeholder";
      return who+": "+item.body;
    }).join("\n");
    if(kind==="summarize"){
      return [
        "THINK TANK COMMAND: SUMMARIZE",
        "Summarize the discussion below. Separate established facts, proposals, unresolved questions and next actions. Do not claim any proposal is a confirmed decision.",
        transcript,
        userText?("Focus: "+userText):""
      ].filter(Boolean).join("\n\n");
    }
    if(kind==="extract_actions"){
      return [
        "THINK TANK COMMAND: EXTRACT ACTIONS",
        "Extract only concrete candidate actions from the discussion below.",
        "Return one candidate per line exactly as: ACTION: <action text>",
        "These are proposals only and must not be described as approved assignments.",
        transcript,
        userText?("Additional instruction: "+userText):""
      ].filter(Boolean).join("\n\n");
    }
    return [
      "THINK TANK COMMAND: ANSWER",
      "Answer the stakeholder question using the current Job context, certified project memory and the Think Tank excerpt below.",
      "Clearly distinguish confirmed knowledge from proposals or uncertified discussion.",
      transcript,
      "Question: "+userText
    ].join("\n\n");
  }

  async function runAiCommand(kind:string,userText:string,commandMessageId:string){
    if(!selectedChannel?.job_id||selectedChannel.scope!=="job"){
      throw new Error("DataNest AI commands require a Job-linked Think Tank channel.");
    }
    if(!selectedThreadId)throw new Error("Select a Think Tank thread first.");
    const supabase=getSupabase();
    if(!supabase)throw new Error("Supabase is unavailable.");

    const clientRequestId=crypto.randomUUID();
    const {data,error}=await supabase.functions.invoke("datanest-ai-chat",{
      body:{
        action:"chat",
        jobId:selectedChannel.job_id,
        sessionId:aiSessionId||null,
        clientRequestId,
        message:buildAiPrompt(kind,userText)
      }
    });
    if(error)throw error;
    const payload=(data||{}) as AiTurn;
    const assistant=String(payload.assistant||"").trim();
    const requestId=String(payload.requestId||"");
    const nextSession=String(payload.sessionId||"");
    const outputTraceId=String(payload.outputTraceId||"");
    if(!assistant||!requestId||!outputTraceId){
      throw new Error("DataNest AI returned an incomplete governed response.");
    }

    if(nextSession){
      const {error:sessionError}=await supabase.rpc("upsert_think_tank_ai_session_v1",{
        target_thread:selectedThreadId,target_session:nextSession
      });
      if(sessionError)throw sessionError;
      setAiSessionId(nextSession);
    }

    const {data:aiMessageId,error:recordError}=await supabase.rpc("record_think_tank_ai_message_v1",{
      target_thread:selectedThreadId,
      target_body:assistant,
      target_trace_id:outputTraceId,
      target_request:requestId
    });
    if(recordError)throw recordError;

    if(kind==="extract_actions"){
      const extracted=assistant.split(/\r?\n/)
        .map(line=>line.match(/^\s*ACTION:\s*(.+?)\s*$/i)?.[1]?.trim()||"")
        .filter(Boolean)
        .slice(0,20);
      for(const item of extracted){
        const {error:actionError}=await supabase.rpc("create_think_tank_action_v1",{
          target_thread:selectedThreadId,
          target_description:item,
          target_source_message:aiMessageId||commandMessageId
        });
        if(actionError)throw actionError;
      }
      setNotice(
        extracted.length
          ?"DataNest extracted "+extracted.length+" proposed action"+(extracted.length===1?"":"s")+"."
          :"DataNest answered, but no ACTION-formatted proposals were returned."
      );
    }else{
      setNotice("DataNest AI response recorded as traceable Think Tank evidence.");
    }
  }

  async function sendMessage(event:FormEvent){
    event.preventDefault();
    if(!selectedThreadId||!draft.trim())return;
    const supabase=getSupabase();
    if(!supabase)return;
    await runSingleFlight("send-message:"+selectedThreadId,async()=>{
      setBusy(true);setError("");
      setNotice(command==="discussion"?"Posting Think Tank message…":"Running governed Think Tank action…");
      try{
        if(command==="discussion"){
          const {error}=await supabase.rpc("post_think_tank_message_v1",{
            target_thread:selectedThreadId,target_body:draft.trim(),
            target_message_type:"discussion",target_command_name:null
          });
          if(error)throw error;
          setNotice("Think Tank message posted.");
        }else{
          const {data:messageId,error:messageError}=await supabase.rpc("post_think_tank_message_v1",{
            target_thread:selectedThreadId,
            target_body:"@DataNest "+command.replaceAll("_","-")+" "+draft.trim(),
            target_message_type:"ai_command",
            target_command_name:command
          });
          if(messageError)throw messageError;

          if(command==="record_decision"){
            const {error}=await supabase.rpc("create_think_tank_decision_v1",{
              target_thread:selectedThreadId,
              target_title:draft.trim().slice(0,100),
              target_decision:draft.trim(),
              target_supersedes:null
            });
            if(error)throw error;
            setNotice("Decision proposal recorded; independent owner/admin confirmation is still required.");
          }else if(command==="propose_learning"){
            const {error}=await supabase.rpc("propose_think_tank_learning_v1",{
              target_thread:selectedThreadId,
              target_knowledge:draft.trim(),
              target_category:"think_tank",
              target_source_messages:messageId?[String(messageId)]:[],
              target_confidence:0.75
            });
            if(error)throw error;
            setNotice("Learning candidate proposed; it is not certified until independent review.");
          }else{
            await runAiCommand(command,draft.trim(),String(messageId||""));
          }
        }
        setDraft("");
        await loadThread(selectedThreadId);
        await loadThreads(selectedChannelId);
      }catch(sendError){
        setError(sendError instanceof Error?sendError.message:"Unable to process Think Tank message. Your draft is still available to retry.");
      }finally{
        setBusy(false);
      }
    });
  }

  async function reviewDecision(id:string,status:"confirmed"|"rejected"){
    const supabase=getSupabase();if(!supabase)return;
    setBusy(true);setError("");
    const {error}=await supabase.rpc("review_think_tank_decision_v1",{
      target_decision:id,target_status:status
    });
    if(error)setError(error.message);
    else{setNotice("Decision proposal "+status+".");await loadThread(selectedThreadId);}
    setBusy(false);
  }

  async function reviewAction(id:string,status:"open"|"cancelled"){
    const supabase=getSupabase();if(!supabase)return;
    setBusy(true);setError("");
    const {error}=await supabase.rpc("review_think_tank_action_v1",{
      target_action:id,target_status:status,
      target_owner:status==="open"?currentUserId:null,
      target_due_at:null
    });
    if(error)setError(error.message);
    else{setNotice(status==="open"?"Action opened and assigned to you.":"Action cancelled.");await loadThread(selectedThreadId);}
    setBusy(false);
  }

  async function updateAction(id:string,status:"in_progress"|"completed"){
    const supabase=getSupabase();if(!supabase)return;
    setBusy(true);setError("");
    const {error}=await supabase.rpc("update_think_tank_action_status_v1",{
      target_action:id,target_status:status
    });
    if(error)setError(error.message);
    else{setNotice("Action moved to "+label(status)+".");await loadThread(selectedThreadId);}
    setBusy(false);
  }

  async function reviewLearning(id:string,status:"approved"|"rejected"){
    const supabase=getSupabase();if(!supabase)return;
    setBusy(true);setError("");
    const {error}=await supabase.rpc("review_think_tank_learning_v1",{
      target_candidate:id,target_status:status,target_notes:"Reviewed in Think Tank workspace."
    });
    if(error)setError(error.message);
    else{
      setNotice(status==="approved"
        ?"Learning approved into certified memory; contribution recognition remains in its independent review pipeline."
        :"Learning candidate rejected.");
      await loadThread(selectedThreadId);
    }
    setBusy(false);
  }

  async function proposeLearningFromMessage(message:Message){
    const supabase=getSupabase();if(!supabase)return;
    setBusy(true);setError("");
    const {error}=await supabase.rpc("propose_think_tank_learning_v1",{
      target_thread:selectedThreadId,
      target_knowledge:message.body,
      target_category:message.actor_kind==="datanest_ai"?"ai_collaboration":"think_tank",
      target_source_messages:[message.id],
      target_confidence:message.actor_kind==="datanest_ai"?0.70:0.75
    });
    if(error)setError(error.message);
    else{setNotice("Message proposed as a learning candidate; independent review is required.");await loadThread(selectedThreadId);}
    setBusy(false);
  }

  if(loading)return <section className="panel"><p className="muted">Loading Think Tanks…</p></section>;

  return <div>
    <section className="panel" aria-label="Think Tank workspace overview">
      <PageHeader
        eyebrow="DISCOVER · THINK TANKS"
        title="Think Tank collaboration workspace"
        description="Turn scoped discussion into traceable decisions, actions and independently reviewed learning."
        meta={<StatusIndicator label={canOperate?"Collaboration enabled":"Read-only collaboration"} tone={canOperate?"success":"neutral"} detail={channels.length+" channel"+(channels.length===1?"":"s")+" · "+threads.length+" thread"+(threads.length===1?"":"s")}/>}
      />
    </section>
    <EvidencePanel
      title="Think Tank evidence"
      items={channels.length||threads.length||actions.length||learnings.length?[
        {label:"Channels",value:String(channels.length)},
        {label:"Threads",value:String(threads.length)},
        {label:"Open actions",value:String(actions.filter(item=>["open","in_progress"].includes(item.status)).length)},
        {label:"Learning review",value:String(learnings.filter(item=>item.status==="proposed").length)}
      ]:[]}
      emptyState={<span>No governed collaboration evidence yet. An authorized operator can create a Think Tank, then participants can open a thread and attach traceable discussion.</span>}
    />
    {activeAction&&<p className="muted" role="status">Think Tank action in progress · duplicate submissions are blocked until the request finishes.</p>}
    {hasSessionDraft&&<p className="muted" role="status">Browser-session draft active · unfinished Think Tank inputs are restored after workspace navigation or reload.</p>}
    <section className="heroPanel">
      <div>
        <p className="eyebrow">THINK TANKS + DATANEST AI</p>
        <h2>Discuss → Ask → Decide → Act → Review → Remember</h2>
        <p>Project discussion stays permission-scoped. DataNest AI responses remain traceable to governed Job requests, and reusable learning reaches project memory only after independent human review.</p>
      </div>
      <div className="stackDiagram">
        <div>Discussion <b>Project scoped</b></div><span>↓</span>
        <div>@DataNest <b>Job traced</b></div><span>↓</span>
        <div>Governance <b>Human reviewed</b></div><span>↓</span>
        <div>Memory <b>Certified retrieval</b></div>
      </div>
    </section>

    <section className="metricGrid">
      <article className="metricCard"><span>Channels</span><strong>{channels.length}</strong><small>Project and Job scopes</small></article>
      <article className="metricCard"><span>Threads</span><strong>{threads.length}</strong><small>Selected channel</small></article>
      <article className="metricCard"><span>Open actions</span><strong>{actions.filter(item=>["open","in_progress"].includes(item.status)).length}</strong><small>Selected thread</small></article>
      <article className="metricCard"><span>Learning review</span><strong>{learnings.filter(item=>item.status==="proposed").length}</strong><small>Pending independent review</small></article>
    </section>

    {canOperate&&<section className="panel">
      <div className="panelHead"><div><p className="eyebrow">CHANNELS</p><h3>Create a Think Tank</h3></div><span className="countPill">{role.toUpperCase()}</span></div>
      <form onSubmit={createChannel} className="settingsGrid">
        <label>Channel name<input value={channelName} onChange={e=>setChannelName(e.target.value)} placeholder="e.g. Product Strategy"/></label>
        <label>Scope<select value={channelScope} onChange={e=>setChannelScope(e.target.value as "project"|"job")}><option value="project">Project-wide</option><option value="job">Job-linked</option></select></label>
        {channelScope==="job"&&<label>Job Manifest<select value={channelJobId} onChange={e=>setChannelJobId(e.target.value)}><option value="">Select a Job</option>{jobs.map(job=><option key={job.id} value={job.id}>{jobCode(job)+" · "+job.title}</option>)}</select></label>}
        <label>Description<input value={channelDescription} onChange={e=>setChannelDescription(e.target.value)} placeholder="Purpose and scope"/></label>
        <button className="primaryButton" disabled={busy||!channelName.trim()||(channelScope==="job"&&!channelJobId)}>Create Think Tank</button>
      </form>
    </section>}

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">CHANNELS</p><h3>Think Tanks</h3></div><span className="countPill">{channels.length}</span></div>
      <div className="filterBar">
        {channels.map(channel=><button key={channel.id} className={selectedChannelId===channel.id?"active":""} onClick={()=>setSelectedChannelId(channel.id)}>
          {channel.name}{channel.scope==="job"&&channel.job_id?" · "+(jobLookup.get(channel.job_id)?jobCode(jobLookup.get(channel.job_id)!):"Job"):""}
        </button>)}
      </div>
      {!channels.length&&<div className="emptyState"><div>◇</div><h3>No Think Tanks yet</h3><p>{canOperate?"Create the first governed channel, then open a thread for traceable discussion.":"An authorized operator can create the first governed channel; return after it is available to participate."}</p></div>}
      {selectedChannel&&<p className="muted">{selectedChannel.description||"No channel description."} · {selectedChannel.scope==="job"?"Job-linked AI collaboration enabled.":"Project-wide discussion; link a channel to a Job to invoke DataNest AI."}</p>}
    </section>

    {selectedChannel&&<section className="panel">
      <div className="panelHead"><div><p className="eyebrow">THREADS</p><h3>{selectedChannel.name}</h3></div><span className="countPill">{threads.length}</span></div>
      <form onSubmit={createThread} className="rowActions">
        <input value={threadTitle} onChange={e=>setThreadTitle(e.target.value)} placeholder="New thread title"/>
        <button className="secondaryButton compact" disabled={busy||!threadTitle.trim()}>Create thread</button>
      </form>
      <div className="filterBar">
        {threads.map(thread=><button key={thread.id} className={selectedThreadId===thread.id?"active":""} onClick={()=>setSelectedThreadId(thread.id)}>{thread.title}</button>)}
      </div>
    </section>}

    {selectedThread&&<>
      <section className="panel">
        <div className="panelHead">
          <div><p className="eyebrow">DISCUSSION</p><h3>{selectedThread.title}</h3></div>
          <span className="countPill">{messages.length+" messages"}</span>
        </div>
        <div className="timeline">
          {messages.map(message=><div className="timelineItem" key={message.id}>
            <div className="timelineDot"/>
            <div>
              <div className="rowBetween">
                <b>{message.actor_kind==="datanest_ai"?"DataNest AI":message.message_type==="ai_command"?"Stakeholder · @DataNest":"Stakeholder"}</b>
                <small>{fmtDate(message.created_at)}</small>
              </div>
              <p>{message.body}</p>
              <div className="manifestMeta">
                {message.command_name&&<span>{message.command_name.replaceAll("_","-")}</span>}
                {message.source_trace_id&&<span>{message.source_trace_id}</span>}
                {message.actor_kind==="datanest_ai"&&<span>UNCERTIFIED source until learning review</span>}
              </div>
              <div className="rowActions">
                <button className="textButton" disabled={busy} onClick={()=>void proposeLearningFromMessage(message)}>Propose as learning</button>
              </div>
            </div>
          </div>)}
          {!messages.length&&<div className="emptyState"><div>◇</div><h3>No discussion yet</h3><p>Post a project message or invoke DataNest from a Job-linked channel.</p></div>}
        </div>

        <form className="datanestAiComposer" onSubmit={sendMessage}>
          <label>Mode<select value={command} onChange={e=>setCommand(e.target.value)}>{commandOptions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Message<textarea rows={4} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={command==="discussion"?"Add to the Think Tank discussion…":"Enter the command input…"}/></label>
          <div className="rowBetween">
            <small className="muted">{selectedChannel?.scope==="job"?"DataNest AI commands inherit the linked Job's governed context.":"Project channel: discussion, decision and learning workflows are available; AI answer/summarize/extract require a Job-linked channel."}</small>
            <button className="primaryButton" disabled={busy||!draft.trim()}>{busy?"Working…":command==="discussion"?"Post message":"Run "+command.replaceAll("_","-")}</button>
          </div>
        </form>
      </section>

      <section className="settingsGrid">
        <div className="panel">
          <div className="panelHead"><div><p className="eyebrow">DECISIONS</p><h3>Governed decisions</h3></div><span className="countPill">{decisions.length}</span></div>
          {decisions.map(item=><article className="manifestCard" key={item.id}>
            <div className="rowBetween"><b>{item.title}</b><span className="badge neutral">{label(item.status)}</span></div>
            <p>{item.decision_text}</p><small>{item.trace_key}</small>
            {item.status==="proposed"&&canReview&&item.proposed_by!==currentUserId&&<div className="rowActions">
              <button className="secondaryButton compact" disabled={busy} onClick={()=>void reviewDecision(item.id,"confirmed")}>Confirm</button>
              <button className="secondaryButton compact" disabled={busy} onClick={()=>void reviewDecision(item.id,"rejected")}>Reject</button>
            </div>}
            {item.status==="proposed"&&item.proposed_by===currentUserId&&<small className="muted">Independent owner/admin confirmation required.</small>}
          </article>)}
          {!decisions.length&&<p className="muted">Use @DataNest record-decision to create a proposal.</p>}
        </div>

        <div className="panel">
          <div className="panelHead"><div><p className="eyebrow">ACTIONS</p><h3>Action items</h3></div><span className="countPill">{actions.length}</span></div>
          {actions.map(item=><article className="manifestCard" key={item.id}>
            <div className="rowBetween"><b>{item.description}</b><span className="badge neutral">{label(item.status)}</span></div>
            <small>{item.trace_key}{item.due_at?" · due "+fmtDate(item.due_at):""}</small>
            {item.status==="proposed"&&canOperate&&<div className="rowActions">
              <button className="secondaryButton compact" disabled={busy} onClick={()=>void reviewAction(item.id,"open")}>Open & assign to me</button>
              <button className="secondaryButton compact" disabled={busy} onClick={()=>void reviewAction(item.id,"cancelled")}>Cancel</button>
            </div>}
            {item.status==="open"&&(item.owner_user_id===currentUserId||canOperate)&&<button className="textButton" disabled={busy} onClick={()=>void updateAction(item.id,"in_progress")}>Start</button>}
            {item.status==="in_progress"&&(item.owner_user_id===currentUserId||canOperate)&&<button className="textButton" disabled={busy} onClick={()=>void updateAction(item.id,"completed")}>Complete</button>}
          </article>)}
          {!actions.length&&<p className="muted">Use @DataNest extract-actions or propose an action from discussion.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panelHead"><div><p className="eyebrow">REVIEWED LEARNING</p><h3>Institutional memory candidates</h3></div><span className="countPill">{learnings.length}</span></div>
        <p className="muted">Approval adds reviewed knowledge to certified retrieval memory. It does not retrain the model, auto-accept contribution value, mint Sparks, or grant authority.</p>
        {learnings.length?<div className="dataTable">
          <div className="dataRow headerRow"><span>Learning</span><span>Category</span><span>Status</span><span>Confidence</span><span>Review</span></div>
          {learnings.map(item=><div className="dataRow" key={item.id}>
            <div><b>{item.normalized_knowledge.slice(0,110)}{item.normalized_knowledge.length>110?"…":""}</b><small>{item.trace_key}</small></div>
            <span>{item.category}</span>
            <span>{label(item.status)}</span>
            <span>{Math.round(Number(item.confidence||0)*100)+"%"}</span>
            <span>
              {item.status==="proposed"&&canReview&&item.proposed_by!==currentUserId?<span className="rowActions">
                <button className="textButton" disabled={busy} onClick={()=>void reviewLearning(item.id,"approved")}>Approve</button>
                <button className="textButton" disabled={busy} onClick={()=>void reviewLearning(item.id,"rejected")}>Reject</button>
              </span>:item.status==="proposed"&&item.proposed_by===currentUserId?"Independent review required":item.promoted_memory_id?"Certified memory":"Reviewed"}
            </span>
          </div>)}
        </div>:<div className="emptyState"><div>◇</div><h3>No learning candidates</h3><p>Use @DataNest propose-learning or propose a discussion message as learning.</p></div>}
      </section>
    </>}

    <footer className="datanestAiFootnote">
      <small>Signed in as {currentUserEmail} · role {role.toUpperCase()} · project-scoped permissions apply.</small>
    </footer>
  </div>;
}
