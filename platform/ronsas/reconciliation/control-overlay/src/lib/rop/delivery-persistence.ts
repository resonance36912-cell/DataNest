export const ROP_PERSIST_MAX_STRING = 512;
export const ROP_PERSIST_MAX_ARRAY = 25;
export const ROP_PERSIST_MAX_KEYS = 50;
export const ROP_PERSIST_MAX_DEPTH = 4;

const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "headers",
  "requestheaders",
  "responseheaders",
  "xropsignature",
  "signature",
  "hmacsecret",
  "signingkey",
  "rawsigningkey",
  "token",
  "accesstoken",
  "refreshtoken",
  "password",
  "secret",
  "requestbody",
  "responsebody",
  "rawbody",
  "body",
]);

export type DeliveryBodySummary = {
  sha256: string;
  bytes: number;
};

export type DeliveryPersistenceRecord = {
  destination_origin: string;
  method: string;
  request: DeliveryBodySummary;
  response: DeliveryBodySummary | null;
  status_code: number | null;
  outcome: string;
  duration_ms: number | null;
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function truncateString(value: string): string {
  if (value.length <= ROP_PERSIST_MAX_STRING) return value;
  return `${value.slice(0, ROP_PERSIST_MAX_STRING)}…${TRUNCATED}`;
}

export function sanitizePersistenceMetadata(value: unknown, depth = 0): unknown {
  if (depth > ROP_PERSIST_MAX_DEPTH) return TRUNCATED;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value
      .slice(0, ROP_PERSIST_MAX_ARRAY)
      .map((entry) => sanitizePersistenceMetadata(entry, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, ROP_PERSIST_MAX_KEYS)) {
      output[key] = SENSITIVE_KEYS.has(normalizeKey(key))
        ? REDACTED
        : sanitizePersistenceMetadata(entry, depth + 1);
    }
    return output;
  }
  return truncateString(String(value));
}

function toBytes(body: string | Uint8Array): Uint8Array {
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function summarizeDeliveryBody(
  body: string | Uint8Array,
): Promise<DeliveryBodySummary> {
  const bytes = toBytes(body);
  return { sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
}

function normalizeDestinationOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Invalid delivery destination origin.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Delivery destination origin must be credential-free HTTPS.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Delivery destination must be a bare origin.");
  }
  return url.origin;
}

function normalizeMethod(value: string): string {
  const method = value.trim().toUpperCase();
  if (!/^[A-Z]{1,16}$/.test(method)) throw new Error("Invalid delivery method metadata.");
  return method;
}

function normalizeOutcome(value: string): string {
  const outcome = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(outcome)) {
    throw new Error("Invalid delivery outcome metadata.");
  }
  return outcome;
}

function normalizeStatusCode(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    throw new Error("Invalid delivery status code metadata.");
  }
  return value;
}

function normalizeDuration(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 86_400_000) {
    throw new Error("Invalid delivery duration metadata.");
  }
  return Math.round(value);
}

export async function buildDeliveryPersistenceRecord(input: {
  destinationOrigin: string;
  method: string;
  requestBody: string | Uint8Array;
  responseBody?: string | Uint8Array | null;
  statusCode?: number | null;
  outcome: string;
  durationMs?: number | null;
}): Promise<DeliveryPersistenceRecord> {
  return {
    destination_origin: normalizeDestinationOrigin(input.destinationOrigin),
    method: normalizeMethod(input.method),
    request: await summarizeDeliveryBody(input.requestBody),
    response:
      input.responseBody === undefined || input.responseBody === null
        ? null
        : await summarizeDeliveryBody(input.responseBody),
    status_code: normalizeStatusCode(input.statusCode),
    outcome: normalizeOutcome(input.outcome),
    duration_ms: normalizeDuration(input.durationMs),
  };
}
