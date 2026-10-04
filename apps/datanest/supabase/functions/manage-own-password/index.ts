import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

declare const Deno:{
  env:{get:(name:string)=>string|undefined};
  serve:(handler:(request:Request)=>Response|Promise<Response>)=>void;
};

const allowedOrigins=new Set([
  "https://datanest-supository.github.io",
  "https://reson8.datanest.life",
  "https://reson8.life",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

const fallbackRedirect="https://datanest-supository.github.io/DataNest/";

function corsHeaders(req:Request){
  const origin=req.headers.get("origin")||"";
  const allowOrigin=allowedOrigins.has(origin)?origin:"https://datanest-supository.github.io";
  return {
    "Access-Control-Allow-Origin":allowOrigin,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin"
  };
}

function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...corsHeaders(req),"Content-Type":"application/json"}
  });
}

function safeRedirect(value:unknown){
  try{
    const url=new URL(String(value||""));
    if(allowedOrigins.has(url.origin))return url.toString();
  }catch{
    // Use the canonical fallback when a caller supplies no valid application URL.
  }
  return fallbackRedirect;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
  if(req.method!=="POST")return json(req,{error:"Method not allowed."},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization=req.headers.get("Authorization");

  if(!supabaseUrl||!anonKey||!serviceRoleKey||!authorization){
    return json(req,{error:"Account password service is not configured."},500);
  }

  const callerClient=createClient(supabaseUrl,anonKey,{
    global:{headers:{Authorization:authorization}},
    auth:{persistSession:false}
  });
  const verificationClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false}});
  const emailClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false}});
  const service=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false}});

  const {data:userResult,error:userError}=await callerClient.auth.getUser();
  const caller=userResult.user;
  if(userError||!caller||!caller.email){
    return json(req,{error:"Authentication with an email account is required."},401);
  }
  const callerId=caller.id;
  const callerEmail=caller.email;

  let payload:{
    projectId?:string;
    action?:string;
    currentPassword?:string;
    newPassword?:string;
    redirectTo?:string;
  };
  try{
    payload=await req.json();
  }catch{
    return json(req,{error:"Invalid JSON body."},400);
  }

  const projectId=String(payload.projectId||"").trim();
  const action=String(payload.action||"").trim();
  if(!projectId)return json(req,{error:"Project is required."},400);
  if(action!=="change"&&action!=="email_reset"){
    return json(req,{error:"Unsupported password action."},400);
  }

  const {data:membership,error:membershipError}=await service
    .from("project_members")
    .select("role,status")
    .eq("project_id",projectId)
    .eq("user_id",callerId)
    .maybeSingle();

  if(membershipError)return json(req,{error:"Unable to verify project access."},500);
  if(!membership||membership.status!=="active"){
    return json(req,{error:"Active project membership is required."},403);
  }
  const membershipRole=membership.role;

  async function record(actionName:"self_change"|"self_email_reset",metadata:Record<string,unknown>){
    const {error}=await service.from("password_security_events").insert({
      project_id:projectId,
      actor_user_id:callerId,
      target_user_id:callerId,
      action:actionName,
      actor_role:membershipRole,
      target_role:membershipRole,
      outcome:"succeeded",
      metadata
    });
    return !error;
  }

  if(action==="email_reset"){
    const {error}=await emailClient.auth.resetPasswordForEmail(callerEmail,{
      redirectTo:safeRedirect(payload.redirectTo)
    });
    if(error)return json(req,{error:error.message},400);

    const auditRecorded=await record("self_email_reset",{
      source:"manage-own-password",
      delivery:"email"
    });
    return json(req,{ok:true,action,auditRecorded});
  }

  const currentPassword=String(payload.currentPassword||"");
  const newPassword=String(payload.newPassword||"");

  if(!currentPassword)return json(req,{error:"Current password is required."},400);
  if(newPassword.length<12){
    return json(req,{error:"New passwords must contain at least 12 characters."},400);
  }
  if(newPassword.length>128){
    return json(req,{error:"New passwords must be 128 characters or fewer."},400);
  }
  if(currentPassword===newPassword){
    return json(req,{error:"Choose a new password that differs from your current password."},400);
  }

  const {error:verificationError}=await verificationClient.auth.signInWithPassword({
    email:callerEmail,
    password:currentPassword
  });
  if(verificationError){
    return json(req,{error:"Current password is incorrect."},403);
  }

  const {error:updateError}=await service.auth.admin.updateUserById(callerId,{password:newPassword});
  if(updateError)return json(req,{error:updateError.message},400);

  const auditRecorded=await record("self_change",{source:"manage-own-password"});
  return json(req,{ok:true,action,auditRecorded});
});
