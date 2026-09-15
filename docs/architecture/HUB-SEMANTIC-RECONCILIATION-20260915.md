# Developer Hub semantic reconciliation — 2026-09-15

RONSAS `main` at `f3e9449` and `resonance-hub` `main` at `0a48e34` have no Git merge base. The Hub is therefore a semantic import source, not a merge parent.

## Immutable tree inventory

- RONSAS tracked files: 367
- Hub tracked files: 636
- Shared paths: 278
- Byte-identical shared paths: 194
- Shared paths with different content: 84
- Hub-only paths: 358
- RONSAS-only paths: 89

The Hub remote tracks a top-level `.env`. Its contents were not read and must never be promoted into RONSAS, CI artifacts, or audit bundles.

## Promotion policy

1. Do not merge the Hub Git history into RONSAS.
2. Do not copy the Hub working tree wholesale.
3. Review Hub-only and differing paths semantically by functional area.
4. Reimplement or selectively import only validated changes on review branches.
5. Preserve RONSAS-only governance, topology, security, and recovered-integration material.
6. Production Hub and runtime-stage drift remain separate evidence sources and require Ealiophin access before promotion.

The full path inventory is `.ronsas/reconciliation/hub-developer-20260915.json`.

## Semantic decision 1 — admin access

**Decision:** reject the Hub admin-access replacement as a security regression.

The Hub head (`0a48e34`, “Added admin access page”) adds `src/lib/admin-access.functions.ts` and replaces the existing `/admin/access` route with a read-only diagnostics view. RONSAS already carries a hardened first-admin bootstrap implementation across `src/lib/admin-bootstrap.core.ts`, `src/lib/admin-bootstrap.functions.ts`, `src/routes/admin.access.tsx`, its dedicated test, and migration `20260821000000_secure_first_admin_bootstrap.sql`.

The RONSAS flow requires a fresh short-lived, single-use email proof, scrubs the bootstrap token from the URL, re-checks eligibility server-side, and uses a permanent one-time bootstrap marker. Replacing it with the Hub route would remove those controls.

The Hub diagnostics helper may be reconsidered later only as a separate read-only diagnostic capability after independent authorization and data-exposure review. It must not replace or weaken the sovereign bootstrap path.

## Semantic decision 2 — Hub control plane

**Decision:** defer direct import until the ROP authentication protocol is hardened and unified.

The Hub adds outbound control push/probe helpers and a signed pull-config endpoint. Its outbound HMAC signs `timestamp.body` without a nonce. The current RONSAS runtime ROP verifier also uses `timestamp.body`, while the portable ROP contract under `docs/hub/functions/_shared/rop-verify.ts` requires `timestamp.nonce.body` and an `x-rop-nonce` header. This mismatch must be resolved before adding another control surface.

Admission requirements: unify runtime and portable signatures with nonce/replay rejection; validate outbound destination origins against an explicit allowlist; constrain or redact persisted request/response delivery bodies; and review the pull-config schema separately from outbound push support.
