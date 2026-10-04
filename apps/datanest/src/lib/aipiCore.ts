import { timingSafeEqual } from "node:crypto";

export const AIPI_VERSION = "0.1.0";
export const AIPI_POLICY_VERSION = "resonance-aipi-v0.1";
export const AIPI_MAX_BODY_BYTES = 256 * 1024;

export type AipiChatRole = "system" | "user" | "assistant";
export type AipiChatMessage = { role: AipiChatRole; content: string };
export type AipiChatPayload = {
  model?: string;
  messages: AipiChatMessage[];
  temperature?: number;
  max_output_tokens?: number;
};
export type AipiProjectKeyBinding = { project: string; key: string };

export class AipiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message = code) {
    super(message);
    this.name = "AipiError";
    this.code = code;
    this.status = status;
  }
}

const projectPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function secretsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim() || "";
  return token || null;
}

export function parseProjectKeys(raw: string | undefined): AipiProjectKeyBinding[] {
  const bindings: AipiProjectKeyBinding[] = [];
  for (const rawEntry of (raw || "").split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const separator = entry.indexOf("=");
    if (separator < 1) continue;
    const project = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();
    if (!projectPattern.test(project) || !key) continue;
    bindings.push({ project, key });
  }
  return bindings;
}

export function authorizeProjectBearer(
  header: string | null,
  configuredBindings: string | undefined,
  project: string,
): boolean {
  const presented = bearerToken(header);
  if (!presented) return false;
  return parseProjectKeys(configuredBindings)
    .filter((binding) => binding.project === project)
    .some((binding) => secretsEqual(presented, binding.key));
}

export function parseAllowedModels(raw: string | undefined, fallback: string | undefined): string[] {
  const source = raw?.trim() || fallback?.trim() || "";
  return [...new Set(source.split(",").map((value) => value.trim()).filter(Boolean))];
}

export function requireProject(value: string | null): string {
  const project = value?.trim() || "";
  if (!projectPattern.test(project)) {
    throw new AipiError("invalid_project", 400, "A valid x-resonance-project header is required.");
  }
  return project;
}

function isChatRole(value: unknown): value is AipiChatRole {
  return value === "system" || value === "user" || value === "assistant";
}

export function validateChatPayload(
  value: unknown,
  allowedModels: string[],
): Required<Pick<AipiChatPayload, "model" | "messages">> & Pick<AipiChatPayload, "temperature" | "max_output_tokens"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AipiError("invalid_request", 400, "The request body must be a JSON object.");
  }

  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 100) {
    throw new AipiError("invalid_messages", 400, "messages must contain between 1 and 100 entries.");
  }

  const messages = input.messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new AipiError("invalid_messages", 400);
    }
    const candidate = message as Record<string, unknown>;
    if (!isChatRole(candidate.role) || typeof candidate.content !== "string") {
      throw new AipiError("invalid_messages", 400);
    }
    const content = candidate.content.trim();
    if (!content || content.length > 32_000) {
      throw new AipiError("invalid_messages", 400, "Each message must contain 1 to 32000 characters.");
    }
    return { role: candidate.role, content };
  });

  if (!allowedModels.length) {
    throw new AipiError("models_not_configured", 503, "No AiPI models are configured.");
  }

  const requestedModel = typeof input.model === "string" ? input.model.trim() : "";
  const model = requestedModel || allowedModels[0];
  if (!allowedModels.includes(model)) {
    throw new AipiError("model_not_allowed", 403, "The requested model is not allowed by AiPI policy.");
  }

  let temperature: number | undefined;
  if (input.temperature !== undefined) {
    if (typeof input.temperature !== "number" || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) {
      throw new AipiError("invalid_temperature", 400);
    }
    temperature = input.temperature;
  }

  let maxOutputTokens: number | undefined;
  if (input.max_output_tokens !== undefined) {
    if (
      typeof input.max_output_tokens !== "number" ||
      !Number.isInteger(input.max_output_tokens) ||
      input.max_output_tokens < 1 ||
      input.max_output_tokens > 16_384
    ) {
      throw new AipiError("invalid_max_output_tokens", 400);
    }
    maxOutputTokens = input.max_output_tokens;
  }

  return {
    model,
    messages,
    temperature,
    max_output_tokens: maxOutputTokens,
  };
}

export type AipiUpstreamConfig = {
  url: string;
  host: string;
  apiKey: string;
};

export function resolveUpstreamConfig(input: {
  url?: string;
  host?: string;
  apiKey?: string;
}): AipiUpstreamConfig {
  const rawUrl = input.url?.trim() || "";
  const host = input.host?.trim().toLowerCase() || "";
  const apiKey = input.apiKey?.trim() || "";
  if (!rawUrl || !host || !apiKey) {
    throw new AipiError("provider_not_configured", 503, "The AiPI upstream provider is not configured.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AipiError("provider_endpoint_rejected", 503);
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== host ||
    Boolean(url.username) ||
    Boolean(url.password) ||
    (url.port && url.port !== "443")
  ) {
    throw new AipiError("provider_endpoint_rejected", 503);
  }

  return { url: url.toString(), host, apiKey };
}

export function makeAuditEvent(input: {
  requestId: string;
  project: string;
  action: string;
  outcome: "allowed" | "denied" | "failed";
  model?: string;
  startedAtMs: number;
}) {
  return {
    event_type: "aipi_request",
    policy_version: AIPI_POLICY_VERSION,
    request_id: input.requestId,
    project: input.project,
    action: input.action,
    outcome: input.outcome,
    model: input.model || null,
    duration_ms: Math.max(0, Date.now() - input.startedAtMs),
    created_at: new Date().toISOString(),
  } as const;
}
