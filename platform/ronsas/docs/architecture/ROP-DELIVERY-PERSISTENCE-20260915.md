# ROP Delivery Persistence Hardening

Date: 2026-09-15
Status: Gate 3 implementation

## Decision

ROP must not persist raw outbound request bodies, raw response bodies, transport headers, cookies, authorization values, HMAC signatures, provisioning keys, tokens, passwords, or secrets.

The current RONSAS ROP control plane has no generic outbound delivery ledger containing raw request/response bodies. This hardening preserves that safer state instead of introducing such a ledger.

If delivery-attempt persistence is added, the canonical record is limited to:

- normalized destination origin;
- bounded HTTP method, status, outcome, and duration metadata;
- SHA-256 plus byte count for request content; and
- SHA-256 plus byte count for response content when present.

Raw request and response bytes are transient execution data only.

## Audit-event protection

Both the RONSAS runtime audit helper and the portable Hub reference helper sanitize audit metadata immediately before persistence. Sensitive keys are recursively replaced with `[REDACTED]`; strings, arrays, object key counts, and nesting depth are bounded.

This protects the persistence sink even if a future caller accidentally supplies transport material in an audit payload. Existing structured audit metadata such as counts, slugs, target scopes, statuses, and bounded notes remains available.

## Blocking verification

`scripts/lib/rop-delivery-persistence.test.ts` verifies hash-only delivery records, recursive redaction, bounded metadata, runtime/portable policy parity, invalid metadata rejection, and source-level persistence invariants across current ROP database-write sites.

The persistence invariant is deliberately scoped to ROP paths. PayFast webhook response caching and unrelated email infrastructure are separate domains and are not changed by this gate.

## Promotion boundary

This gate does not enable outbound push delivery. Gate 2 origin allowlisting remains mandatory at the transport boundary, and Gate 4 independently reviews pull-config schema before any additional control-plane promotion.
