# ROP Hub — Edge Function Stubs (portable)

These are drop-in TypeScript files for the **Resonance Hub** Supabase
project. They implement the HMAC-verified ingest surface defined in
`docs/resonance-optimization-protocol.md`.

## Layout

```
supabase/functions/
├── _shared/
│   ├── rop-verify.ts        # HMAC verification + JSON response helpers
│   └── rop-lookups.ts       # live hub_apps lookup + atomic nonce consumption
├── rop-ingest-perf/index.ts        # batch perf events
├── rop-ingest-suggestion/index.ts  # one suggestion (idempotent)
└── rop-ingest-applied/index.ts     # lifecycle update + tunable upsert
```

## Required Hub secrets

| Name                        | Purpose       |
| --------------------------- | ------------- |
| `SUPABASE_URL`              | auto-injected |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected |

Per-app raw signing keys are not stored in Hub environment variables. The Hub
verifies with the derived `hmac_secret` persisted as `hub_apps.signing_key_hash`.

## Wire protocol (recap)

Headers on every signed request:

- `x-rop-app-id`     — `hub_apps.id`
- `x-rop-timestamp`  — unix seconds (±300 s tolerance)
- `x-rop-nonce`      — random, ≤64 chars
- `x-rop-signature`  — `hex(hmac_sha256(hmac_secret, "${ts}.${nonce}.${rawBody}"))`

Body is JSON; size cap 1 MB; perf batches capped at 500 events. Every nonce is consumed atomically and may be used only once per app within the replay window.

## Portable reference coverage and remaining admission gates

This tree now contains reference implementations for signed ingest, broadcast pulls,
admin key registration/rotation, and the Hub cron paths. It remains reference material,
not an authorization to copy the developer Hub control plane wholesale into RONSAS.

Before direct control-plane promotion, the remaining admission gates are:

1. validate every outbound control destination against an explicit origin allowlist;
2. constrain or redact persisted request/response delivery bodies;
3. review the pull-config schema independently from outbound push support; and
4. deploy the `hub_rop_nonces` / `consume_rop_nonce` schema before enabling nonce-required traffic.

## Manual test snippet

```bash
APP_ID=...
HMAC_SECRET=...
TS=$(date +%s)
NONCE=$(openssl rand -hex 8)
BODY='{"events":[{"event_type":"render_job.completed","scope":"storyboard","metric":"duration_ms","value_num":12450,"tags":{"provider":"wan25"},"client_ts":"2026-06-21T01:23:45.000Z"}]}'
SIG=$(printf "%s.%s.%s" "$TS" "$NONCE" "$BODY" | openssl dgst -sha256 -hmac "$HMAC_SECRET" -hex | awk '{print $2}')

curl -X POST "$HUB_URL/functions/v1/rop-ingest-perf" \
  -H "Content-Type: application/json" \
  -H "x-rop-app-id: $APP_ID" \
  -H "x-rop-timestamp: $TS" \
  -H "x-rop-nonce: $NONCE" \
  -H "x-rop-signature: $SIG" \
  -d "$BODY"
```
