// =====================================================================
// ROP Hub - shared HMAC verifier (portable, Deno edge runtime)
// Target path in Hub project: supabase/functions/_shared/rop-verify.ts
// =====================================================================
//
// Wire protocol:
//   x-rop-app-id     : uuid of the registered hub_apps row
//   x-rop-timestamp  : unix seconds, integer
//   x-rop-nonce      : opaque random string (1..64 chars)
//   x-rop-signature  : hex(hmac_sha256(hmac_secret, `${ts}.${nonce}.${raw_body}`))
//
// `hmac_secret` is the sha256 value derived from the one-time raw signing key.
// It is returned to the app at registration/rotation and stored in
// hub_apps.signing_key_hash for verification. The raw key is never required
// by ingest runtimes.

export type RopVerifyOk = {
  ok: true;
  appId: string;
  appSlug: string;
  body: unknown;
  rawBody: string;
  nonce: string;
};

export type RopVerifyErr = {
  ok: false;
  status: number;
  error: string;
  detail?: unknown;
};

export type HubAppRow = {
  id: string;
  slug: string;
  status: string;
  signing_key_hash: string;
};

export type AppLookup = (appId: string) => Promise<HubAppRow | null>;
export type NonceConsumer = (
  appId: string,
  nonce: string,
  requestTimestamp: number,
  ttlSeconds: number,
) => Promise<boolean>;

const MAX_SKEW_SECONDS = 300;
const NONCE_TTL_SECONDS = MAX_SKEW_SECONDS * 2;
const MAX_BODY_BYTES = 1_000_000;
const MAX_NONCE_LENGTH = 64;

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256Hex(hmacSecret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(hmacSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bytesToHex(new Uint8Array(sig));
}

function validNonce(nonce: string): boolean {
  return nonce.length > 0 &&
    nonce.length <= MAX_NONCE_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(nonce);
}

export async function verifyRopRequest(
  req: Request,
  lookupApp: AppLookup,
  consumeNonce: NonceConsumer,
): Promise<RopVerifyOk | RopVerifyErr> {
  const appId = req.headers.get("x-rop-app-id")?.trim();
  const tsHeader = req.headers.get("x-rop-timestamp")?.trim();
  const nonce = req.headers.get("x-rop-nonce")?.trim();
  const signature = req.headers.get("x-rop-signature")?.trim();

  if (!appId || !tsHeader || !nonce || !signature) {
    return { ok: false, status: 400, error: "missing_rop_headers" };
  }
  if (!validNonce(nonce)) {
    return { ok: false, status: 400, error: "bad_nonce" };
  }
  if (!/^\d+$/.test(tsHeader)) {
    return { ok: false, status: 400, error: "bad_timestamp" };
  }

  const ts = Number(tsHeader);
  if (!Number.isSafeInteger(ts)) {
    return { ok: false, status: 400, error: "bad_timestamp" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401, error: "timestamp_skew" };
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "body_too_large" };
  }

  const app = await lookupApp(appId);
  if (!app) return { ok: false, status: 404, error: "unknown_app" };
  if (app.status !== "active") {
    return { ok: false, status: 403, error: `app_${app.status}` };
  }

  const expectedSig = await hmacSha256Hex(
    app.signing_key_hash,
    `${tsHeader}.${nonce}.${rawBody}`,
  );
  if (!constantTimeEqual(hexToBytes(expectedSig), hexToBytes(signature))) {
    return { ok: false, status: 401, error: "bad_signature" };
  }

  try {
    const consumed = await consumeNonce(appId, nonce, ts, NONCE_TTL_SECONDS);
    if (!consumed) return { ok: false, status: 409, error: "replay_detected" };
  } catch (e) {
    return { ok: false, status: 503, error: "replay_protection_unavailable", detail: String(e) };
  }

  let body: unknown = null;
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return { ok: false, status: 400, error: "bad_json", detail: String(e) };
    }
  }

  return { ok: true, appId, appSlug: app.slug, body, rawBody, nonce };
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-rop-app-id, x-rop-timestamp, x-rop-nonce, x-rop-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
