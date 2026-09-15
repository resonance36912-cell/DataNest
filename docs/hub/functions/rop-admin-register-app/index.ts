// =====================================================================
// ROP Hub — rop-admin-register-app
// Target path: supabase/functions/rop-admin-register-app/index.ts
// =====================================================================
//
// Mints a signing secret for a new Resonance app and records it in
// hub_apps. A raw provisioning key and its derived HMAC secret are returned
// ONCE. The target app signs with hmac_secret; only that derived verifier key
// is persisted in hub_apps.signing_key_hash.
//
// Auth: hub_admin Supabase JWT.
//
// Request:
//   {
//     "slug"        : "syncvision",
//     "name"        : "SyncVision",
//     "origin_url"  : "https://syncvision.life",
//     "workspace_id": "reson8" (optional),
//     "owner_user_id": "<auth.users.id>" (optional; grants app_owner access)
//   }
//
// Response:
//   {
//     "ok": true,
//     "app_id": "uuid",
//     "raw_signing_key": "hex string",          // provisioning material
//     "hmac_secret": "sha256(raw_signing_key)"   // actual HMAC key
//   }

import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, jsonResponse } from "../_shared/rop-verify.ts";
import { adminClient, requireHubAdmin } from "../_shared/rop-admin-auth.ts";
import { auditEvent } from "../_shared/rop-lookups.ts";
import {
  OutboundOriginPolicyError,
  requireAllowedOutboundOrigin,
  ROP_OUTBOUND_ALLOWED_ORIGINS_ENV,
} from "../_shared/rop-origin-policy.ts";

const Body = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(120),
  origin_url: z.string().url().nullish(),
  workspace_id: z.string().max(120).nullish(),
  owner_user_id: z.string().uuid().nullish(),
});

function randomSecretHex(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const auth = await requireHubAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "bad_json" }, 400);
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_body", detail: parsed.error.flatten() }, 400);
  }
  const b = parsed.data;

  let normalizedOrigin: string | null = null;
  try {
    normalizedOrigin = b.origin_url
      ? requireAllowedOutboundOrigin(
          b.origin_url,
          Deno.env.get(ROP_OUTBOUND_ALLOWED_ORIGINS_ENV),
        )
      : null;
  } catch (error) {
    const status =
      error instanceof OutboundOriginPolicyError && error.code === "allowlist_unconfigured"
        ? 503
        : 400;
    return jsonResponse({
      error: "outbound_origin_rejected",
      detail: error instanceof Error ? error.message : "Outbound origin rejected.",
    }, status);
  }

  const admin = adminClient();
  const secret = randomSecretHex();
  const hash = await sha256Hex(secret);

  const { data: app, error: insErr } = await admin
    .from("hub_apps")
    .insert({
      slug: b.slug,
      name: b.name,
      origin_url: normalizedOrigin,
      workspace_id: b.workspace_id ?? null,
      signing_key_hash: hash,
      signing_key_prefix: secret.slice(0, 8),
      status: "active",
      created_by: auth.userId,
      metadata: {},
    })
    .select("id, slug")
    .single();

  if (insErr) {
    const status = insErr.code === "23505" ? 409 : 500; // unique violation
    return jsonResponse({ error: insErr.message }, status);
  }

  // Optional: grant the supplied user `app_owner` access to this app.
  if (b.owner_user_id) {
    await admin.from("hub_app_access").insert({
      app_id: app.id,
      user_id: b.owner_user_id,
    });
  }

  await auditEvent({
    appId: app.id,
    actorKind: "hub_admin",
    eventType: "app.registered",
    entityType: "hub_apps",
    entityId: app.id,
    payload: { slug: app.slug, prefix: secret.slice(0, 8) },
  });

  // SECURITY: provisioning material is returned ONCE. The app signs with
  // hmac_secret, which is also the verifier key stored in hub_apps. The raw
  // signing key is not needed by ingest runtimes and is never persisted.
  return jsonResponse({
    ok: true,
    app_id: app.id,
    slug: app.slug,
    raw_signing_key: secret,
    hmac_secret: hash,
    next_steps: [
      "Paste hmac_secret into the target app's HUB_SIGNING_KEY secret",
      "Generate a fresh x-rop-nonce for every signed request",
    ],
  });
});
