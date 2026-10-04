import assert from "node:assert/strict";
import test from "node:test";
import {
  AipiError,
  authorizeProjectBearer,
  makeAuditEvent,
  parseAllowedModels,
  parseProjectKeys,
  requireProject,
  resolveUpstreamConfig,
  validateChatPayload,
} from "../../src/lib/aipiCore.ts";

test("AiPI project-scoped bearer authentication fails closed", () => {
  const configured = "project-a=alpha,project-b=beta,project-a=rotated";
  assert.deepEqual(parseProjectKeys(configured), [
    { project: "project-a", key: "alpha" },
    { project: "project-b", key: "beta" },
    { project: "project-a", key: "rotated" },
  ]);
  assert.equal(authorizeProjectBearer("Bearer alpha", undefined, "project-a"), false);
  assert.equal(authorizeProjectBearer(null, configured, "project-a"), false);
  assert.equal(authorizeProjectBearer("Bearer wrong", configured, "project-a"), false);
  assert.equal(authorizeProjectBearer("Bearer beta", configured, "project-a"), false);
  assert.equal(authorizeProjectBearer("bearer rotated", configured, "project-a"), true);
});

test("AiPI model registry is allowlist based", () => {
  assert.deepEqual(parseAllowedModels("model-a, model-b,model-a", undefined), ["model-a", "model-b"]);
  assert.deepEqual(parseAllowedModels(undefined, "shared-model"), ["shared-model"]);

  assert.throws(
    () => validateChatPayload({ messages: [{ role: "user", content: "hello" }], model: "other" }, ["model-a"]),
    (error) => error instanceof AipiError && error.code === "model_not_allowed" && error.status === 403,
  );
});

test("AiPI validates governed chat payloads", () => {
  const payload = validateChatPayload(
    {
      messages: [{ role: "user", content: " hello " }],
      temperature: 0.3,
      max_output_tokens: 512,
    },
    ["model-a"],
  );

  assert.equal(payload.model, "model-a");
  assert.deepEqual(payload.messages, [{ role: "user", content: "hello" }]);
  assert.equal(payload.temperature, 0.3);
  assert.equal(payload.max_output_tokens, 512);
});

test("AiPI project identity is constrained", () => {
  assert.equal(requireProject("resonance:demo.project-1"), "resonance:demo.project-1");
  assert.throws(
    () => requireProject("../../escape"),
    (error) => error instanceof AipiError && error.code === "invalid_project",
  );
});

test("AiPI upstream requires HTTPS and an exact pinned host", () => {
  assert.deepEqual(
    resolveUpstreamConfig({
      url: "https://ai.example.com/v1/chat/completions",
      host: "ai.example.com",
      apiKey: "secret",
    }),
    {
      url: "https://ai.example.com/v1/chat/completions",
      host: "ai.example.com",
      apiKey: "secret",
    },
  );

  for (const url of [
    "http://ai.example.com/v1/chat/completions",
    "https://evil.example.com/v1/chat/completions",
    "https://user:pass@ai.example.com/v1/chat/completions",
    "https://ai.example.com:8443/v1/chat/completions",
  ]) {
    assert.throws(
      () => resolveUpstreamConfig({ url, host: "ai.example.com", apiKey: "secret" }),
      (error) => error instanceof AipiError && error.code === "provider_endpoint_rejected",
    );
  }
});

test("AiPI audit events contain metadata but no prompt or secret fields", () => {
  const event = makeAuditEvent({
    requestId: "req-1",
    project: "project-1",
    action: "ai.chat",
    outcome: "allowed",
    model: "model-a",
    startedAtMs: Date.now(),
  });

  assert.equal(event.request_id, "req-1");
  assert.equal(event.project, "project-1");
  assert.equal(event.model, "model-a");
  assert.equal("messages" in event, false);
  assert.equal("authorization" in event, false);
  assert.equal("secret" in event, false);
});
