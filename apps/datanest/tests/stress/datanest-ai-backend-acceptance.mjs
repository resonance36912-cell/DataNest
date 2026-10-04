import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Fail closed BEFORE loading a client or issuing any request.
const target = new URL(process.env.DATANEST_CERTIFICATION_URL || "https://invalid.invalid");
const stagingTarget = new URL(process.env.DATANEST_AI_STAGING_URL || "https://invalid.invalid");
assert.ok(["127.0.0.1","localhost"].includes(target.hostname), "Backend acceptance must authenticate against the isolated canonical stack.");
assert.equal(stagingTarget.href, "https://qchttpcyqlqnhvahprhz.supabase.co/", "The AI data plane must remain the dedicated staging project.");
assert.equal(process.env.DATANEST_AI_E2E_EMAIL, "datanest-ai-e2e@resonance.invalid", "Only the governed synthetic E2E identity may run this suite.");
for (const name of ["DATANEST_CERTIFICATION_PUBLISHABLE_KEY", "DATANEST_CERTIFICATION_SERVICE_ROLE_KEY", "DATANEST_AI_STAGING_SERVICE_ROLE_KEY", "DATANEST_AI_E2E_PASSWORD"]) {
  assert.ok(process.env[name], `${name} is required.`);
}

const { createClient } = await import("@supabase/supabase-js");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = createClient(target.origin, process.env.DATANEST_CERTIFICATION_PUBLISHABLE_KEY, options);
const admin = createClient(target.origin, process.env.DATANEST_CERTIFICATION_SERVICE_ROLE_KEY, options);
const stagingAdmin = createClient(stagingTarget.origin, process.env.DATANEST_AI_STAGING_SERVICE_ROLE_KEY, options);
function dataOf(result, label) {
  if (result.error || !result.data) throw new Error(`${label} failed.`);
  return result.data;
}
const signed = dataOf(await client.auth.signInWithPassword({
  email: process.env.DATANEST_AI_E2E_EMAIL,
  password: process.env.DATANEST_AI_E2E_PASSWORD
}), "Synthetic sign-in");
assert.ok(signed.session?.access_token, "An authenticated user token is required.");
const project = dataOf(await admin.from("projects").select("id").eq("slug", "resonance-datanest").single(), "Fixture project lookup");
const job = dataOf(await admin.from("jobs").select("id,requirements").eq("project_id", project.id).eq("title", "DataNest AI E2E Job").single(), "Fixture job lookup");
assert.equal(job.requirements?.environment, "certification", "The job must be an explicit canonical certification fixture.");
const fixtureMarker = "backend-acceptance-" + randomUUID();
const results = [];

// Functions are invoked with the USER token, never the service-role key.
// Privileged access below is restricted to creating/reading synthetic fixtures.
async function invoke(slug, body) {
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.DATANEST_CERTIFICATION_PUBLISHABLE_KEY,
    Authorization: `Bearer ${signed.session.access_token}`
  };
  let last = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${target.origin}/functions/v1/${slug}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers,
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    last = {
      status: response.status,
      body: parsed,
      edgeErrorCode: response.headers.get("sb-error-code")
    };
    if (![502, 503, 504].includes(response.status) || attempt === 4) return last;
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return last;
}
async function runCase(id, check) {
  try {
    await check();
    results.push({ id, status: "passed" });
  } catch (error) {
    results.push({ id, status: "failed", message: error instanceof Error ? error.message : "Acceptance check failed." });
  }
}

await runCase("AUD-003-content-bound-replay", async () => {
  const external = dataOf(await client.rpc("start_external_ai_sidebar_session", {
    target_job: job.id, target_provider: "chatgpt", target_mode: "companion"
  }), "External fixture session");
  assert.ok(external.session_id, "Expected a tracked external session.");
  const contentA = fixtureMarker + "-original-A";
  const input = { sourceType: "ai_companion", externalAiSessionId: external.session_id, content: contentA };
  const first = await invoke("datanest-ai-intake", input);
  assert.equal(first.status, 200, "Initial A import must succeed.");
  assert.ok(first.body.eventId, "Initial A import must return its event identity.");
  assert.ok(first.body.sessionId, "Initial A import must return its DataNest session.");
  const replay = await invoke("datanest-ai-intake", input);
  assert.equal(replay.status, 200, "A/A replay must succeed.");
  assert.equal(replay.body.idempotent, true, "A/A must be an idempotent replay.");
  assert.equal(replay.body.eventId, first.body.eventId, "A/A must preserve the event identity.");
  const changed = await invoke("datanest-ai-intake", { ...input, content: fixtureMarker + "-changed-B" });
  assert.equal(changed.status, 409, "A/B must conflict; old code falsely returns 200.");
  assert.equal(replay.body.sessionId, first.body.sessionId, "A/A must preserve the original DataNest session.");
  const stored = dataOf(await stagingAdmin.from("ai_intake_events")
    .select("id,content,content_hash,session_id")
    .eq("project_id", project.id).eq("job_id", job.id)
    .eq("source_type", "ai_companion").eq("external_ai_session_id", external.session_id), "Replay fixture inspection");
  assert.equal(stored.length, 1, "A/A/B must leave exactly one immutable event.");
  assert.equal(stored[0].id, first.body.eventId);
  assert.equal(stored[0].content, contentA);
  assert.equal(stored[0].content_hash, createHash("sha256").update(contentA).digest("hex"));
  assert.equal(first.body.trustState, "UNCERTIFIED");
  assert.equal(replay.body.trustState, "UNCERTIFIED");
});

await runCase("AUD-004-recent-130-event-window", async () => {
  const opened = await invoke("datanest-ai-chat", { action: "context", jobId: job.id, sessionId: null });
  assert.equal(opened.status, 200, "Opening an isolated context session must succeed.");
  const sessionId = opened.body.sessionId;
  assert.ok(sessionId, "Expected a new DataNest session.");
  const start = Date.now() - 131000;
  const rows = Array.from({ length: 130 }, (_, index) => {
    const content = `${fixtureMarker}-event-${String(index + 1).padStart(3, "0")}`;
    return {
      id: randomUUID(), trace_id: "DN-AI-" + randomUUID(),
      project_id: project.id, job_id: job.id, session_id: sessionId,
      source_type: "human", source_user_id: signed.user.id, client_request_id: randomUUID(),
      content, content_hash: createHash("sha256").update(content).digest("hex"),
      created_at: new Date(start + index * 1000).toISOString(),
      metadata: { test_fixture: fixtureMarker, trust_state: "uncertified" }
    };
  });
  const inserted = await stagingAdmin.from("ai_intake_events").insert(rows);
  if (inserted.error) throw new Error("Seeding the isolated 130-event fixture failed.");
  const context = await invoke("datanest-ai-chat", { action: "context", jobId: job.id, sessionId });
  assert.equal(context.status, 200, "Retrieving the long session must succeed.");
  assert.equal(context.body.sessionId, sessionId);
  const events = context.body.events;
  assert.ok(Array.isArray(events), "Context must expose its actual returned evidence.");
  assert.equal(events.length, 100, "Context must remain bounded to 100 events.");
  assert.deepEqual(events.map(event => event.id), rows.slice(-100).map(event => event.id), "Return events 31-130, chronologically; not oldest events 1-100.");
  assert.equal(events.some(event => event.content === rows[124].content), true, "The correction at event 125 must remain available.");
  assert.ok(events.every(event => event.project_id === project.id && event.job_id === job.id && event.session_id === sessionId), "Context must remain scoped to the fixture session.");
});

// Retain synthetic intake evidence; never delete or rewrite append-only records.
// The collaborator is authenticated only by canonical DataNest. Staging is a
// service-role data plane and is never used as the synthetic user's auth authority.
const evidence = {
  suite: "datanest-ai-backend-acceptance-v2",
  certificationTarget: "local-canonical",
  stagingDataPlane: "qchttpcyqlqnhvahprhz",
  syntheticStagingSignIn: false,
  candidateCommit: process.env.DATANEST_CANDIDATE_SHA || null,
  checkoutCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  fixtureMarker, completedAt: new Date().toISOString(), results,
  productionTested: false, deployedSourceDigestVerified: false,
  status: results.every(item => item.status === "passed") ? "passed" : "failed"
};
await mkdir("certification-artifacts", { recursive: true });
await writeFile("certification-artifacts/datanest-ai-backend-acceptance.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence));
if (evidence.status !== "passed") process.exitCode = 1;
