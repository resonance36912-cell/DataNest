import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

declare const Deno:{
  env:{get:(name:string)=>string|undefined};
  serve:(handler:(request:Request)=>Response|Promise<Response>)=>void;
};

const allowedOrigins = new Set([
  "https://datanest-supository.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
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
    return json(req, { error: "Project invite service is not configured." }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });

  const emailClient = createClient(supabaseUrl, anonKey, {
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

  let payload: { projectId?: string; email?: string; role?: string };
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body." }, 400);
  }

  const projectId = String(payload.projectId || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "viewer").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(req, { error: "A valid project-member email is required." }, 400);
  }

  if (!["admin", "operator", "viewer"].includes(role)) {
    return json(req, { error: "Project-member role must be admin, operator or viewer." }, 400);
  }

  const { data: project, error: projectError } = await service
    .from("projects")
    .select("id,slug,name")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    return json(req, { error: "Project was not found." }, 404);
  }

  const { data: callerMembership } = await service
    .from("project_members")
    .select("role,status")
    .eq("project_id", project.id)
    .eq("user_id", caller.id)
    .maybeSingle();

  if (!callerMembership || callerMembership.status !== "active" || !["owner", "admin"].includes(callerMembership.role)) {
    return json(req, { error: "Owner or admin access is required to invite project members." }, 403);
  }

  if (callerMembership.role === "admin" && role === "admin") {
    return json(req, { error: "Only the project owner may invite another admin." }, 403);
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentInviteCount } = await service
    .from("project_member_invitations")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", caller.id)
    .gte("invited_at", since);

  if ((recentInviteCount || 0) >= 20) {
    return json(req, { error: "Project invite rate limit reached. Try again later." }, 429);
  }

  const { data: existingUserId, error: resolveError } = await service.rpc(
    "service_resolve_project_invite_user_v1",
    { target_email: email }
  );

  if (resolveError) {
    return json(req, { error: "Unable to resolve project-member account." }, 500);
  }

  if (existingUserId && String(existingUserId) === caller.id) {
    return json(req, { error: "You cannot invite yourself as an independent project member." }, 400);
  }

  let existingAuthUser: { email_confirmed_at?: string | null } | null = null;

  if (existingUserId) {
    const { data: existingMembership } = await service
      .from("project_members")
      .select("role,status")
      .eq("project_id", project.id)
      .eq("user_id", String(existingUserId))
      .maybeSingle();

    if (existingMembership?.status === "active") {
      return json(req, { error: "This user is already an active project member." }, 409);
    }

    const { data: existingAuthResult, error: existingAuthError } =
      await service.auth.admin.getUserById(String(existingUserId));

    if (existingAuthError || !existingAuthResult.user) {
      return json(req, { error: "Unable to inspect the existing invite account." }, 500);
    }

    existingAuthUser = existingAuthResult.user;
  }

  const redirectTo = "https://datanest-supository.github.io/DataNest/";
  const inviteOptions = {
    redirectTo,
    data: {
      datanest_invite_kind: "project-member",
      datanest_project_id: project.id,
      datanest_project_role: role
    }
  };
  let invitedUserId: string | null = existingUserId ? String(existingUserId) : null;

  // Establish durable Auth identity before the governed invitation record.
  // Supabase's admin createUser creates an unconfirmed account without
  // sending email; the actual invitation/recovery message is attempted only
  // after project invitation registration succeeds.
  if (!invitedUserId) {
    const { data: createdUser, error: createUserError } =
      await service.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: inviteOptions.data
      });

    if (createUserError || !createdUser.user) {
      return json(req, {
        error: createUserError?.message || "Unable to create project-member account."
      }, 400);
    }

    invitedUserId = createdUser.user.id;
    existingAuthUser = {
      email_confirmed_at: createdUser.user.email_confirmed_at
    };
  }

  // The governed invitation and invited project-membership state are committed
  // before any email side effect. Delivery can therefore fail independently
  // while leaving a durable, retryable invitation record behind.
  const { data: registration, error: registrationError } = await service.rpc(
    "service_register_project_member_invite_v1",
    {
      target_project: project.id,
      target_user: invitedUserId,
      target_email: email,
      target_role: role,
      invited_by_user: caller.id
    }
  );

  if (registrationError) {
    return json(req, { error: registrationError.message }, 400);
  }

  let delivery: "invite" | "reinvite" | "recovery" = "invite";

  if (!existingAuthUser?.email_confirmed_at) {
    delivery = existingUserId ? "reinvite" : "invite";
    const { data: inviteData, error: inviteError } =
      await service.auth.admin.inviteUserByEmail(email, inviteOptions);

    if (inviteError || !inviteData.user) {
      return json(req, {
        ok: false,
        delivery: "failed",
        error: inviteError?.message || "Project invitation was registered, but email delivery failed.",
        retryable: true,
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name
        },
        invitation: registration,
        formalVotingEligible: false,
        acceptanceRequired: true
      }, 502);
    }
  } else {
    delivery = "recovery";
    const { error: recoveryError } = await emailClient.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (recoveryError) {
      return json(req, {
        ok: false,
        delivery: "failed",
        error: recoveryError.message || "Project invitation was registered, but recovery email delivery failed.",
        retryable: true,
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name
        },
        invitation: registration,
        formalVotingEligible: false,
        acceptanceRequired: true
      }, 502);
    }
  }

  return json(req, {
    ok: true,
    delivery,
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name
    },
    invitation: registration,
    formalVotingEligible: false,
    acceptanceRequired: true
  });
});
