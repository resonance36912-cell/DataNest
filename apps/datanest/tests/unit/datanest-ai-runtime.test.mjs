import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGovernedPrompt,
  executeChatTurn,
  filterCurrentSessionEvidence,
  sha256Text
} from "../../supabase/functions/_shared/datanestAiRuntime.ts";

test("governed prompt orders certified memory before provisional session evidence", () => {
  const prompt = buildGovernedPrompt({
    governance: "GOVERNANCE",
    certifiedMemory: ["CERTIFIED-A"],
    job: { id: "j1", title: "Job One" },
    uncertifiedEvidence: ["UNCERTIFIED-B"],
    userMessage: "USER-C"
  });
  assert.ok(prompt.indexOf("GOVERNANCE") < prompt.indexOf("CERTIFIED-A"));
  assert.ok(prompt.indexOf("CERTIFIED-A") < prompt.indexOf("UNCERTIFIED-B"));
  assert.ok(prompt.indexOf("UNCERTIFIED-B") < prompt.indexOf("USER-C"));
});

test("session evidence cannot cross job or session", () => {
  const events = [
    { projectId:"p",jobId:"j1",sessionId:"s1",content:"keep" },
    { projectId:"p",jobId:"j2",sessionId:"s1",content:"wrong job" },
    { projectId:"p",jobId:"j1",sessionId:"s2",content:"wrong session" }
  ];
  assert.deepEqual(
    filterCurrentSessionEvidence(events,{projectId:"p",jobId:"j1",sessionId:"s1"}).map(x=>x.content),
    ["keep"]
  );
});

test("message hashing is stable and content-sensitive", async () => {
  assert.equal(await sha256Text("same"), await sha256Text("same"));
  assert.notEqual(await sha256Text("same"), await sha256Text("different"));
});

test("staging intake failure prevents provider call and finalizes the request", async () => {
  let providerCalls = 0;
  let finalized = null;
  const deps = {
    beginRequest: async () => ({ id:"r1", isNew:true }),
    stageInput: async () => { throw new Error("staging down"); },
    finishRequest: async (input) => { finalized = input; },
    callProvider: async () => { providerCalls++; return {content:"bad"}; }
  };
  await assert.rejects(
    () => executeChatTurn(deps,{message:"x"}),
    /staging down/
  );
  assert.equal(providerCalls, 0);
  assert.deepEqual(finalized, {
    requestId:"r1",
    status:"failed",
    errorCategory:"staging_intake_failed"
  });
});

test("cached duplicate does not call provider again", async () => {
  let providerCalls = 0;
  const result = await executeChatTurn({
    beginRequest: async () => ({ id:"r1", isNew:false }),
    loadCachedTurn: async () => ({
      assistant:"cached",
      outputTraceId:"t2",
      sessionId:"s1"
    }),
    callProvider: async () => { providerCalls++; return {content:"bad"}; }
  },{message:"same"});
  assert.equal(result.assistant, "cached");
  assert.equal(result.providerMode, "cached");
  assert.equal(result.idempotent, true);
  assert.equal(providerCalls, 0);
});
