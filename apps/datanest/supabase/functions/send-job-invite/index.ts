import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

declare const Deno:{
  env:{get:(name:string)=>string|undefined};
  serve:(handler:(request:Request)=>Response|Promise<Response>)=>void;
};

const allowedOrigins = new Set([
  "https://datanest-supository.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = allowedOrigins.has(origin)
    ? origin
    : "https://datanest-supository.github.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json"
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json(req, { error: "Invite service is not configured." }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: userResult, error: userError } = await callerClient.auth.getUser();
  const caller = userResult.user;

  if (userError || !caller) {
    return json(req, { error: "Authentication is required." }, 401);
  }

  let payload: { jobId?: string; email?: string; role?: string };
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body." }, 400);
  }

  const jobId = String(payload.jobId || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "contributor").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(req, { error: "A valid collaborator email is required." }, 400);
  }

  if (!["contributor", "reviewer", "observer"].includes(role)) {
    return json(req, { error: "Invalid collaborator role." }, 400);
  }

  const { data: job, error: jobError } = await service
    .from("jobs")
    .select("id,project_id,job_number,title")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    return json(req, { error: "Job Manifest was not found." }, 404);
  }

  const { data: membership } = await service
    .from("project_members")
    .select("role,status")
    .eq("project_id", job.project_id)
    .eq("user_id", caller.id)
    .maybeSingle();

  if (!membership || membership.status !== "active" || !["owner","admin","operator"].includes(membership.role)) {
    return json(req, { error: "Operator access is required to send invitations." }, 403);
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentInviteCount } = await service
    .from("job_collaborators")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", caller.id)
    .gte("invited_at", since);

  if ((recentInviteCount || 0) >= 20) {
    return json(req, { error: "Invite rate limit reached. Try again later." }, 429);
  }

  const redirectTo = "https://datanest-supository.github.io/DataNest/";
  let invitedUserId: string | null = null;
  let delivery: "invite" | "magic-link" = "invite";

  const { data: existingUserId, error: resolveError } = await service.rpc(
    "resolve_auth_user_id_by_email",
    { target_email: email }
  );

  if (resolveError) {
    return json(req, { error: "Unable to resolve collaborator account." }, 500);
  }

  if (existingUserId) {
    invitedUserId = String(existingUserId);
    delivery = "magic-link";

    const { error: magicError } = await service.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo
      }
    });

    if (magicError) {
      return json(req, { error: magicError.message }, 400);
    }
  } else {
    const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          datanest_project_id: job.project_id,
          datanest_job_id: job.id,
          datanest_job_role: role
        }
      }
    );

    if (inviteError || !inviteData.user) {
      return json(req, { error: inviteError?.message || "Unable to send invitation." }, 400);
    }

    invitedUserId = inviteData.user.id;
  }

  const { data: registration, error: registrationError } = await service.rpc(
    "register_job_invite",
    {
      target_job: job.id,
      target_user: invitedUserId,
      target_email: email,
      target_job_role: role,
      invited_by_user: caller.id
    }
  );

  if (registrationError) {
    return json(req, { error: registrationError.message }, 400);
  }

  return json(req, {
    ok: true,
    delivery,
    job: {
      id: job.id,
      number: job.job_number,
      title: job.title
    },
    collaborator: registration
  });
});
