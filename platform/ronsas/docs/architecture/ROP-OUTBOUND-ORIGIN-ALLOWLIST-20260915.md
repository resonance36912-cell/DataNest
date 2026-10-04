# ROP Outbound Origin Allowlist

Date: 2026-09-15
Status: security gate 2 implementation

## Policy

Any `hub_apps.origin_url` intended for outbound control delivery is untrusted until it passes the shared ROP outbound-origin policy.

Allowed destinations are configured only through `ROP_OUTBOUND_ALLOWED_ORIGINS` as an explicit comma/whitespace-separated list of HTTPS origins. Database values do not extend the allowlist.

The validator normalizes with the platform URL parser and compares exact origins. It rejects non-HTTPS schemes, credentials, paths, queries, fragments, non-default ports unless explicitly allowlisted, localhost-like names, and all IP literals.

Registration without `origin_url` remains valid. Registration with an origin fails closed when the allowlist is absent or the normalized origin is not explicitly present.

## Runtime and portable parity

The canonical implementation is `src/lib/rop/origin-policy.ts`. The portable Hub copy is `docs/hub/functions/_shared/rop-origin-policy.ts`, with byte-for-byte parity enforced by tests.

Both runtime and portable app-registration paths normalize and validate `origin_url` before persistence.

Any future outbound `fetch` path MUST call `requireAllowedOutboundOrigin` again immediately before network access. Registration-time validation is not sufficient to trust a mutable database row.
