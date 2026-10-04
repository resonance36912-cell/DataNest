"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import AiReconciliationPanel from "@/components/AiReconciliationPanel";

type Connection={
  id:string;
  provider:string;
  label:string;
  api_base_url:string;
  endpoint_host?:string|null;
  model:string;
  status:string;
  is_default:boolean;
  last_used_at:string|null;
  last_error:string|null;
  last_rotated_at?:string|null;
  metadata?:Record<string,unknown>|null;
  updated_at:string;
};

type BudgetStatus={
  policy_id:string|null;
  daily_request_limit:number;
  monthly_token_limit:number;
  monthly_cost_limit_minor:number|null;
  max_output_tokens:number;
  concurrency_limit:number;
  allowed_providers:string[];
  allowed_models:string[];
  currency:string;
  daily_requests_used:number;
  monthly_tokens_used:number;
  monthly_cost_used_minor:number;
};

type AllowDomain={
  project_id:string;
  hostname:string;
  active:boolean;
  created_at:string;
  updated_at:string;
};

type SharedProviderStatus={
  id:string;
  provider:string;
  label:string;
  api_base_url:string;
  endpoint_host:string;
  model:string;
  status:string;
  metadata?:Record<string,unknown>|null;
  last_rotated_at:string|null;
  updated_at:string;
};

function formatDate(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{
    month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

function money(minor:number|null|undefined,currency:string){
  if(minor==null)return "—";
  return (minor/100).toFixed(2)+" "+currency;
}

function stateTone(value:string){
  const v=value.toLowerCase();
  if(["active","succeeded","available"].includes(v))return "good";
  if(["failed","disabled","removed"].includes(v))return "bad";
  if(["error","paused","unknown"].includes(v))return "warn";
  return "neutral";
}

export default function AiOperationsDashboard({
  projectId,currentUserId,canManageAi
}:{projectId:string;currentUserId:string;canManageAi:boolean}){
  const [connections,setConnections]=useState<Connection[]>([]);
  const [budget,setBudget]=useState<BudgetStatus|null>(null);
  const [allowlist,setAllowlist]=useState<AllowDomain[]>([]);
  const [sharedProvider,setSharedProvider]=useState<SharedProviderStatus|null>(null);

  const [cloudflareAccountId,setCloudflareAccountId]=useState("");
  const [sharedLabel,setSharedLabel]=useState("DataNest Open AI · Nemotron 3 Super");
  const [sharedModel,setSharedModel]=useState("@cf/nvidia/nemotron-3-120b-a12b");
  const [sharedApiKey,setSharedApiKey]=useState("");
  const [sharedProcessingRegion,setSharedProcessingRegion]=useState("");

  const [provider,setProvider]=useState("openai");
  const [label,setLabel]=useState("My OpenAI");
  const [endpoint,setEndpoint]=useState("https://api.openai.com/v1/chat/completions");
  const [model,setModel]=useState("");
  const [apiKey,setApiKey]=useState("");
  const [processingRegion,setProcessingRegion]=useState("");

  const [domainHost,setDomainHost]=useState("");
  const [dailyLimit,setDailyLimit]=useState("100");
  const [monthlyTokens,setMonthlyTokens]=useState("2000000");
  const [monthlyCost,setMonthlyCost]=useState("");
  const [maxOutput,setMaxOutput]=useState("4000");
  const [concurrency,setConcurrency]=useState("2");
  const [allowedModels,setAllowedModels]=useState("*");
  const [budgetCurrency,setBudgetCurrency]=useState("ZAR");

  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    setError("");

    const [connectionsResult,budgetResult,allowResult]=await Promise.all([
      supabase.from("ai_provider_connections")
        .select("id,provider,label,api_base_url,endpoint_host,model,status,is_default,last_used_at,last_error,last_rotated_at,metadata,updated_at")
        .eq("project_id",projectId)
        .eq("user_id",currentUserId)
        .order("updated_at",{ascending:false}),
      supabase.rpc("get_ai_budget_status",{target_project:projectId}),
      supabase.from("ai_provider_domain_allowlist")
        .select("project_id,hostname,active,created_at,updated_at")
        .eq("project_id",projectId)
        .order("hostname")
    ]);

    const firstError=connectionsResult.error||budgetResult.error||allowResult.error;
    if(firstError){setError(firstError.message);return;}

    setConnections((connectionsResult.data||[]) as Connection[]);
    const nextBudget=(budgetResult.data||null) as BudgetStatus|null;
    setBudget(nextBudget);
    if(nextBudget){
      setDailyLimit(String(nextBudget.daily_request_limit));
      setMonthlyTokens(String(nextBudget.monthly_token_limit));
      setMonthlyCost(
        nextBudget.monthly_cost_limit_minor==null
          ?""
          :String(nextBudget.monthly_cost_limit_minor/100)
      );
      setMaxOutput(String(nextBudget.max_output_tokens));
      setConcurrency(String(nextBudget.concurrency_limit));
      setAllowedModels((nextBudget.allowed_models||["*"]).join(", "));
      setBudgetCurrency(nextBudget.currency||"ZAR");
    }
    setAllowlist((allowResult.data||[]) as AllowDomain[]);

    if(canManageAi){
      const {data:sharedData,error:sharedError}=await supabase.functions.invoke("manage-ai-provider-v2",{
        body:{action:"shared_status",projectId}
      });
      if(sharedError){setError(sharedError.message);return;}
      const sharedPayload=(sharedData||{}) as {error?:unknown;config?:SharedProviderStatus|null};
      if(sharedPayload.error){setError(String(sharedPayload.error));return;}
      setSharedProvider(sharedPayload.config||null);
      setSharedProcessingRegion(String(sharedPayload.config?.metadata?.processing_region||""));
    }else{
      setSharedProvider(null);
    }
  },[projectId,currentUserId,canManageAi]);

  useEffect(()=>{void load()},[load]);

  useEffect(()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    const channel=supabase.channel("ai-operations-"+projectId)
      .on("postgres_changes",{
        event:"*",schema:"public",table:"ai_usage_requests",filter:"project_id=eq."+projectId
      },()=>void load())
      .subscribe();
    return()=>{void supabase.removeChannel(channel)};
  },[projectId,load]);

  async function connectProvider(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase)return;
    setBusy(true);setNotice("");setError("");
    const {data,error:invokeError}=await supabase.functions.invoke("manage-ai-provider-v2",{
      body:{action:"connect",projectId,provider,label,apiBaseUrl:endpoint,model,apiKey,processingRegion}
    });
    setBusy(false);
    if(invokeError){setError(invokeError.message);return;}
    const payload=(data||{}) as Record<string,unknown>;
    if(payload.error){setError(String(payload.error));return;}
    setApiKey("");
    setNotice("AI provider connected or rotated. Credentials remain server-side.");
    await load();
  }

  async function connectSharedProvider(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    const accountId=cloudflareAccountId.trim();
    if(!supabase||!canManageAi)return;
    if(!/^[A-Za-z0-9_-]{8,64}$/.test(accountId)){
      setError("Enter a valid Cloudflare account ID.");
      return;
    }

    setBusy(true);setNotice("");setError("");
    const apiBaseUrl=
      "https://api.cloudflare.com/client/v4/accounts/"+
      accountId+
      "/ai/v1/chat/completions";

    const {data,error:invokeError}=await supabase.functions.invoke("manage-ai-provider-v2",{
      body:{
        action:"connect_shared",
        projectId,
        provider:"openai_compatible",
        label:sharedLabel,
        apiBaseUrl,
        model:sharedModel,
        apiKey:sharedApiKey,
        processingRegion:sharedProcessingRegion
      }
    });
    setBusy(false);
    if(invokeError){setError(invokeError.message);return;}
    const payload=(data||{}) as Record<string,unknown>;
    if(payload.error){setError(String(payload.error));return;}

    setSharedApiKey("");
    setNotice("Project-shared DataNest AI provider activated. The credential remains encrypted server-side.");
    await load();
  }

  async function disableSharedProvider(){
    const supabase=getSupabase();
    if(!supabase||!canManageAi)return;
    if(!window.confirm("Disable the project-shared AI provider for all users? Personal provider connections will remain unchanged."))return;

    setBusy(true);setNotice("");setError("");
    const {data,error:invokeError}=await supabase.functions.invoke("manage-ai-provider-v2",{
      body:{action:"disable_shared",projectId}
    });
    setBusy(false);
    if(invokeError){setError(invokeError.message);return;}
    const payload=(data||{}) as Record<string,unknown>;
    if(payload.error){setError(String(payload.error));return;}

    setNotice("Project-shared AI provider disabled. DataNest will use personal providers or embedded fallback.");
    await load();
  }

  async function connectionAction(action:"disable"|"delete",connectionId:string){
    const supabase=getSupabase();
    if(!supabase)return;
    if(action==="delete"&&!window.confirm("Delete this AI connection and revoke its encrypted secret?"))return;
    const {data,error:invokeError}=await supabase.functions.invoke("manage-ai-provider-v2",{
      body:{action,projectId,connectionId}
    });
    if(invokeError){setError(invokeError.message);return;}
    const payload=(data||{}) as Record<string,unknown>;
    if(payload.error){setError(String(payload.error));return;}
    setNotice(action==="delete"?"AI connection deleted and secret revoked.":"AI connection disabled.");
    await load();
  }

  async function addDomain(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase||!domainHost.trim()||!canManageAi)return;
    const {error:domainError}=await supabase.rpc("set_ai_provider_domain",{
      target_project:projectId,
      target_hostname:domainHost.trim().toLowerCase(),
      target_active:true
    });
    if(domainError){setError(domainError.message);return;}
    setDomainHost("");
    setNotice("Compatible AI provider hostname added to the server allowlist.");
    await load();
  }

  async function toggleDomain(domain:AllowDomain){
    const supabase=getSupabase();
    if(!supabase||!canManageAi)return;
    if(domain.hostname==="api.openai.com"&&domain.active){
      setError("The canonical OpenAI API host remains enabled for OpenAI connections.");
      return;
    }
    const {error:domainError}=await supabase.rpc("set_ai_provider_domain",{
      target_project:projectId,
      target_hostname:domain.hostname,
      target_active:!domain.active
    });
    if(domainError){setError(domainError.message);return;}
    await load();
  }

  async function saveProjectBudget(){
    const supabase=getSupabase();
    if(!supabase||!canManageAi)return;
    const models=allowedModels.split(",").map(x=>x.trim()).filter(Boolean);
    const {error:budgetError}=await supabase.rpc("set_ai_budget_policy",{
      target_project:projectId,
      target_user:null,
      target_daily_request_limit:Number(dailyLimit),
      target_monthly_token_limit:Number(monthlyTokens),
      target_monthly_cost_limit_minor:monthlyCost.trim()
        ?Math.round(Number(monthlyCost)*100)
        :null,
      target_max_output_tokens:Number(maxOutput),
      target_concurrency_limit:Number(concurrency),
      target_allowed_providers:["openai","openai_compatible"],
      target_allowed_models:models.length?models:["*"],
      target_currency:budgetCurrency
    });
    if(budgetError){setError(budgetError.message);return;}
    setNotice("Project AI budget policy updated.");
    await load();
  }

  return <div className="stakeholderWorkspace">
    <section className="sectionIntro">
      <p className="eyebrow">AI ADMINISTRATION</p>
      <h2>Provider, usage & security controls</h2>
      <p>
        Manage approved AI routes, protected credentials, infrastructure usage limits, provider hosts, and unknown provider outcomes. Personal connections remain user-scoped; project-wide policy and reconciliation require Owner or Admin access.
      </p>
    </section>

    {notice&&<div className="notice goodNotice">{notice}</div>}
    {error&&<div className="notice errorNotice" role="alert">{error}</div>}

    <section className="metricGrid">
      <article className="metricCard">
        <span>Provider connections</span>
        <strong>{connections.length}</strong>
        <small>Current user · protected secrets</small>
      </article>
      <article className="metricCard">
        <span>AI requests today</span>
        <strong>{budget?.daily_requests_used||0}</strong>
        <small>{budget?.daily_request_limit??"—"} daily limit</small>
      </article>
      <article className="metricCard">
        <span>Monthly AI tokens</span>
        <strong>{budget?.monthly_tokens_used||0}</strong>
        <small>{budget?.monthly_token_limit??"—"} limit</small>
      </article>
      <article className="metricCard">
        <span>Provider usage cost</span>
        <strong>{money(budget?.monthly_cost_used_minor,budget?.currency||"ZAR")}</strong>
        <small>{budget?.monthly_cost_limit_minor==null?"No cost ceiling configured":"Limit "+money(budget.monthly_cost_limit_minor,budget.currency)}</small>
      </article>
    </section>

    {canManageAi&&<section className="panel">
      <div className="panelHead">
        <div>
          <p className="eyebrow">DATANEST SHARED AI</p>
          <h3>Project-wide open-model provider</h3>
        </div>
        {sharedProvider&&<span className={"badge "+stateTone(sharedProvider.status)}>{sharedProvider.status}</span>}
      </div>
      <p className="muted">
        Configure one encrypted Cloudflare Workers AI credential for DataNest. Registered users without a personal provider receive a governed project-managed connection automatically. Personal providers remain higher priority.
      </p>

      {sharedProvider&&<article className="connectionCard">
        <div className="rowBetween">
          <div><b>{sharedProvider.label}</b><small>{sharedProvider.provider+" · "+sharedProvider.model}</small></div>
          <span className={"badge "+stateTone(sharedProvider.status)}>{sharedProvider.status}</span>
        </div>
        <p className="muted">{sharedProvider.api_base_url}</p>
        <div className="manifestMeta">
          <span>{"Host "+sharedProvider.endpoint_host}</span>
          <span>{"Region "+String(sharedProvider.metadata?.processing_region||"not declared")}</span>
          <span>{"Rotated "+formatDate(sharedProvider.last_rotated_at)}</span>
        </div>
      </article>}

      <form className="plannerForm" onSubmit={connectSharedProvider}>
        <div className="fieldRow">
          <label>Cloudflare account ID<input value={cloudflareAccountId} onChange={e=>setCloudflareAccountId(e.target.value)} placeholder="Account ID" required/></label>
          <label>Connection label<input value={sharedLabel} onChange={e=>setSharedLabel(e.target.value)} required/></label>
        </div>
        <label>Open model<input value={sharedModel} onChange={e=>setSharedModel(e.target.value)} required/></label>
        <label>Declared processing region<input value={sharedProcessingRegion} onChange={e=>setSharedProcessingRegion(e.target.value)} placeholder="e.g. eu-central-1" maxLength={64}/><small>Use only a provider region supported by reviewed locality evidence. Leave blank when unknown.</small></label>
        <label>Workers AI API token<input type="password" autoComplete="off" value={sharedApiKey} onChange={e=>setSharedApiKey(e.target.value)} placeholder="Encrypted in Supabase Vault" required/></label>
        <div className="rowActions">
          <button className="primaryButton" disabled={busy}>{busy?"Saving…":sharedProvider?"Rotate / update shared provider":"Activate shared provider"}</button>
          {sharedProvider?.status==="active"&&<button className="textButton dangerText" type="button" disabled={busy} onClick={()=>void disableSharedProvider()}>Disable shared provider</button>}
        </div>
      </form>
      <p className="muted">
        Bootstrap model: NVIDIA Nemotron 3 Super 120B-A12B. The model and endpoint remain replaceable; DataNest identity and certified memory do not depend on Cloudflare.
      </p>
    </section>}

    <section className="twoCol stakeholderCols">
      <div className="panel">
        <div className="panelHead">
          <div><p className="eyebrow">MODEL ROUTING</p><h3>Approved provider connection</h3></div>
        </div>
        <p className="muted">
          OpenAI uses its canonical endpoint. Other compatible providers require an approved hostname. Processing region is an explicit reviewed declaration, never inferred from provider or hostname. Credentials stay encrypted server-side and are never returned to the browser.
        </p>
        <form className="plannerForm" onSubmit={connectProvider}>
          <div className="fieldRow">
            <label>Provider<select value={provider} onChange={e=>{
              setProvider(e.target.value);
              if(e.target.value==="openai")setEndpoint("https://api.openai.com/v1/chat/completions");
            }}>
              <option value="openai">OpenAI API</option>
              <option value="openai_compatible">OpenAI-compatible</option>
            </select></label>
            <label>Connection label<input value={label} onChange={e=>setLabel(e.target.value)} required/></label>
          </div>
          <label>API endpoint<input type="url" value={endpoint} onChange={e=>setEndpoint(e.target.value)} required/></label>
          <label>Declared processing region<input value={processingRegion} onChange={e=>setProcessingRegion(e.target.value)} placeholder="e.g. eu-central-1" maxLength={64}/><small>Declare only a provider processing region backed by reviewed evidence. DataNest does not infer region from hostname.</small></label>
          <div className="fieldRow">
            <label>Model<input value={model} onChange={e=>setModel(e.target.value)} placeholder="Allowed provider model ID" required/></label>
            <label>API credential<input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Encrypted server-side" required/></label>
          </div>
          <button className="primaryButton" disabled={busy}>{busy?"Connecting…":"Connect / rotate provider"}</button>
        </form>

        <div className="connectionList">
          {connections.map(connection=><article className="connectionCard" key={connection.id}>
            <div className="rowBetween">
              <div><b>{connection.label}</b><small>{connection.provider+" · "+connection.model}</small></div>
              <span className={"badge "+stateTone(connection.status)}>{connection.status}</span>
            </div>
            <p className="muted">{connection.api_base_url}</p>
            <div className="manifestMeta">
              <span>{"Region "+String(connection.metadata?.processing_region||"not declared")}</span>
              <span>{"Last used "+formatDate(connection.last_used_at)}</span>
              <span>{"Rotated "+formatDate(connection.last_rotated_at||null)}</span>
              {connection.is_default&&<span>Default</span>}
            </div>
            {connection.last_error&&<p className="errorText">Last provider failure is stored as a sanitized status; rotate or reconnect to recover.</p>}
            <div className="rowActions">
              {connection.status!=="disabled"&&<button className="textButton" type="button" onClick={()=>void connectionAction("disable",connection.id)}>Disable</button>}
              <button className="textButton dangerText" type="button" onClick={()=>void connectionAction("delete",connection.id)}>Delete + revoke secret</button>
            </div>
          </article>)}
          {!connections.length&&<div className="emptyState">
            <div>◎</div>
            <h3>No provider connected</h3>
            <p>DataNest AI can continue in embedded server-side mode without an external provider.</p>
          </div>}
        </div>
      </div>

      <div className="panel">
        <div className="panelHead">
          <div><p className="eyebrow">OUTBOUND POLICY</p><h3>Compatible AI provider hosts</h3></div>
        </div>
        {canManageAi?<form className="surfaceForm compactPolicyForm" onSubmit={addDomain}>
          <label>Hostname<input value={domainHost} onChange={e=>setDomainHost(e.target.value)} placeholder="api.example.com" required/></label>
          <button className="secondaryButton">Allow hostname</button>
        </form>:<p className="muted">Owner or Admin access is required to change provider host policy.</p>}
        <div className="manifestList">
          {allowlist.map(domain=><article className="manifestCard" key={domain.hostname}>
            <div className="rowBetween">
              <b>{domain.hostname}</b>
              {canManageAi&&<button className="textButton" type="button" onClick={()=>void toggleDomain(domain)}>{domain.active?"Disable":"Enable"}</button>}
            </div>
            <small>{domain.active?"Provider calls allowed":"Blocked"}</small>
          </article>)}
        </div>
      </div>
    </section>

    {canManageAi&&<section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">AI POLICY</p><h3>Project spend & output limits</h3></div>
      </div>
      <div className="plannerForm">
        <div className="fieldRow">
          <label>Daily provider requests<input type="number" min="0" value={dailyLimit} onChange={e=>setDailyLimit(e.target.value)}/></label>
          <label>Monthly tokens<input type="number" min="0" value={monthlyTokens} onChange={e=>setMonthlyTokens(e.target.value)}/></label>
        </div>
        <div className="fieldRow">
          <label>Monthly cost ceiling<input type="number" min="0" step="0.01" value={monthlyCost} onChange={e=>setMonthlyCost(e.target.value)} placeholder="Optional"/></label>
          <label>Currency<input value={budgetCurrency} onChange={e=>setBudgetCurrency(e.target.value)} maxLength={3}/></label>
        </div>
        <div className="fieldRow">
          <label>Max output tokens/request<input type="number" min="1" value={maxOutput} onChange={e=>setMaxOutput(e.target.value)}/></label>
          <label>Concurrent provider calls<input type="number" min="1" value={concurrency} onChange={e=>setConcurrency(e.target.value)}/></label>
        </div>
        <label>Allowed models<input value={allowedModels} onChange={e=>setAllowedModels(e.target.value)} placeholder="*, or comma-separated exact model IDs"/></label>
        <button className="primaryButton" type="button" onClick={()=>void saveProjectBudget()}>Save project AI policy</button>
      </div>
    </section>}

    {canManageAi&&<AiReconciliationPanel projectId={projectId}/>}
  </div>;
}
