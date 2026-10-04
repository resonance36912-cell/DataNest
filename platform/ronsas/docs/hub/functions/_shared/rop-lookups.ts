// =====================================================================
// ROP Hub - shared lookups for verifier (portable)
// Target path in Hub project: supabase/functions/_shared/rop-lookups.ts
// =====================================================================
//
// Shared helpers used by every ingest function:
//   getAppById(appId)  -> hub_apps row with the persisted HMAC verifier key
//   consumeNonce(...)  -> atomically records a nonce and rejects replays

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AppLookup, HubAppRow, NonceConsumer } from "./rop-verify.ts";
import { sanitizePersistenceMetadata } from "./rop-delivery-persistence.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export const getAppById: AppLookup = async (appId) => {
  // Do not cache signing_key_hash: key rotations and revocations must take
  // effect on the very next request.
  const { data, error } = await admin
    .from("hub_apps")
    .select("id, slug, status, signing_key_hash")
    .eq("id", appId)
    .maybeSingle();

  if (error || !data) return null;
  return data as HubAppRow;
};

export const consumeNonce: NonceConsumer = async (appId, nonce, requestTimestamp, ttlSeconds) => {
  const { data, error } = await admin.rpc("consume_rop_nonce", {
    _app_id: appId,
    _nonce: nonce,
    _request_timestamp: requestTimestamp,
    _ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
  return data === true;
};

export async function auditEvent(opts: {
  appId: string | null;
  actorKind: "hub_admin" | "app" | "system" | "ai";
  eventType: string;
  entityType?: string;
  entityId?: string;
  payload?: unknown;
}) {
  await admin.from("hub_audit_events").insert({
    app_id: opts.appId,
    actor_kind: opts.actorKind,
    event_type: opts.eventType,
    entity_type: opts.entityType ?? null,
    entity_id: opts.entityId ?? null,
    payload: sanitizePersistenceMetadata(opts.payload ?? {}),
  });
}
