import { createClient } from "@supabase/supabase-js";

const url=process.env.DATANEST_CERTIFICATION_URL;
const serviceKey=process.env.DATANEST_CERTIFICATION_SERVICE_ROLE_KEY;
const email=process.env.DATANEST_AI_E2E_EMAIL;
const password=process.env.DATANEST_AI_E2E_PASSWORD;

if(!url||!serviceKey||!email||!password){
  throw new Error("DATANEST_CERTIFICATION_URL, DATANEST_CERTIFICATION_SERVICE_ROLE_KEY, DATANEST_AI_E2E_EMAIL and DATANEST_AI_E2E_PASSWORD are required.");
}

const admin=createClient(url,serviceKey,{
  auth:{persistSession:false,autoRefreshToken:false}
});

async function ensureUser(){
  let page=1;
  let user=null;
  while(!user&&page<=20){
    const listed=await admin.auth.admin.listUsers({page,perPage:100});
    if(listed.error)throw listed.error;
    user=listed.data.users.find(item=>item.email===email)||null;
    if(listed.data.users.length<100)break;
    page++;
  }
  if(user){
    const updated=await admin.auth.admin.updateUserById(user.id,{
      password,
      email_confirm:true
    });
    if(updated.error)throw updated.error;
    return updated.data.user;
  }
  const created=await admin.auth.admin.createUser({
    email,
    password,
    email_confirm:true
  });
  if(created.error)throw created.error;
  return created.data.user;
}

async function ensureProject(userId){
  const existing=await admin.from("projects")
    .select("id,slug")
    .eq("slug","resonance-datanest")
    .maybeSingle();
  if(existing.error)throw existing.error;

  let project=existing.data;
  if(!project){
    const inserted=await admin.from("projects").insert({
      slug:"resonance-datanest",
      name:"Resonance DataNest",
      description:"Governed canonical DataNest AI certification project.",
      status:"ACTIVE"
    }).select("id,slug").single();
    if(inserted.error)throw inserted.error;
    project=inserted.data;
  }

  const member=await admin.from("project_members").upsert({
    project_id:project.id,
    user_id:userId,
    role:"owner",
    status:"active",
    updated_at:new Date().toISOString()
  },{onConflict:"project_id,user_id"}).select("project_id").single();
  if(member.error)throw member.error;

  return project;
}

async function ensureJob(projectId,{title,description,priority}){
  const existing=await admin.from("jobs")
    .select("id,job_number,title")
    .eq("project_id",projectId)
    .eq("title",title)
    .maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data)return existing.data;

  const inserted=await admin.from("jobs").insert({
    project_id:projectId,
    title,
    description,
    priority,
    status:"READY",
    required_capabilities:["chat"],
    requirements:{environment:"certification"},
    acceptance:{traceable:true,uncertified_session:true}
  }).select("id,job_number,title").single();
  if(inserted.error)throw inserted.error;
  return inserted.data;
}

const user=await ensureUser();
if(!user)throw new Error("Unable to resolve E2E user.");
const project=await ensureProject(user.id);
const job=await ensureJob(project.id,{
  title:"DataNest AI E2E Job",
  description:"Deterministic canonical certification Job Manifest for governed DataNest AI acceptance.",
  priority:70
});
const switchJob=await ensureJob(project.id,{
  title:"DataNest AI E2E Job B",
  description:"Second deterministic canonical certification Job Manifest for governed context-switch acceptance.",
  priority:60
});

console.log(JSON.stringify({
  projectId:project.id,
  jobId:job.id,
  jobNumber:job.job_number,
  switchJobId:switchJob.id,
  switchJobNumber:switchJob.job_number
}));
