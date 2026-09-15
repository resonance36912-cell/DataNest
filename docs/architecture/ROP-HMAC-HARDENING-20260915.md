# ROP HMAC hardening - 2026-09-15

This change establishes one RONSAS wire protocol for authenticated ROP traffic and closes the replay gap identified during Hub semantic reconciliation.

## Canonical wire protocol

Every signed request carries:

- `x-rop-app-id`: registered `hub_apps.id`
- `x-rop-timestamp`: Unix seconds
- `x-rop-nonce`: fresh opaque nonce, 1-64 characters
- `x-rop-signature`: 64-hex HMAC-SHA256

The signature input is exactly `timestamp.nonce.raw_body`.

The HMAC key is the provisioned `hmac_secret`, defined as `sha256(raw_signing_key)`. The derived value is stored in `hub_apps.signing_key_hash` and is the operational signing/verifier key. The one-time raw provisioning key is not required by ingest runtimes.

## Replay and request controls

RONSAS accepts timestamps within +/- 300 seconds and caps request bodies at 1 MB. Each authenticated nonce is consumed atomically in `hub_rop_nonces`, keyed by `(app_id, nonce)`, with a 600-second replay window.

Nonce consumption is exposed only to `service_role`. If replay storage is unavailable, verification fails closed with a service-unavailable response; a repeated nonce is rejected as a replay.

The portable reference verifier does not cache `signing_key_hash`, so app suspension, key rotation, and key revocation take effect on the next request.

## Compatibility boundary

Legacy `x-rop-app` requests and signatures over `timestamp.body` are intentionally rejected. The nonce migration must be deployed before nonce-required client traffic is activated.

This branch does not modify the preserved developer `resonance-hub` working tree or the Ealiophin production tree.

## Validation

- ROP protocol regression tests: 4 passed
- RONSAS unit suite: 336 passed, 0 failed
- TypeScript `tsc --noEmit`: passed
- Repository core gates: passed

## Remaining Hub control-plane admission gates

1. Enforce an explicit allowlist for every outbound control destination origin.
2. Constrain or redact persisted control request/response bodies.
3. Review the pull-config schema independently from outbound push support.
