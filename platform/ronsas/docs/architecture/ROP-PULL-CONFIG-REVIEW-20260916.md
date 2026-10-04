# ROP pull-config independent schema review ? 2026-09-16

## Scope

This is the independent Gate 4 review deferred by the 2026-09-15 Hub semantic reconciliation. It reviews the legacy Developer Hub route `src/routes/api/public/hub-control/pull-config.ts` separately from outbound push transport. It does not authorize a new control-plane endpoint.

## Evidence reviewed

- Canonical RONSAS contains no `src/routes/api/public/hub-control/pull-config.ts` route and no portable `rop-pull-config` function.
- The deferred route was recovered read-only from Developer Hub Git history at commit `f7ef30755fd9960f0ed827e75d3d38c8781993bd`.
- The legacy response mixed feature flags, tunables, the active product catalog, and approved suggestions in one payload.
- The legacy product projection included arbitrary `metadata`; flags/tunables exposed generic values; suggestion payloads exposed `proposed_change` and `evidence`.
- The legacy `since` cursor was supplied in the URL query rather than the signed request body.
- The legacy suggestions query required `status = approved` but did not require `broadcast = true`.
- Current OpenNova app and integration source trees have no active consumer of `/api/public/hub-control/pull-config`. Historical handoff material still documents the deferred design.

## Decision

**Do not import or recreate the legacy pull-config endpoint.**

The correct Gate 4 outcome is a reviewed absence, not a runtime implementation. There is no current consumer that requires the endpoint, while the recovered schema combines several authority domains and transports unbounded/generic JSON that could become privilege-bearing in a spoke. Reintroducing it would create a new control surface without an operational need.

This review closes the independent pull-config schema gate. It does **not** enable outbound push support and does not claim that unrelated RONSAS gates are complete.

## Mandatory admission contract for any future pull-config proposal

A future implementation must be a new, separately reviewed protocol change and satisfy all of the following before admission:

1. **Pull authority is read-only and independent.** Permission to retrieve configuration must not imply outbound push, probe, signing, delivery, or execution authority. `control_enabled`, outbound destination settings, and push permissions must never be inferred from pull access.
2. **Use the canonical ROP authentication envelope.** Requests must use `x-rop-app-id`, timestamp, nonce, and HMAC over `timestamp.nonce.raw_body`. Any cursor/version belongs in the signed body, not an unsigned query parameter.
3. **Strict request schema.** Reject unknown request fields. Every field must have explicit type, length/range, and collection bounds.
4. **Strict versioned response schema.** No raw table rows and no unbounded generic metadata. Every returned field must be explicitly allowlisted and bounded.
5. **No privilege-bearing material.** Never return signing keys/hashes, auth claims, roles, admin flags, procedure keys, arbitrary headers, origin URLs, control/validation paths, network destinations, executable code/instructions, or fields that can grant delivery/execution authority.
6. **Do not multiplex broadcast suggestions into config.** Cross-app suggestions belong to the separate `rop-pull-broadcasts` feed and must retain its review/broadcast rules.
7. **Catalogs need explicit projections.** A future tier/product view must exclude arbitrary `metadata` and expose only fields independently approved for spoke consumption.
8. **Flags and tunables need typed value contracts.** Generic JSON values are not sufficient. Each allowed key/value family must have a bounded schema and documented semantics; unknown keys fail closed.
9. **Bound total payload size and collection counts.** No table may be returned without an explicit server-side row cap, and the serialized response requires an explicit maximum size.
10. **Persistence follows Gate 3.** Do not persist raw pulled config request/response bodies. Evidence records may retain hashes, byte counts, bounded non-sensitive metadata, and outcome/status only.
11. **No arbitrary outbound fetch.** A pull endpoint reads Hub-owned state and returns it to the authenticated caller; it must not accept or inherit a destination URL or perform spoke-directed fetches.
12. **Runtime/portable parity is required where both forms exist.** Method, signed body, filtering, bounds, and response schema must match before promotion.

## Related finding: pull-broadcasts parity

During this review, canonical runtime and portable `rop-pull-broadcasts` were found to have different method/input/filter behavior. That is a separate protocol-parity issue, not a reason to revive pull-config. It should be fixed in a dedicated follow-up so a breaking API change is reviewed independently.

## Regression boundary

`scripts/lib/rop-pull-config-boundary.test.ts` keeps the legacy route and portable function absent and requires this review document to retain the core separation guarantees. A future intentional implementation must update that test and this architecture decision in the same reviewed change.
