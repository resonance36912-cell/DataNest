// Server-only ROP signature verification helpers.
import { createHmac, timingSafeEqual, createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizePersistenceMetadata } from "@/lib/rop/delivery-persistence";

export const ROP_SKEW_SECONDS = 300;
export const ROP_NONCE_TTL_SECONDS = ROP_SKEW_SECONDS * 2;
export const ROP_MAX_BODY_BYTES = 1_000_000;
export const ROP_MAX_NONCE_LENGTH = 64;

export function hashSigningKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function mintSigningKey(): { raw: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString("base64").replace(/=+$/, "");
  return { raw, hash: hashSigningKey(raw), prefix: raw.slice(0, 8) };
}

/** Sign a ROP payload using the provisioned HMAC secret (the stored sha256 verifier key). */
export function signBody(
  hmacSecret: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  return createHmac("sha256", hmacSecret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

function safeHexEq(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  return timingSafeEqual(aBuf, bBuf);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function validNonce(nonce: string): boolean {
  return nonce.length > 0 && nonce.length <= ROP_MAX_NONCE_LENGTH && !hasControlCharacter(nonce);
}

export type RopAppRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  signing_key_hash: string;
};

export type RopVerifyResult =
  | { ok: true; app: RopAppRow; rawBody: string; nonce: string }
  | { ok: false; status: number; error: string };

export async function verifyRopRequest(request: Request): Promise<RopVerifyResult> {
  const appId = request.headers.get("x-rop-app-id")?.trim();
  const ts = request.headers.get("x-rop-timestamp")?.trim();
  const nonce = request.headers.get("x-rop-nonce")?.trim();
  const sig = request.headers.get("x-rop-signature")?.trim();
  if (!appId || !ts || !nonce || !sig) {
    return { ok: false, status: 400, error: "Missing ROP headers" };
  }
  if (!validNonce(nonce)) return { ok: false, status: 400, error: "Invalid nonce" };
  if (!/^\d+$/.test(ts)) return { ok: false, status: 400, error: "Invalid timestamp" };

  const tsNum = Number(ts);
  if (!Number.isSafeInteger(tsNum)) return { ok: false, status: 400, error: "Invalid timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > ROP_SKEW_SECONDS) {
    return { ok: false, status: 401, error: "Timestamp skew too large" };
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > ROP_MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Body too large" };
  }

  const { data: app, error } = await supabaseAdmin
    .from("hub_apps")
    .select("id, slug, name, status, signing_key_hash")
    .eq("id", appId)
    .maybeSingle();
  if (error || !app) return { ok: false, status: 401, error: "Unknown app" };
  const row = app as unknown as RopAppRow;
  if (row.status !== "active") return { ok: false, status: 403, error: "App not active" };

  const expected = signBody(row.signing_key_hash, ts, nonce, rawBody);
  if (!safeHexEq(expected, sig)) return { ok: false, status: 401, error: "Bad signature" };

  const { data: consumed, error: nonceError } = await supabaseAdmin.rpc("consume_rop_nonce", {
    _app_id: row.id,
    _nonce: nonce,
    _request_timestamp: tsNum,
    _ttl_seconds: ROP_NONCE_TTL_SECONDS,
  });
  if (nonceError) return { ok: false, status: 503, error: "Replay protection unavailable" };
  if (!consumed) return { ok: false, status: 409, error: "Replay detected" };

  return { ok: true, app: row, rawBody, nonce };
}

export async function logAudit(
  appId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
  opts: {
    actorKind?: string;
    actorUserId?: string | null;
    entityType?: string;
    entityId?: string;
  } = {},
) {
  try {
    await supabaseAdmin.from("hub_audit_events").insert({
      app_id: appId,
      actor_kind: opts.actorKind ?? "app",
      event_type: eventType,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      payload: sanitizePersistenceMetadata(payload) as never,
      actor_user_id: opts.actorUserId ?? null,
    });
  } catch (e) {
    console.error("[rop] audit insert failed", e);
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
