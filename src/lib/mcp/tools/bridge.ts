import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { bridgeClientId, bridgeRpc, type BridgeAuthContext } from "../bridge-client";

const deviceId = z.string().uuid().describe("Paired bridge device ID.");
const workspace = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._:/-]+$/)
  .describe("Approved workspace identifier, not an arbitrary filesystem path.");
const jobId = z.string().uuid().describe("Bridge job ID.");

function ok(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: { result: payload },
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Bridge operation failed";
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

async function enqueue(
  ctx: BridgeAuthContext,
  toolName: string,
  input: { device_id: string; workspace?: string; payload?: Record<string, unknown> },
) {
  return bridgeRpc<string>(ctx, "bridge_enqueue_job", {
    _client_id: bridgeClientId(ctx),
    _device_id: input.device_id,
    _tool_name: toolName,
    _workspace: input.workspace ?? null,
    _payload: input.payload ?? {},
  });
}

export const devicesList = defineTool({
  name: "devices_list",
  title: "List paired devices",
  description: "List paired devices this authenticated caller is explicitly authorized to use.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    try {
      const result = await bridgeRpc(ctx, "bridge_devices_for_caller", {
        _client_id: bridgeClientId(ctx),
      });
      return ok(result);
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const workspaceInspect = defineTool({
  name: "workspace_inspect",
  title: "Inspect approved workspace",
  description:
    "Queue a read-only inspection of an approved workspace on a paired device. Returns a job ID.",
  inputSchema: {
    device_id: deviceId,
    workspace,
    request: z
      .string()
      .min(1)
      .max(2000)
      .describe("What to inspect; connector remains restricted to the approved workspace."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ device_id, workspace, request }, ctx) => {
    try {
      const id = await enqueue(ctx, "workspace_inspect", {
        device_id,
        workspace,
        payload: { request },
      });
      return ok({ job_id: id });
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const workspaceApplyPatch = defineTool({
  name: "workspace_apply_patch",
  title: "Apply patch to approved workspace",
  description:
    "Queue a unified text patch for an approved workspace. The connector must reject paths outside its local allowlist.",
  inputSchema: {
    device_id: deviceId,
    workspace,
    patch: z.string().min(1).max(200_000).describe("Unified diff patch."),
    rationale: z.string().min(1).max(2000).optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ device_id, workspace, patch, rationale }, ctx) => {
    try {
      const id = await enqueue(ctx, "workspace_apply_patch", {
        device_id,
        workspace,
        payload: { patch, rationale: rationale ?? null },
      });
      return ok({ job_id: id });
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const jobStart = defineTool({
  name: "job_start",
  title: "Start approved development job",
  description:
    "Queue a constrained build, test, lint, typecheck, or development task in an approved workspace. Raw arbitrary shell commands are not accepted.",
  inputSchema: {
    device_id: deviceId,
    workspace,
    job_type: z.enum(["build", "test", "lint", "typecheck", "dev_smoke"]),
    target: z.string().min(1).max(240).optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ device_id, workspace, job_type, target }, ctx) => {
    try {
      const id = await enqueue(ctx, "job_start", {
        device_id,
        workspace,
        payload: { job_type, target: target ?? null },
      });
      return ok({ job_id: id });
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const jobStatus = defineTool({
  name: "job_status",
  title: "Get bridge job status",
  description:
    "Read progress, result, and error state for a bridge job owned by this authenticated caller.",
  inputSchema: { job_id: jobId },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ job_id }, ctx) => {
    try {
      const result = await bridgeRpc(ctx, "bridge_job_status", {
        _client_id: bridgeClientId(ctx),
        _job_id: job_id,
      });
      return ok(result);
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const jobCancel = defineTool({
  name: "job_cancel",
  title: "Cancel bridge job",
  description: "Request cancellation of a queued or running bridge job owned by this caller.",
  inputSchema: { job_id: jobId },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ job_id }, ctx) => {
    try {
      const result = await bridgeRpc(ctx, "bridge_cancel_job", {
        _client_id: bridgeClientId(ctx),
        _job_id: job_id,
      });
      return ok(result);
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const browserTest = defineTool({
  name: "browser_test",
  title: "Run browser test",
  description:
    "Queue a browser test against an explicitly supplied local, preview, staging, or approved Reson8 URL.",
  inputSchema: {
    device_id: deviceId,
    workspace,
    url: z
      .string()
      .url()
      .max(2000)
      .refine((value) => {
        const u = new URL(value);
        const host = u.hostname.toLowerCase();
        return (
          host === "localhost" ||
          host === "127.0.0.1" ||
          host === "reson8.life" ||
          host.endsWith(".reson8.life")
        );
      }, "URL host is outside the initial bridge browser allowlist"),
    scenario: z.string().min(1).max(4000),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async ({ device_id, workspace, url, scenario }, ctx) => {
    try {
      const id = await enqueue(ctx, "browser_test", {
        device_id,
        workspace,
        payload: { url, scenario },
      });
      return ok({ job_id: id });
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const previewCreate = defineTool({
  name: "preview_create",
  title: "Create development preview",
  description:
    "Queue creation of an isolated development preview for an approved workspace. This tool does not deploy production.",
  inputSchema: {
    device_id: deviceId,
    workspace,
    ref: z.string().min(1).max(200).optional().describe("Branch or commit reference to preview."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ device_id, workspace, ref }, ctx) => {
    try {
      const id = await enqueue(ctx, "preview_create", {
        device_id,
        workspace,
        payload: { ref: ref ?? null, production: false },
      });
      return ok({ job_id: id });
    } catch (error) {
      return errorResult(error);
    }
  },
});

export const bridgeTools = [
  devicesList,
  workspaceInspect,
  workspaceApplyPatch,
  jobStart,
  jobStatus,
  jobCancel,
  browserTest,
  previewCreate,
];
