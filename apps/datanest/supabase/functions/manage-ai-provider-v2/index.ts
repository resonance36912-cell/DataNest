import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

declare const Deno:{
  env:{get:(name:string)=>string|undefined};
  serve:(handler:(request:Request)=>Response|Promise<Response>)=>void;
};

const allowedOrigins=new Set([
  "https://datanest-supository.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

function cors(origin:string|null){
  const allow=origin&&allowedOrigins.has(origin)
    ?origin
    :"https://datanest-supository.github.io";
  return {
    "Access-Control-Allow-Origin":allow,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin"
  };
}

function json(body:unknown,status=200,origin:string|null=null){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      ...cors(origin),
      "Content-Type":"application/json",
      "Cache-Control":"no-store"
    }
  });
}


function publicConnection(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  const {secret:_secret,...safe}=value as Record<string,unknown>;
  return safe;
}

function parseProcessingRegion(value:unknown){
  const region=String(value||"").trim().toLowerCase();
  if(!region)return null;
  if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(region)){
    throw new Error("Processing region must be a normalized provider region identifier.");
  }
  return region;
}

function parseEndpoint(raw:string,provider:string){
  let url:URL;
  try{url=new URL(raw)}catch{throw new Error("Provider endpoint is invalid.");}
  if(url.protocol!=="https:")throw new Error("Provider endpoint must use HTTPS.");
  if(url.username||url.password)throw new Error("Provider endpoint credentials are not allowed in the URL.");
  if(url.port&&url.port!=="443")throw new Error("Provider endpoint must use the standard HTTPS port.");

  const host=url.hostname.toLowerCase();
  if(
    !host||
    host==="localhost"||
    host.endsWith(".local")||
    host==="0.0.0.0"||
    host==="127.0.0.1"||
    host==="::1"
  ){
    throw new Error("Local or internal provider endpoints are not allowed.");
  }
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)){
    throw new Error("IP-address provider endpoints are not allowed; use an approved hostname.");
  }

  if(provider==="openai"){
    if(
      host!=="api.openai.com"||
      url.pathname!=="/v1/chat/completions"||
      url.search||
      url.hash
    ){
      throw new Error("OpenAI connections must use https://api.openai.com/v1/chat/completions");
    }
  }

  return {url:url.toString(),host};
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("Origin");
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json({error:"Method not allowed."},405,origin);

  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization=req.headers.get("Authorization");
    if(!supabaseUrl||!anonKey||!serviceKey||!authorization){
      return json({error:"AI connection service is not configured."},500,origin);
    }

    const caller=createClient(supabaseUrl,anonKey,{
      global:{headers:{Authorization:authorization}},
      auth:{persistSession:false}
    });
    const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});

    const {data:userData,error:userError}=await caller.auth.getUser();
    if(userError||!userData.user)return json({error:"Authentication is required."},401,origin);
    const user=userData.user;

    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"connect");
    const projectId=String(body?.projectId||"");
    if(!projectId)return json({error:"projectId is required."},400,origin);

    const [{data:stakeholder},{data:member}]=await Promise.all([
      service
        .from("stakeholder_profiles")
        .select("status")
        .eq("project_id",projectId)
        .eq("user_id",user.id)
        .maybeSingle(),
      service
        .from("project_members")
        .select("status,role")
        .eq("project_id",projectId)
        .eq("user_id",user.id)
        .maybeSingle()
    ]);

    if(stakeholder?.status!=="active"&&member?.status!=="active"){
      return json({error:"Active stakeholder access is required."},403,origin);
    }

    const canManageShared=
      member?.status==="active"&&
      ["owner","admin"].includes(String(member.role||""));

    if(action==="shared_status"){
      if(!canManageShared)return json({error:"Owner or admin access is required."},403,origin);
      const {data,error}=await service.rpc("service_get_shared_ai_provider_status_v1",{
        target_project:projectId,
        target_actor:user.id
      });
      if(error)throw error;
      return json({ok:true,config:data},200,origin);
    }

    if(action==="disable_shared"){
      if(!canManageShared)return json({error:"Owner or admin access is required."},403,origin);
      const {data,error}=await service.rpc("service_disable_shared_ai_provider_config_v1",{
        target_project:projectId,
        target_actor:user.id
      });
      if(error)throw error;
      return json({ok:true,configId:data},200,origin);
    }

    if(action==="connect_shared"){
      if(!canManageShared)return json({error:"Owner or admin access is required."},403,origin);

      const provider=String(body?.provider||"openai_compatible").trim().toLowerCase();
      const label=String(body?.label||"").trim();
      const model=String(body?.model||"").trim();
      const secret=String(body?.apiKey||"").trim();
      const rawEndpoint=String(body?.apiBaseUrl||"").trim();
      const processingRegion=parseProcessingRegion(body?.processingRegion);

      if(provider!=="openai_compatible"){
        return json({error:"Project-shared providers must be OpenAI-compatible."},400,origin);
      }
      if(!label||!model||secret.length<8){
        return json({error:"Label, model and provider credential are required."},400,origin);
      }

      const endpoint=parseEndpoint(rawEndpoint,provider);
      const {data,error}=await service.rpc("service_upsert_shared_ai_provider_config_v1",{
        target_project:projectId,
        target_actor:user.id,
        target_provider:provider,
        target_label:label,
        target_api_base_url:endpoint.url,
        target_endpoint_host:endpoint.host,
        target_model:model,
        target_secret:secret
      });
      if(error)throw error;

      const {error:regionError}=await service.rpc(
        "service_set_shared_ai_provider_processing_region_v1",{
          target_project:projectId,
          target_actor:user.id,
          target_processing_region:processingRegion
        }
      );
      if(regionError)throw regionError;

      const {data:connection,error:syncError}=await service.rpc(
        "service_sync_shared_ai_provider_connection_v1",{
          target_project:projectId,
          target_user:user.id
        }
      );
      if(syncError)throw syncError;

      return json({ok:true,config:data,connection:publicConnection(connection)},200,origin);
    }

    if(action==="disable"){
      const connectionId=String(body?.connectionId||"");
      if(!connectionId)return json({error:"connectionId is required."},400,origin);
      const {data,error}=await service.rpc("service_disable_ai_provider_connection",{
        target_project:projectId,
        target_user:user.id,
        target_connection:connectionId
      });
      if(error)throw error;
      return json({ok:true,connectionId:data},200,origin);
    }

    if(action==="delete"){
      const connectionId=String(body?.connectionId||"");
      if(!connectionId)return json({error:"connectionId is required."},400,origin);
      const {data,error}=await service.rpc("service_delete_ai_provider_connection_v2",{
        target_project:projectId,
        target_user:user.id,
        target_connection:connectionId
      });
      if(error)throw error;
      return json({ok:true,connectionId:data},200,origin);
    }

    if(action!=="connect")return json({error:"Unsupported action."},400,origin);

    const provider=String(body?.provider||"openai").trim().toLowerCase();
    const label=String(body?.label||"").trim();
    const model=String(body?.model||"").trim();
    const secret=String(body?.apiKey||"").trim();
    const rawEndpoint=String(
      body?.apiBaseUrl||
      (provider==="openai"?"https://api.openai.com/v1/chat/completions":"")
    ).trim();
    const personalProcessingRegion=parseProcessingRegion(body?.processingRegion);

    if(!["openai","openai_compatible"].includes(provider)){
      return json({error:"Unsupported provider type."},400,origin);
    }
    if(!label||!model||secret.length<8){
      return json({error:"Label, model and provider credential are required."},400,origin);
    }

    const endpoint=parseEndpoint(rawEndpoint,provider);
    const {data,error}=await service.rpc("service_upsert_ai_provider_connection_v2",{
      target_project:projectId,
      target_user:user.id,
      target_provider:provider,
      target_label:label,
      target_api_base_url:endpoint.url,
      target_endpoint_host:endpoint.host,
      target_model:model,
      target_secret:secret
    });
    if(error)throw error;

    const connectionId=String((data as Record<string,unknown>|null)?.id||"");
    if(!connectionId)throw new Error("AI provider connection could not be resolved after update.");
    const {error:regionError}=await service.rpc(
      "service_set_ai_provider_processing_region_v1",{
        target_project:projectId,
        target_user:user.id,
        target_connection:connectionId,
        target_processing_region:personalProcessingRegion
      }
    );
    if(regionError)throw regionError;

    return json({
      ok:true,
      connection:publicConnection({
        ...(data as Record<string,unknown>),
        processing_region:personalProcessingRegion
      })
    },200,origin);
  }catch(error){
    return json({
      error:error instanceof Error
        ?error.message
        :"Unable to manage AI provider connection."
    },400,origin);
  }
});
