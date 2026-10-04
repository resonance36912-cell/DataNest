import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

declare const Deno:{
  env:{get:(name:string)=>string|undefined};
  serve:(handler:(request:Request)=>Response|Promise<Response>)=>void;
};

const allowedOrigins = new Set([
  "https://datanest-supository.github.io",
  "https://reson8.datanest.life",
  "https://reson8.life",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

const fallbackRedirect = "https://datanest-supository.github.io/DataNest/";

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
  if(req.method==="OPTIONS"){
    return new Response("ok",{headers:corsHeaders(req)});
  }

  if(req.method!=="POST"){
    return json(req,{error:"Method not allowed."},405);
  }

  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization=req.headers.get("Authorization");

  if(!supabaseUrl||!anonKey||!serviceRoleKey||!authorization){
    return json(req,{error:"Password management service is not configured."},500);
  }

  const callerClient=createClient(supabaseUrl,anonKey,{
    global:{headers:{Authorization:authorization}},
    auth:{persistSession:false}
  });
  const emailClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false}});
  const service=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false}});

  async function recordPasswordSecurityEvent(values:{
    projectId:string;
    actorUserId:string;
    targetUserId:string;
    action:"admin_email_reset"|"admin_set_temporary";
    actorRole:string;
    targetRole:string;
    metadata?:Record<string,unknown>;
  }){
    const {error}=await service.from("password_security_events").insert({
      project_id:values.projectId,
      actor_user_id:values.actorUserId,
      target_user_id:values.targetUserId,
      action:values.action,
      actor_role:values.actorRole,
      target_role:values.targetRole,
      outcome:"succeeded",
      metadata:values.metadata||{}
    });
    return !error;
  }

  const {data:userResult,error:userError}=await callerClient.auth.getUser();
  const caller=userResult.user;
  if(userError||!caller){
    return json(req,{error:"Authentication is required."},401);
  }

  let payload:{
    projectId?:string;
    userId?:string;
    action?:string;
    password?:string;
    redirectTo?:string;
  };
  try{
    payload=await req.json();
  }catch{
    return json(req,{error:"Invalid JSON body."},400);
  }

  const projectId=String(payload.projectId||"").trim();
  const userId=String(payload.userId||"").trim();
  const action=String(payload.action||"").trim();

  if(!projectId||!userId){
    return json(req,{error:"Project and target user are required."},400);
  }
  if(action!=="email_reset"&&action!=="set_temporary"){
    return json(req,{error:"Unsupported password action."},400);
  }

  const {data:callerMembership,error:callerMembershipError}=await service
    .from("project_members")
    .select("role,status")
    .eq("project_id",projectId)
    .eq("user_id",caller.id)
    .maybeSingle();

  if(callerMembershipError){
    return json(req,{error:"Unable to verify caller access."},500);
  }
  if(!callerMembership||callerMembership.status!=="active"||!["owner","admin"].includes(callerMembership.role)){
    return json(req,{error:"Owner or admin access is required to manage member passwords."},403);
  }

  const {data:targetMembership,error:targetMembershipError}=await service
    .from("project_members")
    .select("role,status")
    .eq("project_id",projectId)
    .eq("user_id",userId)
    .maybeSingle();

  if(targetMembershipError){
    return json(req,{error:"Unable to verify the target member."},500);
  }
  if(!targetMembership||targetMembership.status!=="active"){
    return json(req,{error:"The target must be an active member of this project."},404);
  }

  if(callerMembership.role==="admin"&&["owner","admin"].includes(targetMembership.role)){
    return json(req,{error:"Admins cannot change owner or admin account passwords."},403);
  }

  const {data:targetResult,error:targetError}=await service.auth.admin.getUserById(userId);
  const target=targetResult.user;
  if(targetError||!target){
    return json(req,{error:"Unable to resolve the target authentication account."},404);
  }

  if(action==="email_reset"){
    if(!target.email){
      return json(req,{error:"The target account has no email address for password recovery."},400);
    }
    const {error:resetError}=await emailClient.auth.resetPasswordForEmail(target.email,{
      redirectTo:safeRedirect(payload.redirectTo)
    });
    if(resetError){
      return json(req,{error:resetError.message},400);
    }
    const auditRecorded=await recordPasswordSecurityEvent({
      projectId,
      actorUserId:caller.id,
      targetUserId:userId,
      action:"admin_email_reset",
      actorRole:callerMembership.role,
      targetRole:targetMembership.role,
      metadata:{source:"manage-user-password",delivery:"email"}
    });
    return json(req,{ok:true,action:"email_reset",userId,auditRecorded});
  }

  const password=String(payload.password||"");
  if(password.length<12){
    return json(req,{error:"Temporary passwords must contain at least 12 characters."},400);
  }
  if(password.length>128){
    return json(req,{error:"Temporary passwords must be 128 characters or fewer."},400);
  }

  const {error:updateError}=await service.auth.admin.updateUserById(userId,{password});
  if(updateError){
    return json(req,{error:updateError.message},400);
  }

  const auditRecorded=await recordPasswordSecurityEvent({
    projectId,
    actorUserId:caller.id,
    targetUserId:userId,
    action:"admin_set_temporary",
    actorRole:callerMembership.role,
    targetRole:targetMembership.role,
    metadata:{source:"manage-user-password"}
  });
  return json(req,{ok:true,action:"set_temporary",userId,auditRecorded});
});
